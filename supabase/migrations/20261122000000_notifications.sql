-- In-app notifications: assigned to a task, new comment on a task you're involved in, due today, overdue.
-- Rows are written only by the triggers and the daily job below; each user reads and marks their own.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  type text not null check (type in ('assigned', 'comment', 'due_today', 'overdue')),
  actor_email text,
  title text not null,
  body text,
  dedupe_key text unique, -- daily reminders: one per task per day
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications for update to authenticated using (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
-- the only thing a user may change is whether it's read
revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- live updates for the bell (realtime applies the select policy above)
alter publication supabase_realtime add table public.notifications;

-- assigned: whoever the task is (re)assigned to, unless they assigned it to themselves
create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if new.assigned_to_member is null
     or (tg_op = 'UPDATE' and new.assigned_to_member is not distinct from old.assigned_to_member) then
    return new;
  end if;
  select user_id into target from workspace_members
   where id = new.assigned_to_member and status = 'active';
  if target is not null and target is distinct from auth.uid() then
    insert into notifications (user_id, workspace_id, task_id, type, actor_email, title)
    values (target, new.workspace_id, new.id, 'assigned', auth.jwt() ->> 'email', new.name);
  end if;
  return new;
end $$;

create trigger notify_task_assigned after insert or update of assigned_to_member on public.tasks
  for each row execute function public.notify_task_assigned();

-- comment: the assignee, the creator and everyone who commented before, except the author
create or replace function public.notify_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, workspace_id, task_id, type, actor_email, title, body)
  select distinct r.uid, t.workspace_id, t.id, 'comment', new.author_email, t.name, left(new.content, 140)
  from tasks t
  cross join lateral (
    select wm.user_id as uid from workspace_members wm where wm.id = t.assigned_to_member
    union select t.created_by
    union select c.user_id from task_comments c where c.task_id = t.id
  ) r
  where t.id = new.task_id
    and r.uid is not null and r.uid <> new.user_id
    -- only people still active in this workspace
    and exists (select 1 from workspace_members m where m.workspace_id = t.workspace_id and m.user_id = r.uid and m.status = 'active');
  return new;
end $$;

create trigger notify_task_comment after insert on public.task_comments
  for each row execute function public.notify_task_comment();

-- daily: due today / overdue since yesterday, to the assignee (or the creator when unassigned)
create or replace function public.notify_due_tasks() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, workspace_id, task_id, type, title, dedupe_key)
  select coalesce(wm.user_id, t.created_by), t.workspace_id, t.id,
         case when t.due_date = current_date then 'due_today' else 'overdue' end,
         t.name,
         t.id || ':' || current_date
  from tasks t
  left join workspace_members wm on wm.id = t.assigned_to_member and wm.status = 'active'
  where t.status <> 'done'
    and t.due_date in (current_date, current_date - 1)
    and coalesce(wm.user_id, t.created_by) is not null
  on conflict (dedupe_key) do nothing;
  -- keep the table small
  delete from notifications where created_at < now() - interval '60 days';
end $$;

revoke execute on function public.notify_task_assigned(), public.notify_task_comment(), public.notify_due_tasks() from public, anon, authenticated;

-- shortcut: runs at 06:00 UTC for everyone; per-user time zones would need a time zone column
select cron.schedule('notify-due-tasks', '0 6 * * *', 'select public.notify_due_tasks()');

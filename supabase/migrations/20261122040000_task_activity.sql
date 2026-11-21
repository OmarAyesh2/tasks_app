-- Activity log per task: who changed what, written by triggers so every path (app, board, calendar) is covered.

create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  summary text not null, -- a sentence fragment: "marked it done", "changed the due date to Nov 25"
  created_at timestamptz not null default clock_timestamp() -- not now(): keeps the order of several changes saved together
);
create index task_activity_task_created on public.task_activity (task_id, created_at desc);

alter table public.task_activity enable row level security;
-- whoever can see the task can see its history (the tasks policy applies inside this check)
create policy "read activity of visible tasks" on public.task_activity for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_activity.task_id));
revoke all on public.task_activity from anon;
revoke insert, update, delete on public.task_activity from authenticated;

create or replace function public.log_task_activity(p_task uuid, p_workspace uuid, p_summary text) returns void
language sql security definer set search_path = public as $$
  insert into task_activity (task_id, workspace_id, actor_id, actor_email, summary)
  values (p_task, p_workspace, auth.uid(), auth.jwt() ->> 'email', p_summary);
$$;

create or replace function public.track_task_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label text;
  ticked text; added int; removed int; first_added text;
begin
  if tg_op = 'INSERT' then
    perform log_task_activity(new.id, new.workspace_id, 'created the task');
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_task_activity(new.id, new.workspace_id, case new.status
      when 'done' then 'marked it done' when 'in_progress' then 'moved it to In progress' else 'moved it back to To do' end);
  end if;
  if new.name is distinct from old.name then
    perform log_task_activity(new.id, new.workspace_id, format('renamed it to "%s"', new.name));
  end if;
  if new.description is distinct from old.description then
    perform log_task_activity(new.id, new.workspace_id, 'edited the description');
  end if;
  if new.assigned_to_member is distinct from old.assigned_to_member then
    select split_part(email, '@', 1) into label from workspace_members where id = new.assigned_to_member;
    perform log_task_activity(new.id, new.workspace_id, case when new.assigned_to_member is null then 'unassigned it' else format('assigned it to %s', coalesce(label, 'someone')) end);
  end if;
  if new.due_date is distinct from old.due_date then
    perform log_task_activity(new.id, new.workspace_id, case when new.due_date is null then 'removed the due date' else format('set the due date to %s', to_char(new.due_date, 'Mon FMDD')) end);
  end if;
  if new.priority is distinct from old.priority then
    perform log_task_activity(new.id, new.workspace_id, case when new.priority is null then 'removed the priority' else format('set the priority to %s', new.priority) end);
  end if;
  if new.project_id is distinct from old.project_id then
    select name into label from projects where id = new.project_id;
    perform log_task_activity(new.id, new.workspace_id, case when new.project_id is null then 'removed it from its project' else format('moved it to the %s project', coalesce(label, 'another')) end);
  end if;
  if new.recurrence is distinct from old.recurrence then
    perform log_task_activity(new.id, new.workspace_id, case when new.recurrence is null then 'stopped it repeating' else format('set it to repeat %s', new.recurrence) end);
  end if;

  -- checklist: ticks one by one, additions/removals summarised (AI break-down adds many at once)
  if new.sub_tasks is distinct from old.sub_tasks then
    for ticked, label in
      select n.value ->> 'text', case when (n.value ->> 'done')::boolean then 'ticked' else 'unticked' end
      from jsonb_array_elements(coalesce(new.sub_tasks, '[]')) n
      join jsonb_array_elements(coalesce(old.sub_tasks, '[]')) o on o.value ->> 'text' = n.value ->> 'text'
      where (n.value ->> 'done') is distinct from (o.value ->> 'done')
    loop
      perform log_task_activity(new.id, new.workspace_id, format('%s "%s"', label, ticked));
    end loop;
    select count(*), min(n.value ->> 'text') into added, first_added
      from jsonb_array_elements(coalesce(new.sub_tasks, '[]')) n
      where not exists (select 1 from jsonb_array_elements(coalesce(old.sub_tasks, '[]')) o where o.value ->> 'text' = n.value ->> 'text');
    select count(*) into removed
      from jsonb_array_elements(coalesce(old.sub_tasks, '[]')) o
      where not exists (select 1 from jsonb_array_elements(coalesce(new.sub_tasks, '[]')) n where n.value ->> 'text' = o.value ->> 'text');
    if added = 1 then perform log_task_activity(new.id, new.workspace_id, format('added the step "%s"', first_added));
    elsif added > 1 then perform log_task_activity(new.id, new.workspace_id, format('added %s checklist steps', added)); end if;
    if removed = 1 then perform log_task_activity(new.id, new.workspace_id, 'removed a checklist step');
    elsif removed > 1 then perform log_task_activity(new.id, new.workspace_id, format('removed %s checklist steps', removed)); end if;
  end if;
  return new;
end $$;

create trigger track_task_changes after insert or update on public.tasks
  for each row execute function public.track_task_changes();

create or replace function public.track_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_task_activity(new.task_id, new.workspace_id, 'commented');
  return new;
end $$;
create trigger track_task_comment after insert on public.task_comments
  for each row execute function public.track_task_comment();

create or replace function public.track_task_files() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_task_activity(new.task_id, new.workspace_id, format('attached "%s"', new.file_name));
  -- skip when the whole task is being deleted (its history goes with it)
  elsif exists (select 1 from tasks where id = old.task_id) then
    perform log_task_activity(old.task_id, old.workspace_id, format('removed the file "%s"', old.file_name));
  end if;
  return null;
end $$;
create trigger track_task_files after insert or delete on public.task_assets
  for each row execute function public.track_task_files();

revoke execute on function public.log_task_activity(uuid, uuid, text), public.track_task_changes(),
  public.track_task_comment(), public.track_task_files() from public, anon, authenticated;

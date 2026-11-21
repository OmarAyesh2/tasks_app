-- Recurring tasks: finishing one creates the next occurrence.

alter table public.tasks
  add column recurrence text check (recurrence in ('daily', 'weekly', 'monthly')),
  add column next_task_id uuid references public.tasks(id) on delete set null; -- the occurrence this one created

create or replace function public.spawn_next_occurrence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  step interval := case new.recurrence when 'daily' then interval '1 day' when 'weekly' then interval '1 week' else interval '1 month' end;
  next_due date := coalesce(new.due_date, current_date) + step;
  next_id uuid;
begin
  -- only on the first completion: un-ticking and re-ticking doesn't create another copy
  if new.recurrence is null or new.status <> 'done' or old.status = 'done' or new.next_task_id is not null then
    return new;
  end if;
  -- a late completion lands on the next date from today, not in the past
  while next_due < current_date loop next_due := next_due + step; end loop;

  insert into tasks (name, description, links, user_id, sub_tasks, project_id, workspace_id, assigned_to_member,
                     due_date, priority, client_id, recurrence, status, sort_order)
  values (new.name, new.description, new.links, new.user_id,
          (select coalesce(jsonb_agg(s || '{"done": false}'::jsonb), '[]'::jsonb) from jsonb_array_elements(coalesce(new.sub_tasks, '[]'::jsonb)) s),
          new.project_id, new.workspace_id, new.assigned_to_member,
          next_due, new.priority, new.client_id, new.recurrence, 'to_do', new.sort_order)
  returning id into next_id;

  insert into task_tools (task_id, tool_id) select next_id, tool_id from task_tools where task_id = new.id;

  -- this occurrence stops repeating; the new one carries the schedule on
  new.next_task_id := next_id;
  return new;
end $$;

revoke execute on function public.spawn_next_occurrence() from public, anon, authenticated;

create trigger spawn_next_occurrence before update of status on public.tasks
  for each row execute function public.spawn_next_occurrence();
-- (limit_assignee_task_edits runs first alphabetically, before next_task_id is set, so assignees can complete recurring tasks)

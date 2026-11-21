-- Assignees can work their tasks: a member assigned a task (e.g. by an admin) may change its
-- status, checklist and list order. Everything else stays with the creator and owners/admins.

drop policy if exists "Workspace task update" on public.tasks;
create policy "Workspace task update" on public.tasks for update to authenticated using (
  check_workspace_access(workspace_id, array['owner', 'admin']::workspace_permission_role[])
  or (check_workspace_access(workspace_id, array['member']::workspace_permission_role[]) and (
    created_by = (select auth.uid())
    or assigned_to_member = (
      select wm.id from workspace_members wm
      where wm.user_id = (select auth.uid()) and wm.workspace_id = tasks.workspace_id and wm.status = 'active'
      limit 1)
  ))
);

-- the policy can't limit columns, so this does: an assignee who isn't the creator or an admin
-- may only touch status, sub_tasks and sort_order
create or replace function public.limit_assignee_task_edits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null  -- service role, cron, migrations
     or old.created_by = auth.uid()
     or check_workspace_access(old.workspace_id, array['owner', 'admin']::workspace_permission_role[]) then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'sub_tasks' - 'sort_order' - 'updated_at')
     is distinct from (to_jsonb(old) - 'status' - 'sub_tasks' - 'sort_order' - 'updated_at') then
    raise exception 'Assignees can only change a task''s status and checklist'
      using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function public.limit_assignee_task_edits() from public, anon, authenticated;

create trigger limit_assignee_task_edits before update on public.tasks
  for each row execute function public.limit_assignee_task_edits();

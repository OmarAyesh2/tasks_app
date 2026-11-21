-- Security hardening (applied to production 2026-11-21).

-- 1. Members could edit their own workspace_members row, including permission_role.
create or replace function public.guard_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean;
  is_admin boolean;
begin
  if auth.uid() is null then return new; end if; -- service role / SQL editor
  -- judge an update by the workspace the row is in now, not the one it is being moved to
  is_owner := check_workspace_access(case when tg_op = 'INSERT' then new.workspace_id else old.workspace_id end, array['owner']::workspace_permission_role[]);
  is_admin := is_owner or check_workspace_access(case when tg_op = 'INSERT' then new.workspace_id else old.workspace_id end, array['admin']::workspace_permission_role[]);

  if tg_op = 'INSERT' then
    -- the first row of a new workspace is the creator's owner row (handle_new_workspace)
    if new.permission_role = 'owner' and not is_owner
       and exists (select 1 from workspace_members where workspace_id = new.workspace_id) then
      raise exception 'Only owners can add owners';
    end if;
    return new;
  end if;

  if (new.workspace_id is distinct from old.workspace_id or new.email is distinct from old.email) and not is_admin then
    raise exception 'Not allowed to change workspace or email';
  end if;
  if new.permission_role is distinct from old.permission_role then
    if not is_admin then raise exception 'Only owners and admins can change roles'; end if;
    if (new.permission_role = 'owner' or old.permission_role = 'owner') and not is_owner then
      raise exception 'Only owners can grant or remove the owner role';
    end if;
  end if;
  if new.status is distinct from old.status and not is_admin
     and not (old.status = 'invited' and new.status = 'active')
     and new.status <> 'left' then
    raise exception 'Not allowed to change membership status';
  end if;
  return new;
end $$;

create trigger tr_guard_member_change
  before insert or update on public.workspace_members
  for each row execute function public.guard_member_change();

-- 2. task_assets / task_tools / task_comments were readable and writable by every signed-in account.
--    Visibility now follows the parent task (tasks RLS applies inside the subquery).
drop policy "Enable all access for authenticated users" on public.task_assets;
create policy "Assets visible with task" on public.task_assets for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy "Assets writable by task editors" on public.task_assets for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
                 and check_workspace_access(t.workspace_id, array['owner','admin','member']::workspace_permission_role[])))
  with check (exists (select 1 from public.tasks t where t.id = task_id
                 and check_workspace_access(t.workspace_id, array['owner','admin','member']::workspace_permission_role[])));

drop policy "Enable all access for authenticated users" on public.task_tools;
create policy "Task tools visible with task" on public.task_tools for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy "Task tools writable by task editors" on public.task_tools for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
                 and check_workspace_access(t.workspace_id, array['owner','admin','member']::workspace_permission_role[])))
  with check (exists (select 1 from public.tasks t where t.id = task_id
                 and check_workspace_access(t.workspace_id, array['owner','admin','member']::workspace_permission_role[])));

drop policy "Allow full access to authenticated users" on public.task_comments;
create policy "Comments visible with task" on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy "Comment as yourself on visible tasks" on public.task_comments for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.tasks t where t.id = task_id and t.workspace_id = task_comments.workspace_id));
create policy "Delete own comments or as admin" on public.task_comments for delete to authenticated
  using (user_id = auth.uid()
         or check_workspace_access(workspace_id, array['owner','admin']::workspace_permission_role[]));

-- 3. clients ignored member status and role (viewers and removed members could edit).
drop policy "Workspace members can manage clients" on public.clients;
create policy "Clients visible to active members" on public.clients for select to authenticated
  using (check_workspace_access(workspace_id, array['owner','admin','member','viewer']::workspace_permission_role[]));
create policy "Clients writable by editors" on public.clients for all to authenticated
  using (check_workspace_access(workspace_id, array['owner','admin','member']::workspace_permission_role[]))
  with check (check_workspace_access(workspace_id, array['owner','admin','member']::workspace_permission_role[]));

-- 4. Advisor fixes: pin search_path, stop exposing SECURITY DEFINER functions over the API.
alter function public.check_workspace_access(uuid, workspace_permission_role[]) set search_path = public;
alter function public.is_workspace_owner(uuid) set search_path = public;
alter function public.enforce_task_assignment_rules() set search_path = public;
alter function public.handle_new_user_invite_link() set search_path = public;
alter function public.handle_new_workspace() set search_path = public;
alter function public.sync_member_user_id_on_invite() set search_path = public;
alter function public.handle_updated_at() set search_path = public;

-- trigger functions: nobody needs to call these directly (triggers fire regardless)
revoke execute on function public.enforce_task_assignment_rules(), public.handle_new_user_invite_link(),
  public.handle_new_workspace(), public.sync_member_user_id_on_invite(), public.guard_member_change()
  from public, anon, authenticated;
-- helpers used inside RLS policies: signed-in users only
revoke execute on function public.check_workspace_access(uuid, workspace_permission_role[]), public.is_workspace_owner(uuid)
  from public, anon;
grant execute on function public.check_workspace_access(uuid, workspace_permission_role[]), public.is_workspace_owner(uuid)
  to authenticated;

-- policies granted to "public" call those helpers; scope them to signed-in users so anon gets empty results, not errors
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' and roles = '{public}' loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;

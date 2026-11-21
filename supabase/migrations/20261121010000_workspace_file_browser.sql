-- Workspace file browser: attachments survive their task's deletion and are scoped to the workspace.

alter table public.task_assets
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  add column uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column task_name text; -- filled in when the task is deleted, so kept files keep a label

update public.task_assets a set workspace_id = t.workspace_id from public.tasks t where t.id = a.task_id;
alter table public.task_assets alter column workspace_id set not null;

-- deleting a task now detaches its files instead of deleting their records
alter table public.task_assets drop constraint task_assets_task_id_fkey;
alter table public.task_assets add constraint task_assets_task_id_fkey
  foreign key (task_id) references public.tasks(id) on delete set null;

create index task_assets_workspace_id_idx on public.task_assets (workspace_id);
create index task_assets_task_id_idx on public.task_assets (task_id);

-- workspace and uploader are set by the server, never trusted from the client
create or replace function public.set_task_asset_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  new.workspace_id := (select workspace_id from tasks where id = new.task_id);
  new.uploaded_by := auth.uid();
  return new;
end $$;
create trigger tr_task_asset_defaults before insert on public.task_assets
  for each row execute function public.set_task_asset_defaults();

-- remember the task name on its files before the task row disappears
create or replace function public.keep_task_name_on_assets()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update task_assets set task_name = old.name where task_id = old.id;
  return old;
end $$;
create trigger tr_keep_task_name_on_assets before delete on public.tasks
  for each row execute function public.keep_task_name_on_assets();

revoke execute on function public.set_task_asset_defaults(), public.keep_task_name_on_assets()
  from public, anon, authenticated;

-- Access: files on live tasks follow task visibility; files from deleted tasks are visible to
-- owners/admins and to whoever uploaded them. Owners/admins delete any file, members only their own.
drop policy "Assets visible with task" on public.task_assets;
drop policy "Assets writable by task editors" on public.task_assets;

create policy "Assets visible with task or to admins and uploader" on public.task_assets
  for select to authenticated using (
    (task_id is not null and exists (select 1 from public.tasks t where t.id = task_id))
    or (task_id is null and (
      check_workspace_access(workspace_id, array['owner','admin']::workspace_permission_role[])
      or (uploaded_by = (select auth.uid())
          and check_workspace_access(workspace_id, array['owner','admin','member','viewer']::workspace_permission_role[]))
    ))
  );

create policy "Task editors can attach files" on public.task_assets
  for insert to authenticated with check (
    exists (select 1 from public.tasks t where t.id = task_id
            and check_workspace_access(t.workspace_id, array['owner','admin','member']::workspace_permission_role[]))
  );

create policy "Admins delete any file, members their own" on public.task_assets
  for delete to authenticated using (
    check_workspace_access(workspace_id, array['owner','admin']::workspace_permission_role[])
    or (uploaded_by = (select auth.uid())
        and check_workspace_access(workspace_id, array['member']::workspace_permission_role[]))
  );

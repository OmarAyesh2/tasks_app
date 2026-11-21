-- Drive-backed file explorer: each workspace and project maps to one Drive folder.
alter table public.workspaces add column drive_folder_id text unique;
alter table public.projects add column drive_folder_id text unique;

-- Only the Drive function (service role) may set these. A client pointing one at another
-- workspace's folder would let them browse it.
create or replace function public.guard_drive_folder_id()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.role() in ('authenticated', 'anon')
     and new.drive_folder_id is distinct from (case when tg_op = 'UPDATE' then old.drive_folder_id end) then
    raise exception 'drive_folder_id is managed by the server';
  end if;
  return new;
end $$;

create trigger tr_guard_drive_folder_id before insert or update on public.workspaces
  for each row execute function public.guard_drive_folder_id();
create trigger tr_guard_drive_folder_id before insert or update on public.projects
  for each row execute function public.guard_drive_folder_id();

revoke execute on function public.guard_drive_folder_id() from public, anon, authenticated;

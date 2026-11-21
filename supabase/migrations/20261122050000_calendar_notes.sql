-- Notes on calendar days ("Follow up Abdeen" on the 25th), shared with the workspace.

create table public.calendar_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index calendar_notes_workspace_day on public.calendar_notes (workspace_id, day);

alter table public.calendar_notes enable row level security;
revoke all on public.calendar_notes from anon;

create policy "workspace reads notes" on public.calendar_notes for select to authenticated
  using (check_workspace_access(workspace_id, array['owner', 'admin', 'member', 'viewer']::workspace_permission_role[]));
create policy "members add notes" on public.calendar_notes for insert to authenticated
  with check (created_by = (select auth.uid())
    and check_workspace_access(workspace_id, array['owner', 'admin', 'member']::workspace_permission_role[]));
create policy "authors edit their notes" on public.calendar_notes for update to authenticated
  using (created_by = (select auth.uid()) and check_workspace_access(workspace_id, array['owner', 'admin', 'member']::workspace_permission_role[]))
  with check (created_by = (select auth.uid()));
create policy "authors and admins delete notes" on public.calendar_notes for delete to authenticated
  using (check_workspace_access(workspace_id, array['owner', 'admin']::workspace_permission_role[])
    or (created_by = (select auth.uid()) and check_workspace_access(workspace_id, array['member']::workspace_permission_role[])));

-- the author and their email come from the login, never from the request;
-- only the text and the day can change afterwards
revoke insert, update on public.calendar_notes from authenticated;
grant insert (workspace_id, day, body) on public.calendar_notes to authenticated;
grant update (body, day) on public.calendar_notes to authenticated;

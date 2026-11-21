-- Calendar notes become private: only the writer sees a note, unless an owner/admin assigns it
-- to a member, in which case those two see it. The assignee is notified.

alter table public.calendar_notes
  add column assigned_to uuid references auth.users(id) on delete cascade;
create index calendar_notes_assigned_to on public.calendar_notes (assigned_to) where assigned_to is not null;

drop policy if exists "workspace reads notes" on public.calendar_notes;
drop policy if exists "members add notes" on public.calendar_notes;
drop policy if exists "authors edit their notes" on public.calendar_notes;
drop policy if exists "authors and admins delete notes" on public.calendar_notes;

create policy "writer and assignee read notes" on public.calendar_notes for select to authenticated
  using ((created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
    and check_workspace_access(workspace_id, array['owner', 'admin', 'member', 'viewer']::workspace_permission_role[]));

-- anyone but viewers writes notes for themselves; only owners/admins write them for an active member
create policy "add own or assigned notes" on public.calendar_notes for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and check_workspace_access(workspace_id, array['owner', 'admin', 'member']::workspace_permission_role[])
    and (
      assigned_to is null or assigned_to = (select auth.uid())
      or (check_workspace_access(workspace_id, array['owner', 'admin']::workspace_permission_role[])
          and exists (select 1 from public.workspace_members m
                      where m.workspace_id = calendar_notes.workspace_id and m.user_id = calendar_notes.assigned_to and m.status = 'active'))
    ));

create policy "writer edits notes" on public.calendar_notes for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "writer or assignee deletes notes" on public.calendar_notes for delete to authenticated
  using (created_by = (select auth.uid()) or assigned_to = (select auth.uid()));

grant insert (workspace_id, day, body, assigned_to) on public.calendar_notes to authenticated;

-- notify the member a note was assigned to
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned', 'comment', 'due_today', 'overdue', 'note'));

create or replace function public.notify_note_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and new.assigned_to <> new.created_by then
    insert into notifications (user_id, workspace_id, type, actor_email, title, body)
    values (new.assigned_to, new.workspace_id, 'note', new.author_email, new.body, to_char(new.day, 'Dy, Mon FMDD'));
  end if;
  return new;
end $$;
revoke execute on function public.notify_note_assigned() from public, anon, authenticated;

create trigger notify_note_assigned after insert on public.calendar_notes
  for each row execute function public.notify_note_assigned();

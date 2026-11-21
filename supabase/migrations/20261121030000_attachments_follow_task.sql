-- With the Drive-backed explorer, a kept file lives on in its Drive folder, so its task link can go with the task.
-- Replaces the "keep detached rows" approach from 20261121010000.
delete from public.task_assets where task_id is null;

alter table public.task_assets drop constraint task_assets_task_id_fkey;
alter table public.task_assets add constraint task_assets_task_id_fkey
  foreign key (task_id) references public.tasks(id) on delete cascade;

drop trigger tr_keep_task_name_on_assets on public.tasks;
drop function public.keep_task_name_on_assets();
alter table public.task_assets drop column task_name;

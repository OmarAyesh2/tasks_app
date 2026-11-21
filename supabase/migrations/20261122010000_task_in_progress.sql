-- Kanban board: a middle column between to-do and done.
alter type public.task_status add value if not exists 'in_progress' before 'done';

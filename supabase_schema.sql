-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- TASKS TABLE
create table tasks (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  status text not null default 'to_do' check (status in ('to_do', 'done')),
  links jsonb default '[]'::jsonb, -- Array of { name: string, url: string }
  sub_tasks jsonb default '[]'::jsonb, -- Array of { text: string, done: boolean }
  user_id uuid references auth.users(id) -- Optional: to track creator, but RLS will allow all to view/edit
);

-- TOOLS TABLE
create table tools (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  link text not null,
  category text,
  user_id uuid references auth.users(id) -- Optional
);

-- ROW LEVEL SECURITY (RLS)
-- Goal: Allow any authenticated user to read/write all rows (shared workspace)

alter table tasks enable row level security;
alter table tools enable row level security;

-- Policy for TASKS: Allow full access to authenticated users
create policy "Allow full access to authenticated users"
  on tasks
  for all
  to authenticated
  using (true)
  with check (true);

-- Policy for TOOLS: Allow full access to authenticated users
create policy "Allow full access to authenticated users"
  on tools
  for all
  to authenticated
  using (true)
  with check (true);

-- TASK_TOOLS JUNCTION TABLE (many-to-many)
create table task_tools (
  id uuid default uuid_generate_v4() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  tool_id uuid references tools(id) on delete cascade not null,
  unique(task_id, tool_id)
);

alter table task_tools enable row level security;

create policy "Allow full access to authenticated users"
  on task_tools
  for all
  to authenticated
  using (true)
  with check (true);

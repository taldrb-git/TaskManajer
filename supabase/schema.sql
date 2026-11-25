-- סכמת מסד הנתונים לסנכרון בין מכשירים.
-- הדביקו את כל הקובץ ב-Supabase → SQL Editor → New query → Run.
-- בטוח להריץ שוב (idempotent).

create table if not exists public.lists (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null,
  color             text not null default '#2563eb',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.tasks (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null,
  notes             text not null default '',
  due               date,
  priority          smallint not null default 0 check (priority between 0 and 3),
  list_id           uuid,
  done              boolean not null default false,
  done_at           timestamptz,
  postponed         integer not null default 0,
  time              text,
  remind            integer,
  repeat            text,
  subtasks          jsonb not null default '[]'::jsonb,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- פתקים: חבילות, החזרים, קניות, שיער
create table if not exists public.notes (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board             text not null,
  title             text not null default '',
  status            smallint not null default 0 check (status between 0 and 2),
  amount            numeric,
  source            text not null default '',
  tracking          text not null default '',
  date              date,
  time              text,
  task_id           uuid,
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- עמודות שנוספו בגרסאות מאוחרות (לפרויקטים שכבר הריצו את הקובץ)
alter table public.tasks add column if not exists postponed integer not null default 0;
alter table public.tasks add column if not exists time text;
alter table public.tasks add column if not exists remind integer;
alter table public.tasks add column if not exists repeat text;
-- ערכי החזרה המותרים (נבנה מחדש בכל הרצה, כדי שערכים חדשים כמו biweekly ייכנסו)
alter table public.tasks drop constraint if exists tasks_repeat_check;
alter table public.tasks add constraint tasks_repeat_check check (repeat in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'));
alter table public.tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists deleted_at timestamptz;

create index if not exists lists_sync_idx on public.lists (user_id, server_updated_at);
create index if not exists tasks_sync_idx on public.tasks (user_id, server_updated_at);
alter table public.notes add column if not exists time text;
alter table public.notes add column if not exists task_id uuid;

-- הלוחות המותרים (נבנה מחדש בכל הרצה, כדי שלוחות חדשים ייכנסו)
alter table public.notes drop constraint if exists notes_board_check;
alter table public.notes add constraint notes_board_check check (board in ('shopping', 'packages', 'refunds', 'hair', 'lashes', 'pills'));

create index if not exists notes_sync_idx on public.notes (user_id, server_updated_at);

-- חותמת זמן של השרת – לפיה כל מכשיר יודע מה השתנה מאז הסנכרון האחרון
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists lists_touch on public.lists;
create trigger lists_touch before insert or update on public.lists
  for each row execute function public.touch_server_updated_at();

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.touch_server_updated_at();

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before insert or update on public.notes
  for each row execute function public.touch_server_updated_at();

-- אבטחה: כל משתמש רואה ומשנה רק את הנתונים שלו
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;

drop policy if exists "own lists" on public.lists;
create policy "own lists" on public.lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- עדכונים בזמן אמת: שינוי בטלפון מופיע מיד במחשב
do $$
begin
  begin
    alter publication supabase_realtime add table public.lists;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notes;
  exception when duplicate_object then null;
  end;
end $$;

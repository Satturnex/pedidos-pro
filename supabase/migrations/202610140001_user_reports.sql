-- Proposta revisável. Não executar antes de confirmar o esquema e as permissões
-- existentes no projeto Supabase.
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('BUG', 'QUESTION', 'SUGGESTION', 'IMPROVEMENT')),
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null check (length(trim(description)) between 5 and 10000),
  expected text check (expected is null or length(expected) <= 5000),
  stage text check (stage is null or length(stage) <= 120),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH')),
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'NOT_REPRODUCED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_reports enable row level security;

create policy "Users can submit own reports"
  on public.user_reports for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users and admins can read reports"
  on public.user_reports for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and au.active = true and au.role in ('OWNER', 'ADMIN')
    )
  );

create policy "Admins can update report status"
  on public.user_reports for update to authenticated
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and au.active = true and au.role in ('OWNER', 'ADMIN')
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid() and au.active = true and au.role in ('OWNER', 'ADMIN')
    )
  );

grant select, insert, update on public.user_reports to authenticated;

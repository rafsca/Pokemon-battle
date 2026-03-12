-- =========================================================
-- Pokemon Battle - Supabase schema (auth + pro mode)
-- Esegui questo script nel SQL Editor di Supabase.
-- =========================================================

-- Utile per UUID generator (se non già presente)
create extension if not exists "pgcrypto";

-- =========================================================
-- 1) Profilo utente (usato da AuthService)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 2) Progressione modalità pro
-- =========================================================
create table if not exists public.pro_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  unlocked_starters jsonb not null default '[1,4,7]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pokémon shiny ottenuti completando la run
create table if not exists public.user_shiny_pokemon (
  user_id uuid not null references auth.users(id) on delete cascade,
  pokemon_id integer not null check (pokemon_id > 0),
  obtained_at timestamptz not null default now(),
  primary key (user_id, pokemon_id)
);

-- =========================================================
-- 3) Trigger updated_at automatico
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_pro_progress_updated_at on public.pro_progress;
create trigger trg_pro_progress_updated_at
before update on public.pro_progress
for each row execute function public.set_updated_at();

-- =========================================================
-- 4) RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.pro_progress enable row level security;
alter table public.user_shiny_pokemon enable row level security;

-- profiles: ogni utente vede/modifica solo il proprio record
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- pro_progress: ogni utente vede/modifica solo la propria progressione
drop policy if exists "pro_progress_select_own" on public.pro_progress;
create policy "pro_progress_select_own"
on public.pro_progress
for select
using (auth.uid() = user_id);

drop policy if exists "pro_progress_insert_own" on public.pro_progress;
create policy "pro_progress_insert_own"
on public.pro_progress
for insert
with check (auth.uid() = user_id);

drop policy if exists "pro_progress_update_own" on public.pro_progress;
create policy "pro_progress_update_own"
on public.pro_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- (Opzionale) consenti delete solo al proprietario
drop policy if exists "pro_progress_delete_own" on public.pro_progress;
create policy "pro_progress_delete_own"
on public.pro_progress
for delete
using (auth.uid() = user_id);

drop policy if exists "user_shiny_select_own" on public.user_shiny_pokemon;
create policy "user_shiny_select_own"
on public.user_shiny_pokemon
for select
using (auth.uid() = user_id);

drop policy if exists "user_shiny_insert_own" on public.user_shiny_pokemon;
create policy "user_shiny_insert_own"
on public.user_shiny_pokemon
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_shiny_update_own" on public.user_shiny_pokemon;
create policy "user_shiny_update_own"
on public.user_shiny_pokemon
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_shiny_delete_own" on public.user_shiny_pokemon;
create policy "user_shiny_delete_own"
on public.user_shiny_pokemon
for delete
using (auth.uid() = user_id);

-- =========================================================
-- 5) Bootstrap automatico pro_progress al signup (opzionale ma consigliato)
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pro_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- FINE
-- =========================================================

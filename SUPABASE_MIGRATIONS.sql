-- BCD (Breast Changes Detection) / VAAS (Visual Anomaly Awareness System)
-- Supabase Database Schema
-- 
-- This file contains all SQL migrations for the BCD project.
-- Execute these in your Supabase project's SQL editor under Dashboard > SQL Editor > New Query

-- ============================================================================
-- 1. Enable Required Extensions
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "http" schema extensions;
create extension if not exists "vector";


-- ============================================================================
-- 2. Create Tables
-- ============================================================================

-- Sessions table: stores user capture sessions
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  notes text,
  status text default 'completed' -- 'in_progress', 'completed', 'reviewed'
);

-- Images table: stores metadata for each captured image
create table if not exists public.images (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_type text not null, -- 'front', 'left', 'right', 'up', 'down', 'raised'
  storage_path text not null, -- storage object path
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint image_type_valid check (image_type in ('front', 'left', 'right', 'up', 'down', 'raised'))
);

-- Disclaimer acceptance: tracks when users accept the disclaimer
create table if not exists public.disclaimer_acceptance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  accepted_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User profiles (optional, for future expansion)
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Session analysis: stores per-session summary scores
create table if not exists public.session_analysis (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_change_score float,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Angle analysis: stores per-angle scores and summaries
create table if not exists public.angle_analysis (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  angle_type text not null,
  change_score float,
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint angle_type_valid check (angle_type in ('front', 'left', 'right', 'up', 'down', 'raised'))
);

-- Session embeddings (optional future use, internal only)
create table if not exists public.session_embeddings (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  embedding vector,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- ============================================================================
-- 3. Create Indexes
-- ============================================================================

create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_created_at_idx on public.sessions(created_at);
create index if not exists images_session_id_idx on public.images(session_id);
create index if not exists images_user_id_idx on public.images(user_id);
create index if not exists images_image_type_idx on public.images(image_type);
create index if not exists session_analysis_session_id_idx on public.session_analysis(session_id);
create index if not exists session_analysis_user_id_idx on public.session_analysis(user_id);
create index if not exists angle_analysis_session_id_idx on public.angle_analysis(session_id);
create index if not exists angle_analysis_user_id_idx on public.angle_analysis(user_id);
create index if not exists session_embeddings_session_id_idx on public.session_embeddings(session_id);


-- ============================================================================
-- 4. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
alter table public.sessions enable row level security;
alter table public.images enable row level security;
alter table public.disclaimer_acceptance enable row level security;
alter table public.user_profiles enable row level security;
alter table public.session_analysis enable row level security;
alter table public.angle_analysis enable row level security;
alter table public.session_embeddings enable row level security;

-- Sessions: users can only see their own sessions
drop policy if exists sessions_select_own on public.sessions;
drop policy if exists sessions_insert_own on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;

create policy sessions_select_own on public.sessions
  for select using (auth.uid() = user_id);

create policy sessions_insert_own on public.sessions
  for insert with check (auth.uid() = user_id);

create policy sessions_update_own on public.sessions
  for update using (auth.uid() = user_id);

create policy sessions_delete_own on public.sessions
  for delete using (auth.uid() = user_id);

-- Images: users can only see their own images
drop policy if exists images_select_own on public.images;
drop policy if exists images_insert_own on public.images;
drop policy if exists images_delete_own on public.images;

create policy images_select_own on public.images
  for select using (auth.uid() = user_id);

create policy images_insert_own on public.images
  for insert with check (auth.uid() = user_id);

create policy images_delete_own on public.images
  for delete using (auth.uid() = user_id);


-- ============================================================================
-- 4b. Storage Bucket & Policies (Supabase Storage)
-- ============================================================================

-- Ensure bucket exists and is private
insert into storage.buckets (id, name, public)
values ('bcd-images', 'bcd-images', false)
on conflict (id) do update set public = false;

-- Drop conflicting or legacy policies
drop policy if exists "allow_public_read" on storage.objects;
drop policy if exists "allow_upload_own_folder" on storage.objects;
drop policy if exists "allow_read_own_images" on storage.objects;

-- Users can upload to their own folder
drop policy if exists "Users can upload to own folder" on storage.objects;

create policy "Users can upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'bcd-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own images
drop policy if exists "Users can read own images" on storage.objects;

create policy "Users can read own images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'bcd-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own images
drop policy if exists "Users can delete own images" on storage.objects;

create policy "Users can delete own images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'bcd-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Disclaimer acceptance: users can only see and modify their own
drop policy if exists disclaimer_select_own on public.disclaimer_acceptance;
drop policy if exists disclaimer_insert_own on public.disclaimer_acceptance;
drop policy if exists disclaimer_update_own on public.disclaimer_acceptance;
drop policy if exists disclaimer_delete_own on public.disclaimer_acceptance;

create policy disclaimer_select_own on public.disclaimer_acceptance
  for select using (auth.uid() = user_id);

create policy disclaimer_insert_own on public.disclaimer_acceptance
  for insert with check (auth.uid() = user_id);

create policy disclaimer_update_own on public.disclaimer_acceptance
  for update using (auth.uid() = user_id);

create policy disclaimer_delete_own on public.disclaimer_acceptance
  for delete using (auth.uid() = user_id);

-- User profiles: users can see and update their own profile
drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_insert_own on public.user_profiles;
drop policy if exists user_profiles_update_own on public.user_profiles;

create policy user_profiles_select_own on public.user_profiles
  for select using (auth.uid() = id);

create policy user_profiles_insert_own on public.user_profiles
  for insert with check (auth.uid() = id);

create policy user_profiles_update_own on public.user_profiles
  for update using (auth.uid() = id);

-- Session analysis: users can only see their own analysis
drop policy if exists session_analysis_select_own on public.session_analysis;
drop policy if exists session_analysis_insert_own on public.session_analysis;
drop policy if exists session_analysis_update_own on public.session_analysis;
drop policy if exists session_analysis_delete_own on public.session_analysis;

create policy session_analysis_select_own on public.session_analysis
  for select using (auth.uid() = user_id);

create policy session_analysis_insert_own on public.session_analysis
  for insert with check (auth.uid() = user_id);

create policy session_analysis_update_own on public.session_analysis
  for update using (auth.uid() = user_id);

create policy session_analysis_delete_own on public.session_analysis
  for delete using (auth.uid() = user_id);

-- Angle analysis: users can only see their own analysis
drop policy if exists angle_analysis_select_own on public.angle_analysis;
drop policy if exists angle_analysis_insert_own on public.angle_analysis;
drop policy if exists angle_analysis_update_own on public.angle_analysis;
drop policy if exists angle_analysis_delete_own on public.angle_analysis;

create policy angle_analysis_select_own on public.angle_analysis
  for select using (auth.uid() = user_id);

create policy angle_analysis_insert_own on public.angle_analysis
  for insert with check (auth.uid() = user_id);

create policy angle_analysis_update_own on public.angle_analysis
  for update using (auth.uid() = user_id);

create policy angle_analysis_delete_own on public.angle_analysis
  for delete using (auth.uid() = user_id);

-- Session embeddings: internal only (no direct access)
drop policy if exists session_embeddings_select_none on public.session_embeddings;
drop policy if exists session_embeddings_insert_none on public.session_embeddings;
drop policy if exists session_embeddings_update_none on public.session_embeddings;
drop policy if exists session_embeddings_delete_none on public.session_embeddings;

create policy session_embeddings_select_none on public.session_embeddings
  for select using (false);

create policy session_embeddings_insert_none on public.session_embeddings
  for insert with check (false);

create policy session_embeddings_update_none on public.session_embeddings
  for update using (false);

create policy session_embeddings_delete_none on public.session_embeddings
  for delete using (false);


-- ============================================================================
-- 5. Functions for Automatic Profile Creation
-- ============================================================================

-- Auto-create user profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users to create profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================================
-- 6. Permissions and Notes
-- ============================================================================

-- NOTE: Storage bucket policies are configured in the Supabase dashboard
-- See STORAGE_SETUP.md for details on bucket configuration

-- Anon role can only use RLS policies (no direct table access)
-- Session/Images/Disclaimer tables are protected by RLS policies above
-- Only authenticated users can access their own data

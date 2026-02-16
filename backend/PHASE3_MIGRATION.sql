-- ============================================================================
-- Phase 3 Migration: Add user_id to session_embeddings
-- ============================================================================
-- Run this migration in Supabase SQL Editor after running SUPABASE_MIGRATIONS.sql

-- Add user_id column to session_embeddings table
ALTER TABLE public.session_embeddings 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS session_embeddings_user_id_idx ON public.session_embeddings(user_id);

-- Update RLS policies to use user_id (backend-only access still enforced)
-- Note: These policies prevent direct client access while allowing service role operations
DROP POLICY IF EXISTS session_embeddings_select_none ON public.session_embeddings;
DROP POLICY IF EXISTS session_embeddings_insert_none ON public.session_embeddings;
DROP POLICY IF EXISTS session_embeddings_update_none ON public.session_embeddings;
DROP POLICY IF EXISTS session_embeddings_delete_none ON public.session_embeddings;

CREATE POLICY session_embeddings_select_none ON public.session_embeddings
  FOR SELECT USING (false);

CREATE POLICY session_embeddings_insert_none ON public.session_embeddings
  FOR INSERT WITH CHECK (false);

CREATE POLICY session_embeddings_update_none ON public.session_embeddings
  FOR UPDATE USING (false);

CREATE POLICY session_embeddings_delete_none ON public.session_embeddings
  FOR DELETE USING (false);

-- Verification queries (optional)
-- Check that user_id column exists
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'session_embeddings';

-- Check indexes
-- SELECT indexname FROM pg_indexes WHERE tablename = 'session_embeddings';

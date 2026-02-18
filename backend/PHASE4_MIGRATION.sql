-- ============================================================================
-- Phase 4 Migration: Multi-angle embeddings, structured comparison layers,
--                    trend tracking
-- ============================================================================
-- Run AFTER SUPABASE_MIGRATIONS.sql and PHASE3_MIGRATION.sql
-- Execute in Supabase SQL Editor: Dashboard > SQL Editor > New Query

-- ============================================================================
-- 1. angle_embeddings table
--    Stores per-angle embeddings so comparison can be done at angle level.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.angle_embeddings (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  angle_type  text NOT NULL,
  embedding   vector,          -- 2048-dim ResNet50 feature vector
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  CONSTRAINT angle_embeddings_angle_type_valid
    CHECK (angle_type IN ('front', 'left', 'right', 'up', 'down', 'raised'))
);

CREATE INDEX IF NOT EXISTS angle_embeddings_session_id_idx
  ON public.angle_embeddings(session_id);
CREATE INDEX IF NOT EXISTS angle_embeddings_user_id_idx
  ON public.angle_embeddings(user_id);
CREATE INDEX IF NOT EXISTS angle_embeddings_user_angle_idx
  ON public.angle_embeddings(user_id, angle_type);

-- RLS: backend-only access (service role bypasses these)
ALTER TABLE public.angle_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY angle_embeddings_select_none ON public.angle_embeddings
  FOR SELECT USING (false);
CREATE POLICY angle_embeddings_insert_none ON public.angle_embeddings
  FOR INSERT WITH CHECK (false);
CREATE POLICY angle_embeddings_update_none ON public.angle_embeddings
  FOR UPDATE USING (false);
CREATE POLICY angle_embeddings_delete_none ON public.angle_embeddings
  FOR DELETE USING (false);


-- ============================================================================
-- 2. Extend session_analysis with trend and baseline comparison scores
-- ============================================================================

-- trend_score: moving average of last 5 overall_change_scores for this user
ALTER TABLE public.session_analysis
  ADD COLUMN IF NOT EXISTS trend_score float;

-- rolling_baseline_score: distance from mean embedding of last 3–5 sessions
ALTER TABLE public.session_analysis
  ADD COLUMN IF NOT EXISTS rolling_baseline_score float;

-- monthly_baseline_score: distance from mean embedding of sessions in last 30 days
ALTER TABLE public.session_analysis
  ADD COLUMN IF NOT EXISTS monthly_baseline_score float;

-- lifetime_baseline_score: distance from mean embedding of all prior sessions
ALTER TABLE public.session_analysis
  ADD COLUMN IF NOT EXISTS lifetime_baseline_score float;


-- ============================================================================
-- 3. Verification queries (run manually to confirm migration applied)
-- ============================================================================

-- Check angle_embeddings table exists with correct columns:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'angle_embeddings'
-- ORDER BY ordinal_position;

-- Check new session_analysis columns:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'session_analysis'
-- ORDER BY ordinal_position;

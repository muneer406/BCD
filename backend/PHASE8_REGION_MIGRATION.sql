-- ============================================================================
-- Phase 8: Region embeddings (3×3 grid) + localized_insights on session_analysis
-- ============================================================================
-- Run in Supabase SQL Editor after prior migrations.

CREATE TABLE IF NOT EXISTS public.region_embeddings (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  angle_type    text NOT NULL,
  region_index  integer NOT NULL CHECK (region_index >= 0 AND region_index < 9),
  embedding     jsonb NOT NULL,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT region_embeddings_angle_type_valid
    CHECK (angle_type IN ('front', 'left', 'right', 'up', 'down', 'raised')),
  CONSTRAINT region_embeddings_session_angle_region_unique
    UNIQUE (session_id, angle_type, region_index)
);

CREATE INDEX IF NOT EXISTS region_embeddings_session_id_idx
  ON public.region_embeddings(session_id);
CREATE INDEX IF NOT EXISTS region_embeddings_user_id_idx
  ON public.region_embeddings(user_id);
CREATE INDEX IF NOT EXISTS region_embeddings_user_angle_idx
  ON public.region_embeddings(user_id, angle_type);

ALTER TABLE public.region_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY region_embeddings_select_none ON public.region_embeddings
  FOR SELECT USING (false);
CREATE POLICY region_embeddings_insert_none ON public.region_embeddings
  FOR INSERT WITH CHECK (false);
CREATE POLICY region_embeddings_update_none ON public.region_embeddings
  FOR UPDATE USING (false);
CREATE POLICY region_embeddings_delete_none ON public.region_embeddings
  FOR DELETE USING (false);

ALTER TABLE public.session_analysis
  ADD COLUMN IF NOT EXISTS localized_insights jsonb;

-- ============================================================
-- BCD Phase 7 Migration
-- Deployment + Dataset Collection + Trust & Reliability
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- after PHASE6_MIGRATION.sql has been applied.
--
-- IDEMPOTENT: Safe to run more than once (uses ADD COLUMN IF NOT EXISTS).
-- ============================================================


-- ============================================================
-- 1. session_analysis — new trust/scoring columns
-- ============================================================

-- angle_aware_score:
--   mean(per_angle_change_scores)
--   These are semantically distinct from the session-level embedding score:
--   overall_change_score  = cosine_distance(session_embedding, baseline_embedding)
--                           ORDER-INVARIANT — swapping angle assignments doesn't change it
--   angle_aware_score     = mean of per-angle cosine distances vs per-angle baselines
--                           ANGLE-AWARE    — captures positional/angle-assignment differences
ALTER TABLE session_analysis
    ADD COLUMN IF NOT EXISTS angle_aware_score FLOAT;

-- analysis_version:
--   Tracks which model/pipeline version produced this row.
--   Useful for detecting when rows need to be re-analyzed after model upgrades.
ALTER TABLE session_analysis
    ADD COLUMN IF NOT EXISTS analysis_version TEXT DEFAULT 'v0.7';


-- ============================================================
-- 2. analysis_logs — add confidence tracking
--    (table already exists from PHASE5_MIGRATION.sql)
-- ============================================================

ALTER TABLE analysis_logs
    ADD COLUMN IF NOT EXISTS confidence_score FLOAT;


-- ============================================================
-- 3. Verification
-- ============================================================

-- After running, confirm with:
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_name IN ('session_analysis', 'analysis_logs')
-- ORDER  BY table_name, ordinal_position;

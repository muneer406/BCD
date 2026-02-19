-- ============================================================
-- BCD Phase 6 Migration
-- EfficientNetV2-S Model Upgrade (2048-dim → 1280-dim embeddings)
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- after PHASE5_MIGRATION.sql has been applied.
--
-- ⚠️  DESTRUCTIVE MIGRATION ⚠️
--
-- The model change (ResNet50 → EfficientNetV2-S) produces incompatible
-- 1280-dim embeddings.  All previously stored 2048-dim embeddings MUST be
-- cleared.  After running this migration users will need to re-submit
-- their capture sessions for the new embeddings to be computed and stored.
--
-- IDEMPOTENCY NOTE: The DROP/ADD COLUMN steps are safe to repeat, but the
-- DELETE statements will run again on a second execution (which is harmless
-- since the tables will already be empty).
-- ============================================================


-- ============================================================
-- Step 1 — Clear incompatible 2048-dim embedding data
-- ============================================================

-- Clear JSON embedding column in session_embeddings
-- (these are the raw text/JSON vectors stored by the backend)
UPDATE session_embeddings
SET    embedding = NULL
WHERE  embedding IS NOT NULL;

-- Clear JSON embedding column in angle_embeddings
UPDATE angle_embeddings
SET    embedding = NULL
WHERE  embedding IS NOT NULL;


-- ============================================================
-- Step 2 — Replace vector(2048) columns with vector(1280)
-- ============================================================

-- session_embeddings
ALTER TABLE session_embeddings
    DROP COLUMN IF EXISTS embedding_vector;

ALTER TABLE session_embeddings
    ADD COLUMN IF NOT EXISTS embedding_vector vector(1280);

-- angle_embeddings
ALTER TABLE angle_embeddings
    DROP COLUMN IF EXISTS embedding_vector;

ALTER TABLE angle_embeddings
    ADD COLUMN IF NOT EXISTS embedding_vector vector(1280);


-- ============================================================
-- Step 3 — (Re)create HNSW vector indexes for the new dimension
-- ============================================================
--
-- HNSW gives sub-linear approximate nearest-neighbour search.
-- Use cosine distance because embeddings are computed from a
-- classification backbone and benefit from direction-based similarity.
--
-- Comment out if pgvector < 0.5.0 is installed (use IVFFlat instead).

DROP INDEX IF EXISTS session_embeddings_vector_idx;
CREATE INDEX IF NOT EXISTS session_embeddings_vector_idx
    ON session_embeddings USING hnsw (embedding_vector vector_cosine_ops);

DROP INDEX IF EXISTS angle_embeddings_vector_idx;
CREATE INDEX IF NOT EXISTS angle_embeddings_vector_idx
    ON angle_embeddings USING hnsw (embedding_vector vector_cosine_ops);


-- ============================================================
-- Step 4 — Verification query (run manually to confirm)
-- ============================================================
--
-- Uncomment and run to confirm the migration:
--
-- SELECT
--     'session_embeddings' AS tbl,
--     COUNT(*)             AS total_rows,
--     COUNT(embedding_vector) AS rows_with_new_vector
-- FROM session_embeddings
-- UNION ALL
-- SELECT
--     'angle_embeddings',
--     COUNT(*),
--     COUNT(embedding_vector)
-- FROM angle_embeddings;
--
-- Expected: rows_with_new_vector = 0 (no embeddings yet — users must re-run
-- their sessions to generate 1280-dim vectors with the new model).

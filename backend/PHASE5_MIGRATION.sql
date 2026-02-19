-- ============================================================
-- BCD Phase 5 Migration
-- Performance, Trust, and Production Readiness
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- after PHASE4_MIGRATION.sql has been applied.
--
-- IMPORTANT: This migration is idempotent (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- It is safe to run more than once.
-- ============================================================


-- ============================================================
-- Part 4: pgvector extension + embed columns
-- Convert embedding storage from JSON text to a native vector type
-- for faster similarity search and lower storage overhead.
-- ============================================================

-- Enable pgvector (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add native vector column to session_embeddings
-- (keeps the existing JSON column for backward compatibility)
ALTER TABLE session_embeddings
    ADD COLUMN IF NOT EXISTS embedding_vector vector(2048);

-- Add native vector column to angle_embeddings
ALTER TABLE angle_embeddings
    ADD COLUMN IF NOT EXISTS embedding_vector vector(2048);

-- Migrate existing JSON embeddings → vector column (one-time backfill)
-- Only runs for rows where embedding_vector IS NULL and embedding IS NOT NULL.
DO $$
BEGIN
    UPDATE session_embeddings
    SET    embedding_vector = embedding::vector
    WHERE  embedding_vector IS NULL
      AND  embedding IS NOT NULL;
EXCEPTION WHEN others THEN
    -- If the cast fails (e.g. data format mismatch) skip silently.
    -- Re-run after fixing data or remove embedding column after full migration.
    RAISE NOTICE 'session_embeddings backfill skipped: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    UPDATE angle_embeddings
    SET    embedding_vector = embedding::vector
    WHERE  embedding_vector IS NULL
      AND  embedding IS NOT NULL;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'angle_embeddings backfill skipped: %', SQLERRM;
END;
$$;

-- Optional: vector index for fast nearest-neighbor search (HNSW)
-- Comment out if the table is still small or pgvector version < 0.5.
-- CREATE INDEX IF NOT EXISTS session_embeddings_vector_idx
--     ON session_embeddings USING hnsw (embedding_vector vector_cosine_ops);
-- CREATE INDEX IF NOT EXISTS angle_embeddings_vector_idx
--     ON angle_embeddings USING hnsw (embedding_vector vector_cosine_ops);


-- ============================================================
-- Part 9: New columns on session_analysis
-- ============================================================

ALTER TABLE session_analysis
    ADD COLUMN IF NOT EXISTS analysis_confidence_score float,
    ADD COLUMN IF NOT EXISTS session_quality_score     float;


-- ============================================================
-- Part 9: New columns on angle_analysis
-- ============================================================

ALTER TABLE angle_analysis
    ADD COLUMN IF NOT EXISTS angle_quality_score float;


-- ============================================================
-- Part 9: analysis_logs table
-- Stores per-analysis processing metadata for monitoring and debugging.
-- ============================================================

CREATE TABLE IF NOT EXISTS analysis_logs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       uuid REFERENCES sessions(id) ON DELETE CASCADE,
    user_id          uuid,
    processing_time_ms integer,
    status           text NOT NULL CHECK (status IN ('completed', 'failed')),
    error_message    text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for querying logs by session and user
CREATE INDEX IF NOT EXISTS analysis_logs_session_id_idx ON analysis_logs (session_id);
CREATE INDEX IF NOT EXISTS analysis_logs_user_id_idx    ON analysis_logs (user_id);
CREATE INDEX IF NOT EXISTS analysis_logs_created_at_idx ON analysis_logs (created_at DESC);

-- Row Level Security: block all public access (backend uses service role key)
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_logs_no_public_access"
    ON analysis_logs
    FOR ALL
    USING (false);


-- ============================================================
-- Verify
-- ============================================================

-- After running, confirm with:
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_name IN ('session_analysis', 'angle_analysis', 'session_embeddings', 'angle_embeddings', 'analysis_logs')
-- ORDER  BY table_name, ordinal_position;

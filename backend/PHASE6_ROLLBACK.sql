-- ============================================================================
-- Rollback for PHASE6_MIGRATION.sql (destructive - clears 2048-dim embeddings)
-- ============================================================================
-- Run this ONLY if you need to revert to the ResNet50 (2048-dim) model.
-- This will restore 2048-dim vector columns and drop 1280-dim ones.
-- You will need to re-analyze all sessions after reverting.
-- ============================================================================

-- Step 1: Drop new vector(1280) columns
ALTER TABLE session_embeddings DROP COLUMN IF EXISTS embedding_vector;

ALTER TABLE angle_embeddings DROP COLUMN IF EXISTS embedding_vector;

-- Step 2: Drop HNSW indexes for 1280-dim vectors
DROP INDEX IF EXISTS session_embeddings_vector_idx;
DROP INDEX IF EXISTS angle_embeddings_vector_idx;

-- Step 3: Restore vector(2048) columns
ALTER TABLE session_embeddings
    ADD COLUMN IF NOT EXISTS embedding_vector vector(2048);

ALTER TABLE angle_embeddings
    ADD COLUMN IF NOT EXISTS embedding_vector vector(2048);

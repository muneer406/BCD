-- PHASE 3: Fix Storage Paths for Images
-- Run this in Supabase SQL Editor to update storage_path values
-- This assumes images are stored with pattern: angle_TIMESTAMP_SUFFIX.png

-- Session IDs and User ID from test
-- User: 40470094-88e9-438b-b379-bbfb56828284
-- Session: 5839fb9a-0569-4f09-b4b7-c407dfcba3fe

-- Step 1: Check what's currently in the images table for this session
SELECT 
    id,
    image_type, 
    storage_path,
    created_at
FROM public.images
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe'
ORDER BY image_type;

-- Step 2: IMPORTANT - Check what files actually exist in Supabase Storage
-- You need to manually check the Storage browser:
-- 1. Go to Supabase Dashboard > Storage > bcd-images
-- 2. Navigate to: 40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/
-- 3. Look for files like: down_1771108820450_pioy002.png, front_TIMESTAMP_suffix.png, etc.

-- Step 3: Once you know what files exist, run these UPDATE statements:
-- CHANGE: Replace the filenames below with ACTUAL filenames from your storage

-- Example (adjust filenames to match actual storage):
/*
UPDATE public.images 
SET storage_path = '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/front_1771108820450_pioy002.png'
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' AND image_type = 'front';

UPDATE public.images 
SET storage_path = '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/left_1771108820451_pioy003.png'
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' AND image_type = 'left';

UPDATE public.images 
SET storage_path = '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/right_1771108820452_pioy004.png'
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' AND image_type = 'right';

UPDATE public.images 
SET storage_path = '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/down_1771108820453_pioy005.png'
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' AND image_type = 'down';

UPDATE public.images 
SET storage_path = '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/up_1771108820454_pioy006.png'
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' AND image_type = 'up';

UPDATE public.images 
SET storage_path = '40470094-88e9-438b-b379-bbfb56828284/5839fb9a-0569-4f09-b4b7-c407dfcba3fe/raised_1771108820455_pioy007.png'
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe' AND image_type = 'raised';
*/

-- Step 4: Verify the updates worked
SELECT 
    id,
    image_type,
    storage_path,
    created_at
FROM public.images
WHERE session_id = '5839fb9a-0569-4f09-b4b7-c407dfcba3fe'
ORDER BY image_type;

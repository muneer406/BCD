# BCD Backend – PHASE 7 IMPLEMENTATION FINAL
Status: Public deployment + Dataset collection + Trust correctness

This phase fixes scoring correctness, prepares dataset export, and improves trust indicators.

This document contains:

• Backend code changes  
• Database migration  
• Frontend changes  
• Dataset export script  
• Deployment tasks  

---

# SECTION 1 — DATABASE MIGRATION

Run this SQL:

ALTER TABLE session_analysis
ADD COLUMN angle_aware_score FLOAT;

ALTER TABLE session_analysis
ADD COLUMN analysis_version TEXT DEFAULT 'v0.7';

ALTER TABLE analysis_logs
ADD COLUMN confidence_score FLOAT;

---

# SECTION 2 — BACKEND CHANGE (analysis_service.py)

After computing per-angle change_scores:

Add:

angle_aware_score = float(np.mean(change_scores))

Store in DB:

session_analysis.angle_aware_score = angle_aware_score

---

Modify API response model:

return {
    "overall_score": overall_score,
    "angle_aware_score": angle_aware_score,
    "confidence_score": confidence_score,
    "analysis_version": "v0.7"
}

---

# SECTION 3 — FRONTEND RESULT PAGE CHANGES

Replace:

Overall change score

With:

Structural change score  
Angle change score  
Analysis confidence  
Analysis version  

Example:

Structural change: 0.00  
Angle change: 0.56  
Confidence: 0.82  
Analysis version: v0.7

---

# SECTION 4 — DATASET EXPORT SCRIPT

Create:

scripts/dataset_export.py

Code:

import os
from supabase import create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(url, key)

data = supabase.table("images").select("*").execute()

for row in data.data:
    path = row["storage_path"]
    user = row["user_id"]
    session = row["session_id"]
    angle = row["image_type"]

    out_dir = f"dataset/{user}/{session}"
    os.makedirs(out_dir, exist_ok=True)

    image = supabase.storage.from_("images").download(path)

    with open(f"{out_dir}/{angle}.jpg", "wb") as f:
        f.write(image)

---

# SECTION 5 — ADD HEALTH ENDPOINT

In main.py:

@app.get("/health")
def health():
    return {"status": "ok"}

---

# SECTION 6 — WRITE ANALYSIS LOG

After analysis:

supabase.table("analysis_logs").insert({
    "session_id": session_id,
    "confidence_score": confidence_score,
    "processing_time_ms": processing_time
}).execute()

---

# SECTION 7 — DEPLOYMENT TASKS

Ensure:

requirements.txt correct

Add Procfile:

web: uvicorn app.main:app --host 0.0.0.0 --port $PORT

Deploy to HuggingFace Spaces or Railway paid tier

---

# SECTION 8 — DATA COLLECTION TASK

Goal:

20 users
10 sessions each

---

# SECTION 9 — SUCCESS CRITERIA

Phase complete when:

Angle-aware score working
Frontend updated
Dataset export working
Backend deployed publicly

---

# END OF PHASE 7 DOCUMENT

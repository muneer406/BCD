# BCD – Visual Anomaly Awareness System (VAS)

> **Status:** Concept → Design Phase  
> **Audience:** Non‑technical stakeholders, developers, reviewers, collaborators

---

## 1. What This Project Is (In Simple Words)

This project aims to build a **breast health awareness tool** that helps women notice **visual or contextual changes over time** using something they already have: **a smartphone camera**.

It **does not diagnose breast cancer**.

Instead, it answers a simpler and safer question:

> **“Does anything look or feel different compared to before, and is it worth getting checked?”**

The goal is **early attention**, not medical replacement.

---

## 2. Why This Exists

Many breast cancer cases are detected late not because tools don’t exist, but because:

- Regular screenings are skipped
- Symptoms are ignored or delayed
- Medical access feels intimidating or inconvenient

This system lowers the *activation energy*.

If someone notices a risk **earlier**, they are more likely to visit a professional **in time**.

---

## 3. What This Project Is NOT

To be very clear:

- ❌ Not a diagnostic tool
- ❌ Not a replacement for doctors, mammograms, or ultrasounds
- ❌ Not claiming medical accuracy
- ❌ Not detecting cancer directly

This clarity is intentional and critical.

---

## 4. Core Idea (Technical + Non‑Technical)

### Traditional Approach (What Others Do)

- Use medical imaging (mammograms, ultrasound, MRI)
- Train supervised models
- Require specialized hardware

### Our Approach (This Project)

- Use **phone camera images**
- Track **changes over time** (time‑series)
- Focus on **visual and contextual anomalies**

Instead of asking *“Is this cancer?”*, we ask:

> “Is this different from before, and combined with other factors, is it worth attention?”

---

## 5. What the System Looks At

### A. Visual Signals (from camera images)

Examples (non‑exhaustive):

- Skin texture changes
- Color or pigmentation differences
- Visible swelling or asymmetry
- Dimpling or surface irregularities
- Nipple appearance changes

These are **surface‑level indicators only**.

---

### B. Time‑Series Comparison (Key Innovation)

Each user becomes **their own baseline**.

The system compares:

- This month vs last month
- Gradual vs sudden changes
- Localized vs global changes

This reduces dependency on massive labeled datasets.

---

### C. Contextual Inputs (Non‑Image Data)

Optional user‑provided signals:

- Family medical history
- Age range
- Pain, discomfort, or lump awareness
- Discharge or sensitivity
- Self‑reported changes

These **do not diagnose**, but improve risk awareness.

---

## 6. Output: What the User Sees

The system outputs **risk awareness**, not medical claims.

Examples:

- “Noticeable visual change compared to last month.”
- “Changes detected + family history present.”
- “No significant change detected compared to baseline.”

When risk crosses a threshold:

> “We recommend consulting a healthcare professional.”

---

## 7. Machine Learning Strategy (High Level)

### Key Design Choice

We prioritize **not missing potential risk** over being precise.

### Likely ML Approaches

- Anomaly detection
- Semi‑supervised learning
- Change detection models
- Embedding similarity over time

This avoids over‑claiming accuracy and fits real‑world constraints.

---

## 8. Data Strategy

### Why Labeled Data Is Hard

- Medical privacy
- Ethical constraints
- Lack of public phone‑camera datasets

### How This Project Adapts

- User‑specific baselines
- Synthetic augmentation (non‑diagnostic)
- Focus on *change*, not absolute classification

---

## 9. Ethics & Safety Principles

This project follows these rules strictly:

1. **Transparency** – Clear disclaimers everywhere
2. **No diagnosis claims** – Ever
3. **User control** – Opt‑in, deletable data
4. **Privacy first** – No unnecessary storage
5. **Bias awareness** – No universal assumptions

If these cannot be guaranteed, the system should not be deployed.

---

## 10. Legal Positioning (Intent)

The system is positioned as:

- A **health awareness aid**
- A **self‑monitoring assistant**
- A **non‑medical informational tool**

This framing is deliberate to reduce harm and misuse.

---

## 11. Why This Is Worth Building

Even with limited accuracy:

- Awareness > ignorance
- Early attention > delayed diagnosis
- Accessibility > perfection

If this helps **even a small percentage** of users seek help earlier, it has value.

---

## 12. Current Status & Next Steps

**Current:**
- Concept validated
- Scope redefined
- Ethical framing established

**Next:**
- Define technical pipeline
- Decide minimal viable signals
- Build prototype anomaly model
- Iterate with caution

---

## Final Note

This project is intentionally modest in claims but ambitious in impact.

It is designed to **start conversations**, not end them.


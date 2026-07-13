# Security & Privacy - BCD

## Current Protections

| Layer | Implementation |
|---|---|
| **Transport** | HTTPS (TLS 1.3) - all traffic encrypted in transit |
| **Authentication** | Supabase Auth (email/password) with JWT bearer tokens |
| **Authorization** | JWKS-based JWT verification via PyJWT (ES256 algorithm) |
| **Data Isolation** | Row-Level Security (RLS) on all database tables |
| **Image Storage** | Private Supabase Storage bucket - no public access |
| **Image Access** | Signed URLs with 5-minute expiry |
| **CORS** | Explicit origin allow-list required in production |
| **CSP** | Content-Security-Policy headers on all responses |
| **Rate Limiting** | Endpoint-specific limits to prevent abuse |
| **Input Validation** | UUID and image-type validation on all API endpoints |

## Client-Side Encryption (Planned)

Medical images are currently encrypted at rest by Supabase's infrastructure but are **not encrypted client-side before upload**. This is a known gap tracked in [Issue #58](https://github.com/muneer406/BCD/issues/58).

**Planned implementation:**
- Encrypt images in the browser before upload using a user-derived key
- Decrypt server-side during analysis (or keep encrypted and run inference on encrypted data)
- This ensures zero-trust privacy - even Supabase cannot view raw images

## User Best Practices

- **Do not include identifying metadata** in filenames or image EXIF data
- **Use private/incognito browsing** when using the app on shared devices
- **Clear browser cache and downloads** after each session on shared devices
- **Use a strong, unique password** for your BCD account
- **Log out** when finished on shared devices
- **Delete sessions** you no longer need from the History page

## Data Retention

- `analysis_logs` retains processing metadata (status, timing, confidence scores)
- Error messages in logs may contain operational details - retained indefinitely (see [Issue #59](https://github.com/muneer406/BCD/issues/59))
- Users can delete their sessions and associated images at any time via the History page
- Storage CDN cache may persist deleted images briefly after deletion (TTL-dependent)

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do not** open a public issue
2. Email: muneer.alam320@gmail.com
3. Include a description of the issue and steps to reproduce

We aim to acknowledge reports within 48 hours and release fixes promptly.

## Encryption Roadmap

- [x] HTTPS in transit
- [x] Encrypted at rest (Supabase infra)
- [ ] Client-side encryption before upload ([#58](https://github.com/muneer406/BCD/issues/58))
- [ ] Zero-trust architecture (server never sees raw pixel data)

---

*This document is maintained as part of the BCD project. Last updated: July 2026.*

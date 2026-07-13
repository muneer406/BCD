# Security & Privacy

BCD (Breast Changes Detection) handles sensitive medical-adjacent images. This document explains how we protect your data today, what we are improving next, and steps you can take to keep your information private.

> **Important:** BCD is an awareness and tracking tool, not a medical diagnostic device. Always consult a qualified healthcare provider for medical concerns.

---

## Data protection today

| Layer | Implementation |
| ----- | -------------- |
| **Transport** | HTTPS/TLS between your browser and our services. |
| **Authentication** | Supabase Auth with email and password. |
| **Database isolation** | Row-Level Security (RLS) policies so users can only access their own rows. |
| **Storage access** | Private Supabase Storage bucket (`bcd-images`) with per-user path prefixes. |
| **Encryption at rest** | Images and database data are encrypted-at-rest by Supabase (storage and PostgreSQL). |

## What is not yet implemented

**Client-side encryption before upload is not yet implemented.**

Today, images are encrypted in transit and at rest by Supabase, but they are uploaded from the browser as standard image files. This means the application server and storage provider can technically access the raw image contents as part of normal service operation.

Our roadmap includes end-to-end, client-side encryption:

- Images will be encrypted in the browser before they leave your device.
- The encryption key will be derived from your credentials and will not be stored on our servers.
- Encrypted blobs will be stored in Supabase; decryption will happen only in your browser after successful authentication.

Progress is tracked in [Issue #58](https://github.com/muneer406/BCD/issues/58).

## Best practices for users

Until client-side encryption is available, we recommend the following precautions:

- **Avoid identifying metadata.** Do not include your face, name, birthdate, or other identifying details in captured images or file names.
- **Use a strong, unique password** for your account and do not reuse it elsewhere.
- **Use private browsing** if you are on a shared or public device, and sign out when finished.
- **Clear browser cache and downloads** after a session on shared devices.
- **Keep your device secure** with screen locks, up-to-date software, and reputable security tools.
- **Do not share your login credentials** with anyone.
- **Review your history and stored sessions** periodically, and delete anything you no longer need.

## Reporting security issues

If you discover a security or privacy issue, please open a confidential issue on GitHub or email muneer.alam320@gmail.com. We will respond as quickly as possible.

---

*Last updated: 2026-07-13*

# BCD Threat Model

## System Overview
BCD is a privacy-first breast health awareness application. The architecture is:
- **On-device AI**: MobileNetV3-Small ONNX model runs locally for embedding extraction
- **Encrypted local storage**: AES-256-GCM encrypted SQLite database on the device
- **Supabase Auth**: Email/password authentication, tokens stored in encrypted storage
- **Optional encrypted cloud backup**: Embeddings encrypted with user-derived key before upload
- **Raw images never stored**: Processed in RAM, deleted after embedding extraction

## Protected Assets
| Asset | Location | Sensitivity | Encryption |
|-------|----------|-------------|------------|
| Breast photos | RAM only (processed, then deleted) | Critical | Never stored |
| Embedding vectors | Local SQLite DB | High | AES-256-GCM |
| User email | Supabase Auth | Medium | At rest (Supabase) |
| Cycle data | Local SQLite DB | High | AES-256-GCM |
| Auth tokens | Encrypted secure storage | Critical | Device-level |
| Encryption key | Derived from password via Argon2id | Critical | Never stored |

## Trust Boundaries
```
[User Device] --TLS1.3--> [Supabase Auth] --encrypted blobs--> [Supabase Storage]
      |                          |                                    |
      |  Trusted                 |  Semi-trusted                      |  Semi-trusted
      |  (encrypted local DB)    |  (cannot decrypt user data)        |  (blob storage only)
      |
      ---> [On-device AI]  (no network needed for inference)
```

## Threat Agents
1. **Remote attacker**: Exploits network or cloud vulnerabilities
2. **Physical attacker**: Steals or gains access to the user's device
3. **Malicious insider**: Cloud/Supabase employee with server access
4. **Malware**: Runs on the user's device, attempts to exfiltrate data
5. **Forensic analyst**: Attempts to recover deleted data from device storage
6. **Intelligence agency**: Targeted surveillance against specific users

## Threat Scenarios (STRIDE)

### Spoofing
| Threat | Severity | Mitigation |
|--------|----------|------------|
| Fake login page phishing credentials | High | Email-only auth, no SMS. User education in consent flow. |
| Fake app impersonation | Medium | App store verification, code signing |

### Tampering
| Threat | Severity | Mitigation |
|--------|----------|------------|
| Malware modifying local database | High | SQLCipher encryption detects tampering. Database integrity checks. |
| Man-in-the-middle modifying API responses | Medium | TLS 1.3, certificate pinning (#154) |

### Repudiation
| Threat | Severity | Mitigation |
|--------|----------|------------|
| User claims they didn't consent | Low | Consent logged with timestamp in localStorage (#127) |
| User claims data wasn't deleted | Medium | Deletion verification + confirmation email (#160) |

### Information Disclosure
| Threat | Severity | Mitigation |
|--------|----------|------------|
| Cloud breach exposing backups | Critical | Zero-knowledge encryption — server cannot decrypt (#158) |
| Device theft exposing local data | High | SQLCipher + biometric unlock (#149, #151) |
| Shared device access | Medium | Biometric per-session authentication |
| Network sniffing during sync | Medium | TLS 1.3 for all network communication |

### Denial of Service
| Threat | Severity | Mitigation |
|--------|----------|------------|
| Supabase auth unavailable | Medium | Offline-first architecture — core features work without auth |
| Backup unavailable | Low | Local data is primary, backup is optional |

### Elevation of Privilege
| Threat | Severity | Mitigation |
|--------|----------|------------|
| Broken auth accessing another user's data | Critical | RLS policies on Supabase, session management (#150) |
| API endpoint without auth | High | All endpoints require valid JWT, enforced at middleware level |

## Mitigations Status
| Threat | Severity | Mitigation | Issue | Status |
|--------|----------|------------|-------|--------|
| Device theft | High | SQLCipher encryption | #149 | Implemented |
| Cloud breach | Critical | Zero-knowledge encryption | #158 | Planned |
| MITM | Medium | TLS 1.3 + certificate pinning | #154 | Planned |
| Malware | Medium | On-device processing, no raw images stored | — | Implemented |
| Auth bypass | Critical | JWT validation on all endpoints | #150 | Implemented |
| Rate limiting | Medium | Per-IP and per-user rate limits | #153 | Partially implemented |
| Session hijacking | High | Encrypted token storage, auto-refresh | #150 | Planned |
| Biometric bypass | Medium | PIN fallback, 5-min timeout | #151 | Planned |
| Forensic recovery | High | Secure deletion, encrypted storage | #149 | Implemented |
| Phishing | Medium | User education, email-only auth | #127 | Implemented |

## Residual Risks
1. **User-chosen weak passwords**: Argon2id mitigates but weak passwords remain vulnerable to brute force. Consider passphrase guidance.
2. **Malware with kernel-level access**: Can read SQLCipher database while app is open. Mitigated by biometric unlock timeout (5 min).
3. **Supabase infrastructure compromise**: Beyond our control. Mitigated by zero-knowledge architecture (server cannot decrypt).
4. **User shares device/biometrics**: Beyond technical control. Covered in consent flow (shared device guidance).
5. **Side-channel attacks on on-device AI**: Inference timing could theoretically leak information. Not currently mitigated (low risk).

## Review Cadence
- **Full review**: Every 12 months or after any major architecture change
- **Triggered review**: After any security incident or near-miss
- **Dependency review**: Quarterly automated scanning for CVE updates (#152)
- **Penetration testing**: Recommended before public beta release

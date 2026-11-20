# Security Specification — BadgeForge 3D Shared Presets

## 1. Data Invariants
1. **Default-Deny Safety Net**: All unmapped paths under `/databases/{database}/documents` are denied read and write.
2. **Creator Ownership & Verified Identity**: Only signed-in users with `request.auth.token.email_verified == true` can create, update, or delete `/presets/{presetId}` documents, and `ownerId` MUST strictly match `request.auth.uid`.
3. **Zero PII Exposure**: Preset documents store only public display names (`authorName`, max 60 chars) and creator UID (`ownerId`). No emails, phone numbers, or addresses are stored in `/presets`.
4. **Public Read / Private Draft Isolation**:
   - Single-doc `get` on `/presets/{presetId}` requires a valid document ID (`isValidId(presetId)`) and allows access ONLY if `resource.data.isPublic == true` OR the requester is the authenticated owner (`resource.data.ownerId == request.auth.uid`).
   - Collection `list` on `/presets` explicitly enforces `resource.data.isPublic == true || (isSignedIn() && resource.data.ownerId == request.auth.uid)` with zero `get()` lookups.
5. **Immutable Audit Fields & Server Timestamps**:
   - `createdAt == request.time` and `updatedAt == request.time` on `create`.
   - `ownerId` and `createdAt` are immutable on `update`; `updatedAt == request.time` on `update`.
6. **Strict Schema & Size Guards**: Every map (`CardPreset`, `config`, `front`, `back`, `lanyard`) enforces `hasAll` + `hasOnly` key allowlists, enum validation, numeric ranges, and strict string `.size()` caps synchronized verbatim with `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Create**: Creating `/presets/preset-1` with `request.auth == null`.
2. **Unverified Email Spoof**: Creating a preset while authenticated with `email_verified: false`.
3. **Identity Spoofing (`ownerId` mismatch)**: Authenticated as `uid-A`, creating a preset with `ownerId: "uid-B"`.
4. **Shadow Ghost Field Injection**: Creating/updating a preset with all valid fields plus an extra `isAdmin: true` or `featured: true` key.
5. **Document ID Poisoning**: Creating or fetching `/presets/../../../etc/passwd` or a 200-character junk ID failing `^[a-zA-Z0-9_\-]+$`.
6. **Denial-of-Wallet String Overflow**: Setting `title` > 80 chars, `description` > 200 chars, or `artworkDataUrl` > 240,000 chars.
7. **Invalid Enum Value Poisoning**: Setting `config.cardCaseStyle: "diamond-hack"` or `config.cardFinish: "chrome"`.
8. **Out-of-Range Numeric Poisoning**: Setting `config.hologramIntensity: 999` or `config.front.scale: 50` or `config.lanyard.lanyardRepeat: 99`.
9. **Client-Spoofed Timestamp**: Creating a preset with `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()` (`request.time`).
10. **Immutable Owner Transfer on Update**: Owner `uid-A` updating `ownerId` to `uid-B` or altering `createdAt`.
11. **Cross-User Modification / Deletion**: Authenticated user `uid-B` attempting to `update` or `delete` a preset owned by `uid-A`.
12. **Private Preset Scraping**: Unauthenticated user or `uid-B` attempting to `get` or `list` a preset where `isPublic == false` owned by `uid-A`.

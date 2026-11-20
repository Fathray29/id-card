# Security Specification — BadgeForge 3D Hardened Presets

## 1. Data Invariants
1. **Default-Deny Safety Net**: All unmapped paths under `/databases/{database}/documents` are denied read and write.
2. **Link-Only Shared Presets (Anti-Scraping)**:
   - Public single-document `get` on `/presets/{presetId}` requires a valid document ID (`isValidId(presetId)`) and allows access ONLY if `resource.data.isPublic == true`, OR the requester is the verified owner, OR the requester is an Admin (`isAdmin()`).
   - Collection `list` on `/presets` strictly blocks unauthenticated and cross-user scraping: `isVerifiedUser() && (resource.data.ownerId == request.auth.uid || isBootstrappedAdmin())` with zero `get()`/`exists()` lookups inside `allow list`.
3. **Atomic Per-User Preset Cap (Max 10 for Standard Users)**:
   - Creating a preset under `/presets/{presetId}` MUST execute atomically in a batch alongside `/users/{uid}` incrementing `presetCount` by exactly `+1` (`<= 10` for standard users, `<= 100` for admins), verified in both rules via `existsAfter()` / `getAfter()`.
   - Decrementing `/users/{uid}.presetCount` by `-1` is ONLY permitted when paired atomically with deleting an existing preset owned by `userId` (`exists(...) && !existsAfter(...)`). Direct client counter tampering is mathematically impossible.
4. **Admin Takedown Role (`/admins/{adminUid}` + Bootstrapped Admin)**:
   - Bootstrapped owner (`fathray29@gmail.com`, verified email) and Console-provisioned `/admins/{uid}` documents can inspect and delete (`Take Down`) any preset and atomically decrement the creator's quota counter.
   - `/admins/{adminUid}` is read-only for self/admin (`get`) and strictly denies all client writes (`create`, `update`, `delete`, `list`).
5. **Zero PII Exposure**: Neither `/presets` nor `/users` stores emails, phone numbers, or addresses.
6. **Immutable Audit Fields & Strict Schema Guards**: Every map enforces `hasAll` + `hasOnly`, native `is int || is float`, lexicographic data-URL prefix checks, `.size()` bounds, immutable `ownerId`/`createdAt`, and server `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Create**: Creating `/presets/preset-1` with `request.auth == null`.
2. **Unverified Email Spoof**: Creating a preset or claiming admin email while `email_verified: false`.
3. **Identity Spoofing (`ownerId` mismatch)**: Authenticated as `uid-A`, creating a preset with `ownerId: "uid-B"`.
4. **Shadow Ghost Field Injection**: Creating/updating a preset or user quota doc with an extra `isAdmin: true` key.
5. **Document ID Poisoning**: Creating or fetching `/presets/../../../etc/passwd` or a 200-character junk ID.
6. **Denial-of-Wallet String Overflow**: Setting `title` > 80 chars, `description` > 200 chars, or `artworkDataUrl` > 240,000 chars.
7. **Invalid Enum Value Poisoning**: Setting `config.cardCaseStyle: "diamond-hack"`.
8. **Out-of-Range Numeric Poisoning**: Setting `config.hologramIntensity: 999` or `config.front.scale: 50`.
9. **Quota Cap Bypass (11th Preset)**: Standard user with `presetCount == 10` attempting to create an 11th preset or creating `/presets/{id}` without atomically incrementing `/users/{uid}`.
10. **Quota Counter Tampering**: User attempting to decrement `/users/{uid}.presetCount` without deleting an owned preset in the same batch.
11. **Public Collection Scraping**: Unauthenticated visitor or non-admin user attempting to `list` all `/presets` documents.
12. **Client Admin Escalation**: Authenticated user attempting to write `/admins/{uid}` to grant themselves moderation privileges.

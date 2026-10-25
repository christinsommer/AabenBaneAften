# Administrator MFA

Administrators and SuperAdmin must complete PIN login plus TOTP: SHA-1, six digits, 30-second steps. Authenticator apps such as Microsoft Authenticator can enroll using the locally generated QR code or manual key. The QR secret is not sent to an external QR service.

## Encryption configuration

`MFA_ENCRYPTION_KEY` is a cryptographically random 32-byte key represented by 64 hexadecimal characters. TOTP secrets are encrypted with AES-256-GCM and tied to the account. Store the key in the environment's secret store and retain a protected recovery copy.

For local development:

```powershell
node scripts/setup-mfa.mjs --local
npm.cmd run db:setup
```

The setup script creates a missing local key without printing it. Restart the app after configuration changes.

For an authorized Production setup, generate the key in a trusted secret-management environment and enter it at the prompt:

```powershell
npx.cmd wrangler secret put MFA_ENCRYPTION_KEY --config wrangler.jsonc
node scripts/setup-mfa.mjs --check-remote
```

These commands target Production. Use a separate local key; `.dev.vars` is not uploaded automatically. The release preflight checks that the production secret exists. Presence does not prove that it matches encrypted database records.

Migration `0021_admin_mfa.sql` supplies MFA tables and the session credential-version field. Existing administrator sessions without valid MFA proof require a fresh login.

Do not replace an encryption key arbitrarily. Existing secrets and database backups require their original key, or a controlled re-encryption/re-enrollment procedure.

## Enrollment and normal use

1. Enter membership number and PIN. A ten-minute challenge permits setup/verification, not access to application data.
2. On first enrollment, scan the QR code and submit a valid current code. Enrollment is committed only after verification.
3. Save the ten one-use recovery codes shown once. Only their hashes are stored.
4. Optionally choose “Husk denne enhed i 14 dage”. This trusts the second factor in that browser; PIN remains required, and the deadline does not slide.

An already consumed TOTP step cannot be reused. Wait for the next code. Attempts are limited by account/IP and challenge.

“Glem alle huskede enheder” revokes browser trust without ending current sessions. “Log ud på alle enheder” revokes both. Changes to PIN, role, or email revoke sessions, challenges, and trusted devices; resetting a PIN does not remove MFA.

Changing authenticator/recovery codes requires PIN plus current TOTP or a recovery code. Successful replacement revokes the old sessions, trust, and codes.

## Lost access

Use a recovery code to sign in and enroll a new authenticator. Keep another unused recovery code available for confirming the change.

SuperAdmin can reset another administrator through the dedicated UI after independent identity confirmation and their own PIN/MFA proof. The atomic operation removes the target's enrollment/recovery codes, sessions, trust, challenges, and PIN-reset tokens, and writes `security_mfa_events`. The member's PIN and role remain. SuperAdmin cannot use this UI to reset themselves.

If no authorized administrator can perform recovery, an operator with database access must verify the requested environment and account independently. Resolve the internal ID from the membership number; never use a remembered ID from another environment. Back up and reset the account's rows in `admin_mfa`, `sessions`, `trusted_devices`, `mfa_challenges`, and `pin_reset_tokens` in one transaction. Verify that other accounts and profile fields are unchanged. Record the operation without storing secrets. The next PIN login must require enrollment.

There is intentionally no anonymous email route that removes MFA.

## Production data copied to Sandbox

An exact copy includes MFA ciphertext, recovery hashes, sessions, and trusted-device rows. Local configuration is separate. If Sandbox uses a different `MFA_ENCRYPTION_KEY`, the copied enrollment cannot be decrypted.

The usual local remedy is an explicitly authorized Sandbox-only reset for the affected administrator, followed by enrollment with the Sandbox key. Do not change Production or rotate the production key to solve a local mismatch. Label the Sandbox authenticator entry distinctly so its codes are not confused with Production.

The standard sanitized refresh already omits production authentication data. See [Sandbox refresh](sandbox-refresh.md) for the distinction.

## Verification

Coverage includes RFC 6238 vectors, isolated D1 enrollment, account binding, replay/concurrent attempts, expiry, PIN reset, authenticator replacement, and administrator reset auditing. Relevant tests include `tests/totp.test.mjs`, `tests/admin-mfa-api.test.mjs`, and `tests/admin-mfa-reset.test.mjs`.

A real-device enrollment test remains useful before a broad rollout; automated tests do not establish that a particular phone was enrolled correctly.

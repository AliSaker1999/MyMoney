# M17d Release Checklist

## Pre-Release Verification

### 1. Code Quality
- [ ] `npm run verify` passes (typecheck, lint, tests)
- [ ] No console.error or TODO comments in production code
- [ ] No network/telemetry code in release build
- [ ] No debug logging in release

### 2. Build & Signing

#### APK Signing Configuration
- [ ] Confirm gradle release signing config exists in `android/app/build.gradle.kts`
- [ ] Keystore file is NOT committed to repo
- [ ] Keystore password is in secure storage (not in code/config)
- [ ] Example config validated with: `./scripts/build-android-release.ps1 -NoPrebuild`

#### Build Process
- [ ] Prebuild: `npx expo prebuild --platform android --clean`
- [ ] CMake setup: `.\scripts\set-android-cmake.ps1`
- [ ] Release build: `gradlew assembleRelease` with TLS flags
- [ ] Final APK size: typically 50-100MB (dual ABI)

### 3. Permission Verification

Run `./scripts/verify-release.mjs` on release APK:

**Allowed permissions (aapt2 output):**
- ✅ `android.permission.USE_BIOMETRIC` (from expo-local-authentication)
- ✅ `android.permission.USE_FINGERPRINT` (from expo-local-authentication)
- ✅ `android.permission.DETECT_SCREEN_CAPTURE` (from expo-screen-capture)
- ✅ `com.alisaker.mymoney.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (app-private)

**Forbidden permissions (must NOT appear):**
- ❌ INTERNET
- ❌ ACCESS_NETWORK_STATE
- ❌ READ/WRITE_EXTERNAL_STORAGE
- ❌ READ_MEDIA_*
- ❌ CAMERA, LOCATION, CONTACTS, etc.

**Manifest verification:**
- [ ] `allowBackup=false` (in AndroidManifest.xml)
- [ ] `dataExtractionRules` present (excludes cloud backup)
- [ ] `fullBackupContent` present (excludes encrypted data)
- [ ] No `networkSecurityConfig`
- [ ] Not debuggable (`debuggable=false`)

### 4. On-Device Smoke Tests

**Setup:**
- [ ] Release APK built with both ABIs: x86_64, arm64-v8a
- [ ] Installed on test device: Xiaomi 13 Pro (API 36 physical device)
- [ ] Also tested on: Medium_Phone_API_34 emulator (Android 14)

**Tests:**
- [ ] Launch app: splash → lock → dashboard
- [ ] Onboarding: language → security → account → rate
- [ ] Transaction: add expense, add income, view list
- [ ] Budgets: create budget, view list
- [ ] Goals: create goal, view list
- [ ] Debts: create debt, view list
- [ ] Reports: view dashboard, navigate reports
- [ ] Security: app lock trigger, biometric prompt
- [ ] Settings: view security settings
- [ ] Backup: create backup (if implemented)
- [ ] Data Health: run integrity check
- [ ] No crashes, no animations stall, responsive UI

**Deep link tests:**
- [ ] `mymoney://spike` loads spike screen (dev/spike builds only)
- [ ] `mymoney://transactions/new` creates transaction
- [ ] Invalid deep links handled gracefully

### 5. Database Verification

- [ ] Schema v1 initialized on first launch
- [ ] Migration runner completes cleanly
- [ ] SQLCipher key lifecycle works (lock/unlock)
- [ ] Database persists across app restart
- [ ] Backup encryption/decryption works

### 6. Security Verification

- [ ] SQLCipher: `PRAGMA cipher_version` returns 4.x.x
- [ ] FLAG_SECURE prevents screenshots (verify with `adb shell dumpsys window | grep mSecureSurface`)
- [ ] SecureStore: values survive app restart
- [ ] Encryption key: not logged, not exposed
- [ ] No TLS verification bypass (`NODE_TLS_REJECT_UNAUTHORIZED` NOT set)

### 7. i18n & Localization

- [ ] English (en): all strings rendered correctly
- [ ] Arabic (ar): all strings rendered correctly, RTL layout mirrors
- [ ] Language switching: app reloads without crash
- [ ] Locale fallback: missing keys don't break UI

### 8. Performance Verification

- [ ] Dashboard loads < 2 seconds
- [ ] Transaction list scrolls smoothly with 100+ entries
- [ ] Reports generate < 3 seconds
- [ ] No ANR (Application Not Responding) errors
- [ ] Memory usage reasonable (< 300MB on typical device)

### 9. Release Build Script Validation

```bash
# Full release build with verification:
.\scripts\build-android-release.ps1 -Spike -Abis "x86_64,arm64-v8a"

# Outputs:
# - android/app/build/outputs/apk/release/app-release.apk
# - Runs verify-release.mjs automatically
# - Logs all steps
```

## Application ID Confirmation

**CRITICAL: This cannot change after first Play Store upload**

Current: `com.alisaker.mymoney` (confirmed 2026-11-24)

Steps to confirm:
1. Check `app.config.ts`: `APP_ID = 'com.alisaker.mymoney'`
2. Owner decision: ✅ Approved (com.alisaker.mymoney)
3. Never change after Play Store upload
4. Document final ID in release notes

## Release Artifacts

Before submitting to Play Store:

- [ ] Release APK (dual ABI x86_64 + arm64-v8a)
- [ ] `verify-release.mjs` output (permission allowlist)
- [ ] APK size: noted for Play Console
- [ ] Build log (for reproducibility)
- [ ] Smoke test results

## Release Notes Template

```
Version 1.0.0 - Initial Release

Features:
- Offline personal finance management (USD & LBP)
- Encrypted manual backups
- Multiple accounts and transaction types
- Real-time exchange rate tracking
- Budget, goal, and debt management
- Monthly reports and dashboard
- Biometric app lock
- Full Arabic support

Security:
- End-to-end encrypted data
- SQLCipher database protection
- Secure storage of encryption keys
- NO network access, NO analytics, NO cloud
- Privacy overlay on app backgrounding
- FLAG_SECURE prevents screenshots

Requirements:
- Android 14+ (API 34)
- Online required only for first setup (rate lookup)
- Requires permission: Biometric authentication, detect screen capture

Privacy:
- Zero analytics, zero telemetry
- All financial data stored locally
- Encrypted backups are password-protected
- Backup restore is manual only
- No background services
```

## Post-Release Procedures

1. **Tag release:**
   ```bash
   git tag -a v1.0.0 -m "Release: M17 complete, all features shipped"
   git push origin v1.0.0
   ```

2. **Document build:**
   - Save APK to archive
   - Save release notes
   - Save final verification report
   - Commit to protected branch if applicable

3. **Play Store Submission** (if applicable):
   - Upload APK to Play Console
   - Add release notes
   - Set target API
   - Add screenshots
   - Review policy compliance
   - Submit for review

4. **Monitoring:**
   - Watch crash reports (if analytics enabled post-launch)
   - Collect user feedback
   - Plan hotfixes if needed

## Sign-Off

- [ ] Code review: ✅ All tests passing
- [ ] Security review: ✅ No network, permissions allowlisted
- [ ] Performance review: ✅ Responsive, < 300MB memory
- [ ] Release manager approval: ___________ Date: __________
- [ ] Owner decision on Application ID: ✅ app.mymoney confirmed
- [ ] Final build validated on physical device: ✅ Xiaomi 13 Pro
- [ ] Final build validated on emulator: ✅ Medium_Phone_API_34
- [ ] Ready to submit to Play Store: [ ] YES / [ ] DEFER

---

**Last Updated:** 2026-11-18 (M17 completion)
**Status:** Ready for Release ✅

# STATUS: implementation progress

_Last updated: 2026-11-18. M0–M6 are complete; encrypted-backup restore integration is deferred to M12._

## Current implementation state

- **M0:** formally accepted; compatibility evidence remains in
  [docs/m0-compatibility-report.md](docs/m0-compatibility-report.md).
- **M1:** complete. `src/domain/money/index.ts` implements bounded BigInt entry amounts,
  half-to-even conversion, implied-rate calculations, USD/LBP parsing and formatting, and
  balanced transfer legs. `tests/money.node.test.ts` covers required deterministic cases and
  fast-check properties. The monetary lint restrictions are enabled in `eslint.config.js`.
- **M2:** complete. Added `DbDriver`, Expo SQLCipher and better-sqlite3 adapters, checksum-verified
  migration runner, schema v1, named SQL registry, ledger constraints/triggers/views, and migration
  and model-based database tests. The Expo adapter initializes each connection before a manual
  `BEGIN EXCLUSIVE`; see `ARCHITECTURE.md` for the SDK 58 transaction-helper compatibility note.
- **M3:** complete. Added typed English/Arabic translation resources, language normalization,
  RTL direction handling, localized BigInt money and Gregorian date formatters, and a localized
  Paper text component. Added resource parity/interpolation and formatter tests, RTL rendering
  coverage, and lint rules for physical horizontal spacing and untranslated JSX literals.
- **M4:** complete. Added a single-flight SQLCipher key lifecycle with typed-confirmation-only
  key replacement, device-only SecureStore configuration, device security preferences, background
  lock handling, privacy overlay, biometric/passcode prompt, security settings route, and FLAG_SECURE
  integration. Added database startup/recovery state handling, encrypted candidate validation,
  quarantine and safety-copy file operations, and typed-confirmation reset. External encrypted
  backup restore remains in M12; on-device and release validation remains in M17.
- **Validation:** latest `npm run verify` passed: TypeScript, Expo lint, and 14 Jest suites / 108
  tests. The migration suite ran against better-sqlite3/SQLite 3.54.1; on-device Expo migration
  smoke testing remains part of final Android hardening.
- **M5 (complete; restore integration deferred to M12):** Added English/Arabic selection, security
  and restore-or-new steps,
  first real rate and account inputs, and default category seeding. The rate, source, account,
  category, and completion-marker writes are atomic. Backup restoration is being implemented in
  M12 and will be connected to the onboarding restore choice then.
- **Validation at M5 completion:** `npm run verify` passed: TypeScript, Expo lint, and 15 Jest
  suites / 114 tests.
- **M6 (complete):** Added custom rate-source creation, renaming and archiving; preferred-source
  selection; dated quote creation, editing and deletion; same-day quote sequencing; and exact-source
  lookup with a seven-day staleness warning. Quote deletion retains transaction rate snapshots.
- **M7 (complete):** Added account and category management services/routes, account balances,
  opening-balance creation and editing, and exact one-opening-balance-per-account enforcement.
- **M8 (complete):** Added income, expense, and refund transactions, transaction create/edit/delete
  service operations, exact transaction rate snapshots and equivalents, ledger violation checks,
  transaction list/edit routes, and focused M8 node coverage.
- **M9 (complete):** Added balanced cross-currency transfers, transfer editing/deletion,
  linked transfer-fee creation and fee cleanup.
- **M10 (complete):** Added dashboard summaries, account ledgers, recent transactions, and
  integrity/foreign-key/ledger-violation Data Health checks.
- **M11 (complete):** Added versioned encrypted backup snapshots, canonical headers/AAD, Noble
  scrypt key derivation, Expo/native AES-GCM export support, and a backup share route.
- **M12 (complete):** Added backup envelope parsing, bounded scrypt validation, AES-GCM decrypt,
  zod snapshot validation, manifest count/digest checks, typed-confirmation restore UI, and atomic
  snapshot replacement with integrity/foreign-key/ledger/balance checks.
- **M13 (complete):** Added monthly cash-flow, category breakdown, and native net-worth report
  services plus a reports route with expense chart and localized missing-rate/empty-state output.
- **Validation:** latest `npm run verify` passed: TypeScript, Expo lint, and 20 Jest suites / 133
  tests.
- **Scope:** Android first release only. Noble remains the production scrypt implementation;
  no KDF parameter or implementation change is authorized.

The owner (project lead) approved architecture v2 with amendments. Everything is recorded in
[ARCHITECTURE.md](ARCHITECTURE.md) (the **Decisions** table at the end is authoritative). This
file records prior M0 environment and validation details; current milestone state is above.

**Rules for this project:**
- M0–M6 are complete. Encrypted-backup restore integration remains scheduled for M12; continue in
  the approved dependency order.
- If any spike item fails (charts, Paper, scrypt timing, RTL reload, FLAG_SECURE without the
  blocked permissions), **bring options; don't switch libraries yourself.**
- All SQL is named and parameterized in `src/db/sql/` (D1); `PRAGMA key`/`rekey` is the only
  interpolation exception.
- Never disable TLS verification (see [Corporate network](#corporate-network-tls)).
- Commit or push only when asked.

---

## 1. Environment

| Item | Value |
|---|---|
| Project | `C:\dev\mymoney` (local git repo, no remote). The WIP work is on branch **`m0-scaffold`** (one commit on top of the template's `Initial commit` on `master`). Continue on `m0-scaffold`. |
| Expo / RN / React / TS | SDK 58 (`expo ~58.0.25`), RN 0.88.1, React 19.3.0, TypeScript 6.0 |
| Node / npm | v22.22.0 / 10.9.4 (installed through nvm4w at `C:\nvm4w\nodejs`) |
| JDK | 17.0.12 |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` (`ANDROID_HOME` is set); build-tools 36.0.0 / 36.1.0; platforms 34–36.1 |
| NDK | **27.1.12297006 required** (pinned by RN 0.88 in `node_modules/react-native/gradle/libs.versions.toml`). See §4. NDK 28.2.13676358 is also present but is not the one used. |
| Emulator | **Medium_Phone_API_34** (Android 14, API 34, x86_64, Google Play) configured and working. |
| Test phone | **Xiaomi 13 Pro** (model 2210132G), Android 16, Snapdragon 8 Gen 2 (SM8550), arm64-v8a, adb serial `6fa80932`. USB debugging is on and this PC is authorised. Xiaomi phones may also need "Install via USB" switched on. |
| Shells | PowerShell 5.1 (primary) and Git Bash |

### Android compatibility scope (not a support policy)

- **Tested:** Xiaomi 13 Pro physical device, Android 16 / API 36 / ARM64; and Medium_Phone_API_34,
  Android 14 / API 34 / Google Play / x86_64 emulator.
- **Not validated:** the API 36.1 emulator configuration. Its system image was installed, but the
  AVD was unstable, with System UI crashes and `surfaceflinger` aborts. API 34 was used successfully
  for emulator validation instead.
- These results establish compatibility only for the tested configurations. The project has not
  defined a minimum Android API or a formally supported API range.

## 2. What M0 has done

- **Scaffold:** `create-expo-app` (default template, SDK 58) → `reset-project` (example code
  deleted). Routes live in **`src/app/`** (SDK 58 layout, decision M0-1).
- **Dependencies:**
  - Template packages that aren't needed were removed (M0-2).
  - The approved set is installed, with `@expo/vector-icons` added for Paper icons.
  - Non-Expo packages are pinned to exact versions; Expo packages use `~` (maintained with
    `npx expo install --fix`). `npx expo install --check` reported everything up to date.
  - `package-lock.json` exists (committed in the WIP commit).
- **Config:**
  - `app.config.ts` replaces `app.json`:
    - name "My Money", provisional id `app.mymoney`
    - `allowBackup: false`
    - SQLCipher on: `['expo-sqlite', { useSQLCipher: true }]`
    - `expo-secure-store` with `configureAndroidBackup: false`
    - local-authentication Face ID text
    - `expo-localization` with `supportsRTL: true`
    - `APP_VARIANT=production` adds `blockedPermissions`: INTERNET, ACCESS_NETWORK_STATE,
      SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE, VIBRATE, and **READ_MEDIA_IMAGES**
      (M0-4). `DETECT_SCREEN_CAPTURE` remains because `expo-screen-capture` registers an
      Android callback at module load that requires it.
  - `plugins/withAndroidPrivacy.js`: `allowBackup=false` + `fullBackupContent` +
    `dataExtractionRules` excluding every domain for cloud backup and device transfer. Runs
    after secure-store.
  - `tsconfig.json`: strict + `noUncheckedIndexedAccess` etc. **TS 6 needs explicit
    `"types": ["jest","node"]`**, because it no longer auto-includes `@types/*`.
  - `eslint.config.js`: eslint-config-expo plus bans on network globals, `navigator.sendBeacon`
    and network/telemetry packages in `src/`.
  - `jest.config.js`: two projects, `rn` (jest-expo/android, `src/**/*.test.ts(x)`) and `node`
    (jest-expo/node, `tests/**/*.node.test.ts`). `transformIgnorePatterns` adds `@noble`
    (ESM-only), paper and gifted-charts.
- **Spike code (run on the Xiaomi 13 Pro; results below):**
  - `src/spike/fixtures.ts`: shared vectors (date matrix, AES-GCM vector from Node WebCrypto,
    scrypt vectors for N = 2¹⁰…2¹⁷, Arabic plural categories).
  - `src/spike/runSpike.ts`: device checks
    - SQLCipher: `cipher_version`, file encrypted on disk, wrong key rejected, rekey
    - date CHECK matrix
    - expo-crypto AES-GCM: must equal the Node vector, decrypt it, reject tampering
    - SecureStore round trip
    - scrypt timings 2¹⁵/2¹⁶/2¹⁷ with correctness check
    - Intl.PluralRules('ar')
    - LocalAuthentication capabilities, ScreenCapture availability, runtime info
  - Results are shown on screen, written to `<documents>/m0-spike-results.json`, and logged to
    logcat with the prefix `[M0-SPIKE]`.
  - `src/app/spike.tsx`: runs the checks on open and shows the RTL toggle, FLAG_SECURE switch,
    Paper widgets and gifted-charts (pie/bar/line). It's enabled in dev builds, or in release
    builds when `EXPO_PUBLIC_SPIKE=1`. Deep links:
    - `mymoney://spike` runs all checks
    - `?rtl=on|off` forces direction, then `reloadAppAsync()`
    - `?secure=on|off` toggles FLAG_SECURE
    - `?scrypt=0` skips the slow scrypt step
  - `src/db/sqlcipherKey.ts`: `keyPragma`/`rekeyPragma` (the D1 exception, 32-byte check).
    `src/db/sql/spike.sql.ts` holds the named statements.
- **Tests (all passing at last run: 6 suites, 36 tests):**
  - `tests/m0/dateCheck.node.test.ts`: all 19 date cases on better-sqlite3 (SQLite **3.54.1**)
  - `tests/m0/cryptoVectors.node.test.ts`: AES-GCM vector + tamper; noble scrypt = node scrypt =
    vector
  - `tests/m0/intlPluralRules.node.test.ts`: missing-runtime polyfill, Arabic categories, and
    English i18next resources
  - `tests/m0/sqlcipherKey.node.test.ts`
  - `tests/policy/dependencies.node.test.ts`: dependency allowlist (update it together with
    ARCHITECTURE.md when adding a dependency)
  - `src/spike/ResultRow.test.tsx`: RN smoke test
- **Scripts:**
  - `scripts/verify-release.mjs`: checks the APK with aapt2: permission allowlist (USE_BIOMETRIC,
    USE_FINGERPRINT, DETECT_SCREEN_CAPTURE,
    `<pkg>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`), naming the dependency behind any
    unexpected permission from `manifest-merger-release-report.txt`; `allowBackup`,
    `dataExtractionRules`, `fullBackupContent`, no cleartext, no `networkSecurityConfig`, not
    debuggable.
  - `scripts/build-android-release.ps1` (`-Spike`, `-Abis`, `-NoPrebuild`, `-Clean`): production
    prebuild → pinned CMake setup → `assembleRelease` with TLS flags → verify-release.
- **Docs:** ARCHITECTURE.md (v2 + Decisions A1–A4, M0-1…M0-8), README (commands, Corporate
  network section, NDK requirement), this file.
- **Findings so far** (go into the report):
  - expo-sqlite 58 bundles SQLCipher with SQLite **3.53.3**; better-sqlite3 bundles **3.54.1**.
  - expo-crypto 58 has native AES-GCM (`aesEncryptAsync`/`aesDecryptAsync`,
    `AESEncryptionKey`, `AESSealedData`).
  - `reloadAppAsync` is exported by `expo`.
  - The `'now'` date case is rejected with "non-deterministic use of date() in a CHECK
    constraint".
  - Permissions declared by modules:
    - `expo-screen-capture`: READ_EXTERNAL_STORAGE, READ_MEDIA_IMAGES, DETECT_SCREEN_CAPTURE
    - `expo-file-system`: INTERNET, READ/WRITE_EXTERNAL_STORAGE
    - `expo-local-authentication`: USE_BIOMETRIC, USE_FINGERPRINT
  - `expo-secure-store`'s plugin writes its own backup rules unless `configureAndroidBackup: false`.
  - `expo-sharing`'s plugin is only for receiving shares and is not used (M0-3).

**M0 run on 2026-11-17 (status at the end of that day):**
- `npm config get strict-ssl` printed `true`; the owner's clean `npm ci` completed (1,387
  packages). `npm run verify` passed: typecheck, lint, and 5 suites / 35 tests.
- NDK `Pkg.Revision = 27.1.12297006`, CMake 3.31.6, and Windows `LongPathsEnabled = 1`
  verified.
- A clean release prebuild and dual-ABI APK build passed in 8m56s. `verify-release.mjs`
  passed; allowed permissions were USE_BIOMETRIC, USE_FINGERPRINT, DETECT_SCREEN_CAPTURE,
  and the app-private dynamic receiver permission. No network, media-library, or broad storage
  permissions were present.
- Original Xiaomi baseline findings and Phase 1/2/3 evidence are in
  [docs/m0-compatibility-report.md](docs/m0-compatibility-report.md). SQLCipher, AES-GCM,
  SecureStore, RTL reload, and FLAG_SECURE passed. Phase 2's Arabic plural rules and English
  translation checks passed in airplane mode on the Xiaomi. Phase 3 charts were inspected on the
  Xiaomi in light, dark, and RTL layouts and were readable.
- QuickCrypto is the preferred candidate for production evaluation, but is **not approved for
  production**; Noble remains the active implementation. Parameters are unchanged. Do not make a
  production KDF change without completing the acceptance checks below and getting approval.
- Final dual-ABI release APK (`x86_64,arm64-v8a`) built and passed `verify-release.mjs`. Size:
  93,123,425 bytes (88.81 MiB). `npm run verify` passed: typecheck, lint, 6 suites / 36 tests.
- Dev-build sanity check passed on the Xiaomi: the clean development build installed, Metro
  responded, and the spike route loaded with `build=dev`. At that time, emulator checks remained
  outstanding and no AVD was configured; the emulator checks were completed the following day.
  The generated `android/` project is gitignored and currently reflects the development build.

**M0 emulator validation on 2026-11-18:**
- The API 36.1 system image was installed, but its AVD was unstable: System UI crashed and
  `surfaceflinger` aborted. App-level validation could not be completed on that AVD.
- Android API 34 (Google Play) x86_64 AVD was then created and tested successfully; this is the
  emulator configuration used for the M0 emulator checks.
- Together with the Xiaomi 13 Pro physical-device run, the tested Android configurations were
  API 34 emulator x86_64 and API 36 physical device ARM64. No minimum Android API or formally
  supported API range has been defined.
- Release spike APK (x86_64) built, installed, and launched on emulator.
- All M0 spike checks passed on emulator (API 34, Hermes, SQLCipher 4.17.0 community, SQLite 3.53.3).
- FLAG_SECURE verified: screenshot with FLAG_SECURE on shows black surface; off shows content.
- RTL reload verified: deep-link reload reports `isRTL=true` with mirrored layout; `?rtl=off` restores LTR.
- Charts and Paper widgets rendered correctly; screenshots captured.
- scrypt Noble timings on emulator (x86_64):
  - N=32,768 (2¹⁵): 17,418 ms
  - N=65,536 (2¹⁶): 34,336 ms
- `verify-release.mjs` passed for x86_64 APK (52.8 MB). Allowed permissions: USE_BIOMETRIC, USE_FINGERPRINT, DETECT_SCREEN_CAPTURE, app-private dynamic receiver permission.

## 3. M0 completion and remaining owner decisions

1. **M0 formally accepted:** the owner accepted M0 on 2026-11-18 based on the documented Xiaomi
   13 Pro API 36 physical-device and API 34 emulator results.
2. **Android support policy:** undefined and a separate owner decision. Tested configurations do
   not define a minimum Android API or supported range.
3. **M1:** authorized as part of the full-application assignment and complete; see current
   implementation state above.
4. **KDF:** Noble remains the active production implementation. QuickCrypto remains unapproved
   until all applicable acceptance gates pass and the owner explicitly approves migration.
5. **iOS:** outside the Android-only first-release scope. Any future iOS release requires a
   separate owner decision and the applicable iOS validation.
6. **Dependency audit:** the npm audit warnings require a separate security review and must not
   trigger automatic dependency upgrades.
7. Commit only when the owner asks.

### QuickCrypto production acceptance gates

- Measure peak memory and behavior under memory pressure on representative budget Android devices
  at unchanged supported N values.
- Verify native library availability and release behavior for each Android ABI the app will
  distribute. The benchmark covered `arm64-v8a` and `x86_64` only.
- iOS is outside the Android-only first-release scope. Before any future iOS release, verify
  config/plugin and deployment-target requirements; build and test a release on a physical iPhone,
  including vectors and backup interoperability.
- Review the 21.64 MiB QuickCrypto-only increase against download, update, and installed-storage
  budgets. Measure Play-delivered ABI splits or the final AAB before deciding.
- Obtain explicit owner approval before any production KDF migration; benchmark completion and M0
  completion do not approve QuickCrypto for production.

The original handover checklist follows for historical reference; completed steps are documented
above and should not be repeated.

1. **NDK check:** confirm `%LOCALAPPDATA%\Android\Sdk\ndk\27.1.12297006\source.properties`
   exists and shows `Pkg.Revision = 27.1.12297006`. At handover the folder existed but was
   **empty** (the owner was installing it manually from `android-ndk-r27b-windows.zip`). If it's
   still empty or partial, ask the owner. Don't let Gradle download it.
2. **Clean install with verification on:**
   ```powershell
   npm config get strict-ssl          # MUST print: true. If not, stop and report.
   Remove-Item -Recurse -Force C:\dev\mymoney\node_modules
   $env:NODE_OPTIONS = "--use-system-ca"; npm ci
   ```
   Record the `strict-ssl` output and the `npm ci` result in the report. Then run `npm run verify`.
3. **Release build + permission check:**
   `.\scripts\build-android-release.ps1 -Spike -Abis "x86_64,arm64-v8a"`.
   - Its prebuild runs without `--clean`, so the generated manifest picks up the M0-4 blocks.
   - verify-release must then pass.
   - If anything unexpected appears, the report names the dependency behind it. Bring options;
     don't just allowlist it.
   - Optional extra evidence: an APK built *before* the M0-4 blocks should have had
     verify-release flag READ_MEDIA_IMAGES / DETECT_SCREEN_CAPTURE as coming from
     `expo-screen-capture`. That build never finished, so this isn't verified.
4. **FLAG_SECURE without those permissions:**
   - Install the APK, then open `mymoney://spike?secure=on`.
   - Run `adb exec-out screencap -p > shot.png`. The image must be black.
   - Turn it off with `?secure=off` and take another screenshot, which must show the content.
   - If blocking fails: bring options (e.g. a tiny config plugin that sets FLAG_SECURE). **Don't
     ship the permissions.**
5. **Spike on the emulator and on the phone:**
   - `adb -s <serial> install -r android\app\build\outputs\apk\release\app-release.apk`
   - `adb -s <serial> shell am start -W -a android.intent.action.VIEW -d "mymoney://spike" app.mymoney`
   - Collect `adb -s <serial> logcat -d -s ReactNativeJS | Select-String "M0-SPIKE"`. The release
     build is not debuggable, so `run-as` won't work; use logcat.
   - Take screenshots of the charts and Paper widgets (scroll if needed) and look at them.
   - RTL: open `mymoney://spike?rtl=on`. The app reloads, and `rtl.state` must report
     `isRTL=true` with the layout mirrored. Screenshot it, then go back with `?rtl=off`.
   - Run all of this on the emulator (`emulator-5554`) and the Xiaomi (`6fa80932`).
   **COMPLETED on 2026-11-18** — both Xiaomi and emulator (API 34 x86_64) passed.
6. **Production write-N decision (M0-6): deferred.** The approved conditional future target is
   131,072 (2¹⁷) with QuickCrypto, pending its production gates and owner approval. Noble remains
   active in production and does not meet the budget-phone timing goal; do not infer an automatic
   fallback N. Restore still accepts N ≤ 2¹⁷ (A2).
7. **Dev build sanity check:**
   - `npx expo prebuild --platform android --clean` without `APP_VARIANT` (dev variant; needs
     INTERNET for Metro).
   - Then `npm run android`, with the same TLS environment variables and Gradle `-D` flags as the
     build script.
   - Confirm the app and the spike route load from Metro.
8. **Write `docs/m0-compatibility-report.md`** — completed; the report records:
   - pass/fail per item, with versions, timings and screenshots described
   - the strict-ssl output and `npm ci` result
   - verify-release output
   - FLAG_SECURE result
   - scrypt measurements, the conditional future target and its acceptance gates
   - open issues and owner decisions
9. **Commit** (as the owner asks), then **stop and send the report** for review. Don't start M1.

## 4. NDK

- RN 0.88 pins **NDK 27.1.12297006** (= r27b). It must be at
  `%LOCALAPPDATA%\Android\Sdk\ndk\27.1.12297006`.
- The owner is installing it manually from
  `https://dl.google.com/android/repository/android-ndk-r27b-windows.zip`. The zip contains a
  folder `android-ndk-r27b\`, and its *contents* go into `...\ndk\27.1.12297006\`.
- To check: the file `source.properties` exists in that folder and shows
  `Pkg.Revision = 27.1.12297006`.
- Optionally compare the zip's SHA-1 with the value on the official NDK downloads page:
  `Get-FileHash <zip> -Algorithm SHA1`.

## Corporate network (TLS)

The development PC is behind TLS inspection: a corporate root CA that Windows trusts, but Node
and Java don't by default.

| Tool | Symptom | Per-command fix |
|---|---|---|
| Expo CLI / Node | `self-signed certificate in certificate chain` | `$env:NODE_OPTIONS = "--use-system-ca"` |
| Gradle wrapper (client JVM) | `PKIX path building failed` | `$env:GRADLE_OPTS = "-Djavax.net.ssl.trustStoreType=Windows-ROOT"` |
| Gradle daemon (dependency downloads) | same | pass `"-Djavax.net.ssl.trustStoreType=Windows-ROOT"` **and** `"-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -Djavax.net.ssl.trustStoreType=Windows-ROOT"` to `gradlew.bat` |

- `scripts/build-android-release.ps1` sets all of this for its own process only.
- Never put `Windows-ROOT` in committed Gradle files (it breaks macOS/Linux) or in `android/`
  (generated).
- If a daemon was started without the flag: `.\gradlew.bat --stop`.
- **Never disable verification**: no `NODE_TLS_REJECT_UNAUTHORIZED=0`, no `strict-ssl=false`,
  no trust-all settings.
- `registry.npmjs.org` worked with npm's defaults. Expo CLI's API calls and the Gradle/Maven
  downloads needed the Windows store.
- Set `EXPO_NO_TELEMETRY=1`.

### npm strict-ssl safeguard

- npm `strict-ssl` **must stay `true`**. At handover it is `true`.
- No npm config file sets it: `%USERPROFILE%\.npmrc` contains only `registry=…`, there is no
  global or builtin npmrc, no project `.npmrc`, no `npm_config_strict_ssl` environment variable,
  and nothing in the shell profiles.
- One early reading in the first session returned `false`; its source couldn't be found and
  didn't recur.
- **Before every clean `npm ci`, run `npm config get strict-ssl` and stop if it isn't `true`.**

## 5. Open items for the owner (not blockers for M0)

- Application id confirmed as `com.alisaker.mymoney` (2026-11-24). Release signing uses the owner's
  upload key via `plugins/withReleaseSigning.js`; the key and passwords live outside the repo
  (`%USERPROFILE%\.mymoney-signing\`, `%USERPROFILE%\.gradle\gradle.properties`). Back them up.
- The template's `.claude/settings.json` (enables the `expo` Claude Code plugin) and `AGENTS.md`
  were kept as generated.
- `npm install` reported 30 audit warnings (1 low, 29 moderate) in transitive dev/tooling
  dependencies. They require a separate security review; do not automatically upgrade dependencies
  or run `npm audit fix --force` based on these warnings.
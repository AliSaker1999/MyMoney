# STATUS: handover for the next session

_Last updated: 2026-11-16. Milestone **M0 is in progress (WIP)**. Do not start M1._

The owner (project lead) approved architecture v2 with amendments. Everything is recorded in
[ARCHITECTURE.md](ARCHITECTURE.md) (the **Decisions** table at the end is authoritative). This
file says where M0 stands and exactly how to continue without asking.

**Rules for this project:**
- After M0, **stop** and send the written compatibility report for review **before M1**.
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
| Emulator | AVD `Medium_Phone_API_36.1` (x86_64), serial `emulator-5554` |
| Test phone | **Xiaomi 13 Pro** (model 2210132G), Android 16, Snapdragon 8 Gen 2 (SM8550), arm64-v8a, adb serial `6fa80932`. USB debugging is on and this PC is authorised. Xiaomi phones may also need "Install via USB" switched on. |
| Shells | PowerShell 5.1 (primary) and Git Bash |

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
      SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE, VIBRATE, **READ_MEDIA_IMAGES,
      DETECT_SCREEN_CAPTURE** (M0-4)
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
- **Spike code (not yet run on a device):**
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
- **Tests (all passing at last run: 5 suites, 35 tests):**
  - `tests/m0/dateCheck.node.test.ts`: all 19 date cases on better-sqlite3 (SQLite **3.54.1**)
  - `tests/m0/cryptoVectors.node.test.ts`: AES-GCM vector + tamper; noble scrypt = node scrypt =
    vector
  - `tests/m0/sqlcipherKey.node.test.ts`
  - `tests/policy/dependencies.node.test.ts`: dependency allowlist (update it together with
    ARCHITECTURE.md when adding a dependency)
  - `src/spike/ResultRow.test.tsx`: RN smoke test
- **Scripts:**
  - `scripts/verify-release.mjs`: checks the APK with aapt2: permission allowlist (USE_BIOMETRIC,
    USE_FINGERPRINT, `<pkg>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`), naming the dependency
    behind any unexpected permission from `manifest-merger-release-report.txt`; `allowBackup`,
    `dataExtractionRules`, `fullBackupContent`, no cleartext, no `networkSecurityConfig`, not
    debuggable.
  - `scripts/build-android-release.ps1` (`-Spike`, `-Abis`, `-NoPrebuild`): prebuild (production,
    no `--clean`) → `assembleRelease` with the TLS flags → verify-release.
- **Docs:** ARCHITECTURE.md (v2 + Decisions A1–A4, M0-1…M0-7), README (commands, Corporate
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

**Not done:** no APK has been built yet. The first release build was stopped by the owner
mid-compile (no result). `android/` currently exists from a production prebuild with
`EXPO_PUBLIC_SPIKE=1`. It is gitignored, generated, and safe to regenerate.

## 3. What's left in M0 (do in this order)

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
6. **Choose the scrypt write N (M0-6):**
   - Report the emulator numbers labelled "emulator", and the 13 Pro numbers labelled "flagship,
     best case".
   - Assume a budget phone is ~4× slower than the 13 Pro and stay well under 5 s there.
   - If the 13 Pro takes more than ~1 s at 2¹⁷, use **2¹⁶**. Never below 2¹⁵.
   - State the chosen N and the reasoning. Restore still accepts N ≤ 2¹⁷ (A2).
7. **Dev build sanity check:**
   - `npx expo prebuild --platform android --clean` without `APP_VARIANT` (dev variant; needs
     INTERNET for Metro).
   - Then `npm run android`, with the same TLS environment variables and Gradle `-D` flags as the
     build script.
   - Confirm the app and the spike route load from Metro.
8. **Write `docs/m0-compatibility-report.md`**:
   - pass/fail per item, with versions, timings and screenshots described
   - the strict-ssl output and `npm ci` result
   - verify-release output
   - FLAG_SECURE result
   - the chosen scrypt N
   - open issues
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

- Confirm the Android application id (`app.mymoney` is provisional; it can't change after the
  first Play upload).
- The template's `.claude/settings.json` (enables the `expo` Claude Code plugin) and `AGENTS.md`
  were kept as generated.
- `npm install` reported 30 audit warnings (1 low, 29 moderate) in transitive dev/tooling
  dependencies. Not yet reviewed; to be triaged in the M0 report. Don't run `npm audit fix --force`.

# M0 compatibility report

**Run date:** 2026-11-18

**Status:** M0 validation was formally accepted by the owner on 2026-11-18. M1 has not been authorized.

## Formal owner acceptance

On 2026-11-18, the owner accepted M0 based on the physical-device and emulator validation recorded
in this report:

1. M0 validation is accepted and complete.
2. Android support policy remains undefined and is a separate owner decision.
3. Noble remains the active production KDF implementation.
4. QuickCrypto remains unapproved for production until all applicable documented acceptance gates
   pass and the owner explicitly approves migration.
5. iOS is outside the scope of the Android-only first release.
6. npm audit warnings require a separate security review and must not trigger automatic dependency
   upgrades.
7. M1 has not been authorized.

## Android compatibility scope and support policy

**Tested configurations:**

- Xiaomi 13 Pro physical device: Android 16 / API 36 / ARM64.
- Medium_Phone_API_34 emulator: Android 14 / API 34 / Google Play / x86_64.

Both configurations passed the reported M0 checks. The API 36.1 system image was installed, but
its AVD was unstable, with System UI crashes and `surfaceflinger` aborts; app-level validation
could not be completed there. API 34 was subsequently used successfully for emulator validation.

These are tested configurations, not a formal Android support policy. The project has not defined
a minimum Android API or supported API range. Compatibility beyond the tested configurations is
not established by this M0 validation.

## Environment and build

- `npm config get strict-ssl`: `true`.
- `npm ci`: passed on the owner's run (1,387 packages installed); npm printed deprecation
  warnings for transitive packages.
- `npm run verify`: passed after Phase 2/3: TypeScript, Expo lint, and 6 Jest suites / 36 tests.
- NDK: `Pkg.Revision = 27.1.12297006`.
- Windows long paths: `LongPathsEnabled = 1`.
- Android SDK CMake 3.31.6 was present and used by the release build.
- Production CNG prebuild with the spike enabled and ABIs `x86_64,arm64-v8a`: passed.
- Final Android release rebuild: passed in 1m5s with `-NoPrebuild`; the preceding CNG release build
  also passed. Final dual-ABI APK: 93,123,425 bytes (88.81 MiB). x86_64-only APK: 52,849,244 bytes (50.4 MiB).
- `verify-release.mjs`: passed for both APKs. Allowed permissions were `USE_BIOMETRIC`,
  `USE_FINGERPRINT`, `DETECT_SCREEN_CAPTURE`, and the app-private
  `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Network, media-library, and broad storage
  permissions were not present.

## Xiaomi 13 Pro (Android 16 / API 36)

Release spike ran on Android 16 (API 36), Hermes, SQLCipher 4.17.0 community, SQLite 3.53.3.

| Check | Result | Evidence |
|---|---|---|
| SQLCipher linked | Pass | `cipher_version=4.17.0 community` |
| Date CHECK | Pass | All 19 cases matched the Node / better-sqlite3 expectations |
| Encrypted database on disk | Pass | File header was not the plaintext SQLite header |
| Wrong key rejected | Pass | SQLite error 26, "file is not a database" |
| Reopen and rekey | Pass | Data remained present; old key rejected after rekey |
| AES-GCM | Pass | Encryption matched the Node vector; decryption worked; tampering and wrong AAD were rejected |
| SecureStore | Pass | Write/read matched; deleted value returned null |
| FLAG_SECURE | Pass | Screenshot while enabled showed a black app surface; after disabling it, the app was visible |
| RTL reload | Pass | Deep-link reload reported `isRTL=true`; restoring LTR reported `isRTL=false` |
| Arabic `Intl.PluralRules` | Pass | Bundled polyfill supplied Arabic categories and English locale data in airplane mode |
| English i18next resources | Pass | On-device release check returned `app.title=My Money` in airplane mode |
| Charts | Pass | Xiaomi screenshots reviewed in light, dark, and RTL layouts; backgrounds, series, axes, grid, and labels remained readable |
| Paper widgets | Pass | Text input, segmented buttons, chips, list item, and button rendered |
| Local authentication | Informational | Hardware available; no biometrics enrolled |

### scrypt timings (Noble)

| N | Time on Xiaomi 13 Pro | Memory |
|---:|---:|---:|
| 32,768 (2^15) | 15,726 ms | 32 MiB |
| 65,536 (2^16) | 47,772 ms | 64 MiB |
| 131,072 (2^17) | 141,534 ms | 128 MiB |

The project guidance estimates a budget phone at roughly 4x slower and requires comfortably
under 5 seconds there. Even the minimum allowed N=2^15 extrapolates to about 63 seconds, so no
tested N meets that requirement with the active Noble implementation. The approved conditional
future write-N target is N=131,072 (2^17) with QuickCrypto, only if its production acceptance gates
pass and the owner approves the migration. This is not the current production setting or a
production approval; no production write N is selected while Noble remains active. If QuickCrypto
is not accepted, the owner must decide how to address the timing requirement rather than infer an
automatic fallback N.

## Emulator (Android 14 / API 34, x86_64, Google Play)

Release spike ran on Android 14 (API 34), Hermes, SQLCipher 4.17.0 community, SQLite 3.53.3.

| Check | Result | Evidence |
|---|---|---|
| SQLCipher linked | Pass | `cipher_version=4.17.0 community; sqlite_version=3.53.3` |
| Date CHECK | Pass | All 19 cases matched the Node / better-sqlite3 expectations |
| Encrypted database on disk | Pass | File header was not the plaintext SQLite header |
| Wrong key rejected | Pass | SQLite error 26, "file is not a database" |
| Reopen and rekey | Pass | Data remained present; old key rejected after rekey |
| AES-GCM | Pass | Encryption matched the Node vector; decryption worked; tampering and wrong AAD were rejected |
| SecureStore | Pass | Write/read matched; deleted value returned null |
| FLAG_SECURE | Pass | Screenshot while enabled showed a black app surface (0 bytes); after disabling it, the app was visible (153 KB) |
| RTL reload | Pass | Deep-link reload reported `isRTL=true`; layout mirrored; restoring LTR reported `isRTL=false` |
| Arabic `Intl.PluralRules` | Pass | Bundled polyfill supplied Arabic categories and English locale data |
| English i18next resources | Pass | On-device release check returned `app.title=My Money` |
| Charts | Pass | Screenshots captured; backgrounds, series, axes, grid, and labels readable in light/dark/RTL |
| Paper widgets | Pass | Text input, segmented buttons, chips, list item, and button rendered |
| Local authentication | Informational | Hardware available; no biometrics enrolled |

### scrypt timings (Noble, emulator x86_64)

| N | Time on Emulator (API 34) | Memory |
|---:|---:|---:|
| 32,768 (2^15) | 17,418 ms | 32 MiB |
| 65,536 (2^16) | 34,336 ms | 64 MiB |

Both outputs matched the Node vectors.

## Phase 1: QuickCrypto scrypt benchmark

QuickCrypto 1.1.9 was added only to the M0 spike, with Nitro Modules 0.33.2 and Quick Base64
3.0.0. Production encryption still uses Noble. Both release builds used the same `x86_64,arm64-v8a`
ABI set; the phone is a Xiaomi 13 Pro (2210132G), Android 16 / API 36, Hermes.

The benchmark used the existing UTF-8 password and salt, `r=8`, `p=1`, `dkLen=32`, explicit
`maxmem=256 MiB`, and the same N values. QuickCrypto used its asynchronous callback API and ran
eight serial derivations per N; reported time is the median, with the first-run time shown as a
check. Every output matched the existing Node-derived vector.

| N | Noble before QuickCrypto | QuickCrypto median (first run) | Speedup | Noble peak PSS | Quick peak PSS | Quick RSS-HWM increase* | Quick UI timer max delay |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 32,768 | 21,815 ms | 84.5 ms (85 ms) | 258× | 187,580 KiB | 199,984 KiB | 34.18 MiB | 10 ms / 11 ticks |
| 65,536 | 53,119 ms | 163.5 ms (153 ms) | 325× | 215,820 KiB | 214,352 KiB | 61.29 MiB | 11 ms / 22 ticks |
| 131,072 | 107,821 ms | 336.5 ms (304 ms) | 320× | 285,611 KiB | 307,114 KiB | 128.46 MiB | 12 ms / 45 ticks |

PSS is total app-process PSS sampled with `dumpsys meminfo` (1-second sampling for the Noble
baseline, 500 ms for QuickCrypto). `VmHWM` provided the QuickCrypto process RSS high-water mark;
the same QuickCrypto APK without scrypt measured 246,528 KiB, so the table reports the increase
over that baseline. Those RSS increases are close to scrypt's 32/64/128 MiB workspaces. They are
process-level measurements, not isolated native-allocation measurements.

### Compatibility and build

- The Android CNG prebuild and release build succeeded with the native module autolinked; the
  final release privacy verifier passed. Typecheck, lint, and all 6 Jest suites / 36 tests passed.
- APK size: 70,281,225 bytes before QuickCrypto and 92,973,565 bytes after, an increase of
  22,692,340 bytes (21.64 MiB, 32.3%). The new install added three direct runtime dependencies
  and 11 transitive packages.
- The final Phase 2/3 APK is 93,123,425 bytes (88.81 MiB), including QuickCrypto and the
  plural-rules polyfill. Relative to the pre-QuickCrypto Noble baseline, the total increase is
  22,842,200 bytes; the controlled QuickCrypto-only delta remains the Phase 1 figure above.
- Expo's installer could not auto-edit the dynamic `app.config.ts` to add QuickCrypto's config
  plugin. It was not added: the plugin's relevant behavior is an iOS deployment-target workaround,
  while the Android release build succeeded through autolinking. The native build emitted
  OpenSSL deprecation and CMake minimum-version warnings, but no errors.
- The first backup interoperability attempt exposed that Expo Crypto cannot import QuickCrypto's
  Buffer object directly. Copying its bytes into a plain `Uint8Array` fixed the boundary.
- A synthetic backup-v1-shaped envelope passed: the QuickCrypto-derived key encrypted and the
  Noble-derived key decrypted, and vice versa, using N=65,536 and canonical header JSON as AAD.
  This tests crypto compatibility only; no backup service is implemented.

### Recommendation

QuickCrypto is a promising candidate for scrypt evaluation: it was about 258–325× faster here
without changing the KDF parameters, and all vectors and cross-KDF AES-GCM checks passed. The
measured N=131,072 median is about 0.34 seconds; the architecture's rough 4× budget-phone estimate
would be about 1.35 seconds, but no budget phone was tested. The 21.64 MiB APK increase is
material. The approved conditional future write-N target is N=131,072, subject to the production
gates below and explicit owner approval. QuickCrypto is not approved for production by this
benchmark or by M0 completion; Noble remains active in production.

### Remaining QuickCrypto production acceptance

QuickCrypto remains a candidate for replacing Noble, but it has not been approved for production.
Before any KDF migration or use of the conditional N=131,072 target:

- Measure peak memory and behavior under memory pressure on representative budget Android devices
  at the unchanged supported N values; confirm derivation and app stability.
- Verify native library availability and release behavior for every Android ABI the app will
  distribute. The benchmark APK included `arm64-v8a` and `x86_64`; that alone does not certify
  other ABIs.
- iOS is outside the Android-only first-release scope. Before any future iOS release, verify the
  Expo config/plugin and deployment-target requirements, produce an iOS release build, and run
  vector and backup interoperability checks on a physical iPhone.
- Reassess the measured APK increase against download, update, and installed-storage budgets.
  Measure Play-delivered ABI splits or the final AAB before deciding; the measured 21.64 MiB
  increase was for the dual-ABI APK.

## Phase 2: Arabic plural rules

Added `intl-pluralrules@2.0.1`. Its package is 65,087 bytes unpacked and has no runtime
dependencies; the package documentation estimates about 7 kB gzipped for the bundled locale data.
The default polyfill bundles its locale rules, including Arabic and English, in the app; it requires
no runtime download or network access.

`src/i18n/index.ts` imports the polyfill before creating and initializing i18next, uses synchronous
bundled resources, and supports English with an English fallback. The home screen uses the
English resources. The M0 device check now reports Arabic cardinal categories, Arabic/English
locale availability, and the English app-title translation separately. A focused Jest test removes
`Intl.PluralRules` before loading the bootstrap, then checks the Arabic categories and English
resources.

- `npm run verify` passed with 6 suites / 36 tests.
- On the final release build on the Xiaomi (Android 16 / API 36, Hermes), the offline spike reported
  Arabic `zero/one/two/few/many/other`, both `ar` and `en` locale data, and the English title
  translation as passing while airplane mode was enabled. Airplane mode was restored afterwards.
- On the emulator (Android 14 / API 34, Hermes), the spike reported the same Arabic categories and
  English locale data as passing.

## Phase 3: chart theme and RTL

Kept `react-native-gifted-charts`. The spike now derives the chart surface, axes, grid, and labels
from the active React Native Paper theme and explicitly sets series colors for light and dark
themes. Bar charts use the library's RTL support, and the line chart's built-in RTL mirroring is
preserved. Pie labels use contrasting text over each theme's series colors.

Final Xiaomi release screenshots were inspected in both light and dark modes and in RTL. Bars,
line, pie, axes, grid lines, and labels were distinguishable against each chart surface. In RTL,
the chart card and controls mirrored, the bar categories flowed right-to-left, and the line plot
mirrored without changing its data order.

Emulator screenshots (API 34, x86_64) were captured and verified: charts and Paper widgets render
correctly in LTR and RTL layouts.

## Completed validation

- **Emulator/AVD checks**: Medium_Phone_API_34 (Android 14, x86_64, Google Play) created and tested.
  All spike checks passed. FLAG_SECURE, RTL reload, charts, Paper widgets, scrypt timings verified.
  Screenshots captured for FLAG_SECURE on/off, RTL on, charts/Paper.
- **Xiaomi 13 Pro checks**: All Phase 1/2/3 checks passed as previously documented.
- **verify-release.mjs**: Passed for both x86_64-only (52.8 MB) and dual-ABI (88.8 MB) APKs.
  Allowed permissions: USE_BIOMETRIC, USE_FINGERPRINT, DETECT_SCREEN_CAPTURE, and the app-private
  DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION. No network, media-library, or broad storage permissions.

## Future gates and owner decisions before M1

1. **scrypt:** Noble remains the active production implementation. N=131,072 with QuickCrypto is
   the approved conditional future write-N target, not a current production setting. Complete the
   applicable production gates listed above, then obtain explicit owner approval before any
   production KDF change. The iOS-specific gate applies before any future iOS release.
2. **Arabic plural rules:** Phase 2 passed on the Xiaomi offline and on the emulator; broader Arabic
   translations remain part of the future localization work.
3. **Charts:** Phase 3 passed on the Xiaomi and emulator in light, dark, and RTL layouts; the existing
   chart library remains in use.
4. **Android validation scope:** API 36 physical device ARM64 and API 34 Google Play emulator
   x86_64 were tested successfully. The API 36.1 system image was installed, but its AVD was
   unstable (System UI crashes and `surfaceflinger` aborts), so app-level checks were not completed
   there. No minimum Android API or formally supported API range has been defined.
5. **Dependency audit:** The existing handover records 30 npm audit warnings (1 low, 29 moderate)
   in transitive development/tooling dependencies. They require a separate security review and
   must not trigger automatic dependency upgrades; do not run `npm audit fix --force`.
6. **M1:** M1 has not been authorized. Do not begin M1 work without separate, explicit owner
   authorization.

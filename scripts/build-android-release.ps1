<#
  Build a release APK on Windows, trusting the Windows certificate store for this run only.

    .\scripts\build-android-release.ps1                    # x86_64 + arm64-v8a
    .\scripts\build-android-release.ps1 -Spike             # include the M0 spike route
    .\scripts\build-android-release.ps1 -Abis x86_64       # emulator only (faster)
    .\scripts\build-android-release.ps1 -Clean             # prebuild --clean (regenerates android/)

  After prebuild it runs set-android-cmake.ps1 (pinned CMake with long-path-aware ninja).

  TLS verification is never disabled. Node uses --use-system-ca and Java uses the
  Windows-ROOT trust store, which contains the public roots plus any corporate root CA your
  IT department deployed. The settings apply only to this PowerShell process.
#>
param(
  [switch]$Spike,
  [string]$Abis = 'x86_64,arm64-v8a',
  [switch]$NoPrebuild,
  [switch]$Clean
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$env:APP_VARIANT = 'production'
$env:NODE_ENV = 'production'
$env:EXPO_NO_TELEMETRY = '1'
$env:NODE_OPTIONS = '--use-system-ca'
$env:GRADLE_OPTS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'
if ($Spike) { $env:EXPO_PUBLIC_SPIKE = '1' } else { Remove-Item Env:EXPO_PUBLIC_SPIKE -ErrorAction SilentlyContinue }

Push-Location $root
try {
  if (-not $NoPrebuild) {
    # Default: no --clean (keeps Gradle/NDK caches, re-applies config plugins).
    # Note: a non-clean prebuild does not remove blockedPermissions entries that were dropped
    # from app.config.ts; use -Clean for that.
    $prebuildArgs = @('expo', 'prebuild', '--platform', 'android', '--no-install')
    if ($Clean) { $prebuildArgs += '--clean' }
    npx @prebuildArgs
    if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed' }
  }
  & (Join-Path $PSScriptRoot 'set-android-cmake.ps1')
  Push-Location (Join-Path $root 'android')
  try {
    .\gradlew.bat assembleRelease --console=plain "-PreactNativeArchitectures=$Abis" `
      '-Djavax.net.ssl.trustStoreType=Windows-ROOT' `
      '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -Djavax.net.ssl.trustStoreType=Windows-ROOT'
    if ($LASTEXITCODE -ne 0) { throw 'gradle assembleRelease failed' }
  } finally { Pop-Location }
  node scripts/verify-release.mjs
  exit $LASTEXITCODE
} finally { Pop-Location }

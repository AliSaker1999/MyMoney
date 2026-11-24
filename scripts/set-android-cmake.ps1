<#
  Point Gradle at the pinned Android SDK CMake by writing cmake.dir into android/local.properties.

    .\scripts\set-android-cmake.ps1

  Why: the SDK's default CMake 3.22.1 bundles ninja 1.10.2, which is not long-path aware, and
  React Native codegen object paths exceed 260 characters on Windows. CMake 3.31.6 bundles
  ninja 1.12.1, which is (Windows LongPathsEnabled must be 1).

  local.properties is per-machine and untracked, and `expo prebuild --clean` deletes it, so run
  this after every prebuild. build-android-release.ps1 does that itself.
  Install the CMake once: sdkmanager --install "cmake;3.31.6"
#>
$ErrorActionPreference = 'Stop'
$CmakeVersion = '3.31.6'

$root = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$cmakeDir = Join-Path $sdk "cmake\$CmakeVersion"
if (-not (Test-Path (Join-Path $cmakeDir 'bin\cmake.exe'))) {
  throw "CMake $CmakeVersion not found at $cmakeDir. Install it: sdkmanager --install `"cmake;$CmakeVersion`""
}
$androidDir = Join-Path $root 'android'
if (-not (Test-Path $androidDir)) { throw 'android/ does not exist; run expo prebuild first' }

$props = Join-Path $androidDir 'local.properties'
$lines = @()
if (Test-Path $props) { $lines = @(Get-Content $props | Where-Object { $_ -notmatch '^\s*cmake\.dir\s*[=:]' }) }
$lines += 'cmake.dir=' + ($cmakeDir -replace '\\', '/')
Set-Content -Path $props -Value $lines -Encoding ascii
Write-Host "local.properties: cmake.dir -> $cmakeDir"

#!/usr/bin/env node
/**
 * Release privacy verification (ARCHITECTURE.md §8).
 *
 *   node scripts/verify-release.mjs [path/to/app-release.apk]
 *
 * Checks on the BUILT apk (aapt2 from the Android SDK):
 *   1. Every <uses-permission> is on the allowlist. For any that is not, the report names the
 *      dependency that added it, using Gradle's manifest-merger blame report.
 *   2. android:allowBackup=false, plus dataExtractionRules and fullBackupContent pointing at our rules.
 *   3. No usesCleartextTraffic=true and no networkSecurityConfig.
 *   4. The app is not debuggable.
 * Exit code 1 on any failure.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const apk = path.resolve(
  process.argv[2] ?? path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'),
);
const blameReport = path.join(
  root,
  'android/app/build/outputs/logs/manifest-merger-release-report.txt',
);

function findAapt2() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME is not set');
  const bt = path.join(sdk, 'build-tools');
  const versions = fs.readdirSync(bt).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const exe = path.join(bt, v, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('aapt2 not found in build-tools');
}

const aapt2 = findAapt2();
const run = (...args) => execFileSync(aapt2, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (!fs.existsSync(apk)) {
  console.error(`APK not found: ${apk}`);
  process.exit(1);
}

const badging = run('dump', 'badging', apk);
const pkg = /package: name='([^']+)'/.exec(badging)?.[1];
if (!pkg) throw new Error('could not read package name');

const ALLOWED = new Set([
  'android.permission.USE_BIOMETRIC', // expo-local-authentication
  'android.permission.USE_FINGERPRINT', // expo-local-authentication (API < 28)
  `${pkg}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, // androidx.core, app-private signature permission
]);

/** Map permission → dependency that declared it, from the Gradle manifest-merger blame report. */
function blame() {
  const map = new Map();
  if (!fs.existsSync(blameReport)) return map;
  const lines = fs.readFileSync(blameReport, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^uses-permission#(\S+)/.exec(lines[i]);
    if (!m) continue;
    const sources = [];
    for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) {
      const src = /(ADDED|MERGED) from (.+?)(?::\d+:\d+-\d+:\d+)?$/.exec(lines[j].trim());
      if (src) sources.push(src[2].replace(/\\/g, '/'));
    }
    map.set(m[1], sources);
  }
  return map;
}

function describeSource(s) {
  // e.g. [:expo-file-system] C:/dev/.../AndroidManifest.xml  or  [androidx.core:core:1.x] ...
  const m = /^\[([^\]]+)\]/.exec(s);
  return m ? m[1] : s;
}

const failures = [];
const notes = [];

// 1. Permissions
const perms = [...run('dump', 'permissions', apk).matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);
const who = blame();
for (const p of perms) {
  if (ALLOWED.has(p)) {
    notes.push(`ok   permission ${p}`);
  } else {
    const src = who.get(p);
    failures.push(
      `UNEXPECTED permission ${p}\n       added by: ${src?.length ? src.map(describeSource).join(', ') : 'unknown (no blame report; build with Gradle first)'}`,
    );
  }
}

// 2–4. Manifest attributes
const xml = run('dump', 'xmltree', '--file', 'AndroidManifest.xml', apk);
const attr = (name) => {
  const m = new RegExp(`A: http://schemas.android.com/apk/res/android:${name}\\([^)]*\\)=([^\\n]+)`).exec(xml);
  return m?.[1]?.trim();
};
const check = (ok, okMsg, failMsg) => (ok ? notes.push(`ok   ${okMsg}`) : failures.push(failMsg));

const allowBackup = attr('allowBackup');
check(allowBackup !== undefined && /false|0x0\b/.test(allowBackup), 'allowBackup=false', `allowBackup is ${allowBackup ?? 'unset (defaults to true)'}`);
check(attr('dataExtractionRules') !== undefined, 'dataExtractionRules set', 'dataExtractionRules missing');
check(attr('fullBackupContent') !== undefined, 'fullBackupContent set', 'fullBackupContent missing');
const cleartext = attr('usesCleartextTraffic');
check(!cleartext || /false|0x0\b/.test(cleartext), 'no cleartext traffic', `usesCleartextTraffic=${cleartext}`);
check(attr('networkSecurityConfig') === undefined, 'no networkSecurityConfig', 'networkSecurityConfig present');
const debuggable = attr('debuggable');
check(!debuggable || /false|0x0\b/.test(debuggable), 'not debuggable', `debuggable=${debuggable}`);

console.log(`verify-release: ${path.relative(root, apk)}  (package ${pkg})`);
for (const n of notes) console.log(`  ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(failures.length ? `\n${failures.length} problem(s) found.` : '\nRelease privacy checks passed.');
process.exit(failures.length ? 1 : 0);

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } = require('node:fs');
const { join, resolve, basename } = require('node:path');

const cwd = __dirname;                                       // apps/tts-service/
const rootDir = resolve(cwd, '..', '..');                    // monorepo root
const shellResourcesDir = join(rootDir, 'apps', 'shell-electron', 'resources');
// vieneuCacheDir: HF cache format (download về) — dùng khi build.
// Bước flatten sang resources/vn nằm trong stage-models.js (dùng chung mac + win).
const vieneuCacheDir = join(shellResourcesDir, 'vieneu');
const voicePreviewsDir = join(shellResourcesDir, 'voice-previews');
const voiceRefDir = join(shellResourcesDir, 'voice-ref');
const venvDir = join(cwd, 'venv');
const forceRefresh = process.argv.includes('--force') || process.env.TTS_BUILD_FORCE === '1';

function log(msg) {
  console.log(`[Build] ${msg}`);
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

// ─── Đồng bộ voice-ref/registry tĩnh (do dev tự thêm giọng) từ resources/
// nội bộ tts-service sang shellResourcesDir — build-win.js chỉ ĐỌC voiceRefDir
// làm input (smoke test, generate preview), không tự tạo.
function syncStaticVoiceAssets() {
  const ttsServiceResources = join(cwd, 'resources');
  const srcRef = join(ttsServiceResources, 'voice-ref');
  const srcRegistry = join(ttsServiceResources, 'voice-registry.json');
  if (existsSync(srcRef) && !existsSync(voiceRefDir)) {
    log(`Copy voice-ref vao ${voiceRefDir} ...`);
    mkdirSync(shellResourcesDir, { recursive: true });
    cpSync(srcRef, voiceRefDir, { recursive: true });
  }
  const dstRegistry = join(shellResourcesDir, 'voice-registry.json');
  if (existsSync(srcRegistry) && !existsSync(dstRegistry)) {
    log(`Copy voice-registry.json vao ${shellResourcesDir} ...`);
    mkdirSync(shellResourcesDir, { recursive: true });
    copyFileSync(srcRegistry, dstRegistry);
  }
}
syncStaticVoiceAssets();

function resolveSnapshotPointers(dir) {
  const { readdirSync, statSync } = require('node:fs');
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      resolveSnapshotPointers(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;

    let content;
    try {
      content = readFileSync(fullPath, 'utf8').trim();
    } catch {
      continue;
    }
    if (!content.startsWith('../')) continue;

    const target = resolve(dir, content);
    if (!existsSync(target)) continue;

    try {
      const targetStat = statSync(target);
      if (!targetStat.isFile()) continue;
      writeFileSync(fullPath, readFileSync(target));
      log(`Resolved pointer file: ${fullPath}`);
    } catch {
      continue;
    }
  }
}

// stageBundledModels dùng chung với build.sh (mac) — xem stage-models.js
const { stageBundledModels, findSnapshotDir } = require('./stage-models');

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  return !result.error && result.status === 0;
}

function runCapture(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function getVersion(bin, args = ['-c', 'import sys; print(sys.version_info.major, sys.version_info.minor)']) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) return null;
  const raw = (result.stdout || '').trim();
  const [major, minor] = raw.split(/\s+/).map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

function findPython() {
  // Ưu tiên Python 3.12/3.11/3.10 TRƯỚC (có wheel soxr Windows), 3.13/3.14 để cuối.
  // Lý do & hướng nâng cấp: xem docs/multi-verse.md §12 (nợ kỹ thuật soxr/Python).
  const candidates = [
    { bin: 'py', args: ['-3.12'] },
    { bin: 'python3.12', args: [] },
    { bin: 'py', args: ['-3.11'] },
    { bin: 'python3.11', args: [] },
    { bin: 'py', args: ['-3.10'] },
    { bin: 'python3.10', args: [] },
    // Fallback cuối — 3.13/3.14 có thể FAIL ở bước soxr wheel (xem ghi chú trên).
    { bin: 'python3.13', args: [] },
    { bin: 'python3.14', args: [] },
    { bin: 'python', args: [] },
    { bin: 'python3', args: [] },
  ];

  for (const candidate of candidates) {
    const v = getVersion(candidate.bin, [...candidate.args, '-c', 'import sys; print(sys.version_info.major, sys.version_info.minor)']);
    if (v && v.major === 3 && v.minor >= 10 && v.minor <= 14) {
      return { ...candidate, version: v };
    }
  }
  return null;
}

function venvPython() {
  return process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');
}

const requirementsHashFile = join(venvDir, '.requirements.sha256');
const pythonVersionFile = join(venvDir, '.python-version');
const vieneuSnapshotFile = join(vieneuCacheDir, '.snapshot');
const previewSnapshotFile = join(voicePreviewsDir, '.snapshot');
const previewFiles = ['NF.wav', 'NF2.wav', 'SF.wav', 'NM1.wav', 'SM.wav'];

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readMarker(filePath) {
  if (!existsSync(filePath)) return '';
  try {
    return readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function writeMarker(filePath, value) {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${value}\n`, 'utf8');
}

function getSnapshotName() {
  const snapshotDir = findSnapshotDir(vieneuCacheDir);
  return snapshotDir ? basename(snapshotDir) : '';
}

function hasRequiredSnapshotFiles(snapshotName) {
  if (!snapshotName) return false;
  const snapshotDir = join(vieneuCacheDir, 'hub', 'models--pnnbao-ump--VieNeu-TTS-v3-Turbo', 'snapshots', snapshotName);
  return existsSync(join(snapshotDir, 'config.json'))
    && existsSync(join(snapshotDir, 'tokenizer.json'))
    && existsSync(join(snapshotDir, 'onnx'));
}

function existingVenvIsReusable() {
  if (!existsSync(pythonBin)) return false;
  if (readMarker(requirementsHashFile) !== hashFile(join(cwd, 'requirements.txt'))) return false;
  if (readMarker(pythonVersionFile) !== `${python.version.major}.${python.version.minor}`) return false;

  const smoke = runCapture(pythonBin, ['-c', 'import fastapi, uvicorn, soxr, onnxruntime, vieneu, PyInstaller; print("OK")']);
  return smoke.ok;
}

function previewsAreCurrent(snapshotName) {
  if (!snapshotName) return false;
  if (readMarker(previewSnapshotFile) !== snapshotName) return false;
  return previewFiles.every((fileName) => existsSync(join(voicePreviewsDir, fileName)));
}

// ─── Tìm Python ────────────────────────────────────────────────────────────
const python = findPython();
if (!python) fail('Khong tim thay Python 3.10-3.14. Hay cai dat Python hoac Python Launcher (py.exe).');
log(`Python ${python.version.major}.${python.version.minor} OK via ${python.bin}${python.args.length ? ' ' + python.args.join(' ') : ''}`);

// ─── Tạo venv ──────────────────────────────────────────────────────────────
const pythonBin = venvPython();
const requirementsHash = hashFile(join(cwd, 'requirements.txt'));

if (!forceRefresh && existingVenvIsReusable()) {
  log('Reuse venv hien co (requirements + smoke test OK).');
} else {
  log('Xoa venv cu va tao moi...');
  if (existsSync(venvDir)) rmSync(venvDir, { recursive: true, force: true });
  if (!run(python.bin, [...python.args, '-m', 'venv', 'venv'])) fail('Khong the tao venv');
}

if (!existsSync(pythonBin)) fail('Venv khong tao ra python executable');

// ─── Cài requirements ──────────────────────────────────────────────────────
if (forceRefresh || !existingVenvIsReusable()) {
  log('Cai dat requirements...');
  if (!run(pythonBin, ['-m', 'pip', 'install', '--upgrade', 'pip'])) fail('Khong the upgrade pip');
  log('Kiem tra wheel binary cua soxr...');
  const soxrCheck = runCapture(pythonBin, ['-m', 'pip', 'install', '--no-cache-dir', '--only-binary', 'soxr', 'numpy>=1.26,<2', 'soxr>=0.3,<0.4']);
  if (!soxrCheck.ok) {
    log('soxr wheel binary khong co hoac pip khong tai duoc wheel.');
    log(`soxr stderr tail: ${(soxrCheck.stderr || '').split('\n').filter(Boolean).slice(-8).join(' | ')}`);
    log(`Python dang dung: ${python.version.major}.${python.version.minor}. soxr 0.3.x KHONG co wheel Windows cho Python 3.13/3.14.`);
    log('CACH KHAC PHUC: cai Python 3.12 (hoac 3.11/3.10) tren may build, roi chay lai. Xem docs/tts-danh-gia-hien-trang hoac ghi chu trong build-win.js.');
    fail(`soxr khong co wheel binary phu hop cho Python ${python.version.major}.${python.version.minor}`);
  }
  if (!run(pythonBin, ['-m', 'pip', 'install', '--no-cache-dir', '--prefer-binary', '-r', 'requirements.txt'])) fail('Cai dat requirements that bai');
  if (!run(pythonBin, ['-m', 'pip', 'install', '--no-cache-dir', '--prefer-binary', 'pyinstaller'])) fail('Cai dat pyinstaller that bai');
  writeMarker(requirementsHashFile, requirementsHash);
  writeMarker(pythonVersionFile, `${python.version.major}.${python.version.minor}`);
}

// ─── Download VieNeu model ─────────────────────────────────────────────────
if (!existsSync(vieneuCacheDir)) mkdirSync(vieneuCacheDir, { recursive: true });
let snapshotName = getSnapshotName();
if (!forceRefresh && snapshotName && hasRequiredSnapshotFiles(snapshotName)) {
  log(`VieNeu cache OK (${snapshotName}), skip download.`);
  writeMarker(vieneuSnapshotFile, snapshotName);
} else {
  log(`Tai VieNeu models ve ${vieneuCacheDir} ...`);
  if (!run(pythonBin, ['-c', [
    'from vieneu import Vieneu',
    'import os',
    'import numpy as np',
    "print('[Model] Downloading...')",
    'tts = Vieneu()',
    "preset_audio = tts.infer('Xin chào', voice='Ngọc Lan', apply_watermark=False)",
    "print(f'[Model] Preset OK shape={preset_audio.shape}')",
    "ref_path = os.path.join(os.environ['VIENEU_REF_DIR'], 'nu-bac.wav')",
    "assert os.path.exists(ref_path), f'Missing cloned voice ref: {ref_path}'",
    'ref_codes = tts.encode_reference(ref_path)',
    "cloned_audio = tts.infer('Xin chào', ref_codes=ref_codes, apply_watermark=False)",
    "print(f'[Model] Cloned OK shape={cloned_audio.shape}')",
  ].join('; ')], { HF_HOME: vieneuCacheDir, VIENEU_REF_DIR: voiceRefDir })) fail('Download model hoac smoke test voice that bai');

  log('Resolve HF snapshot pointer files...');
  resolveSnapshotPointers(vieneuCacheDir);
  snapshotName = getSnapshotName();
  if (snapshotName) writeMarker(vieneuSnapshotFile, snapshotName);
}

// ─── Generate preview WAVs ─────────────────────────────────────────────────
if (!existsSync(voicePreviewsDir)) mkdirSync(voicePreviewsDir, { recursive: true });
if (!forceRefresh && snapshotName && previewsAreCurrent(snapshotName)) {
  log(`Voice previews OK (${snapshotName}), skip generation.`);
} else {
  log('Tao file WAV preview cho tung giong...');
  if (!run(pythonBin, [join('server', 'generate_previews.py')], {
    HF_HOME: vieneuCacheDir,
    VIENEU_PREVIEW_DIR: voicePreviewsDir,
    VIENEU_REF_DIR: voiceRefDir,
  })) {
    console.warn('[WARN] Mot so file preview co the bi loi, tiep tuc...');
  }
  if (snapshotName) writeMarker(previewSnapshotFile, snapshotName);
}

// ─── Stage bundled models vào resources/vn/ ───────────────────────────────
// electron-builder trỏ tới resources/vn (xem electron-builder.yml).
// HF cache (resources/vieneu) có snapshot format phức tạp → flatten sang vn/
// để runtime trên máy đích load ổn định.
log('Staging bundled runtime models vao resources/vn/ ...');
stageBundledModels();

// ─── FIX: Dùng spec file thay vì --onefile main.py ────────────────────────
// Spec file xử lý: collect_all(vieneu/onnxruntime/soxr), sea_g2p.bin, pathex
log('Dong goi vieneu-server bang PyInstaller (spec file)...');
const pyinstallerBin = join(cwd, 'venv', 'Scripts', 'pyinstaller.exe');
if (!existsSync(pyinstallerBin)) fail(`Khong tim thay pyinstaller.exe: ${pyinstallerBin}`);

if (!run(pyinstallerBin, ['--clean', 'vieneu-server.spec'])) fail('PyInstaller that bai');

// ─── Copy binary vào apps/shell-electron/resources/ ───────────────────────
log(`Copy binary vao ${shellResourcesDir} ...`);
if (!existsSync(shellResourcesDir)) mkdirSync(shellResourcesDir, { recursive: true });

const sourceExe = join(cwd, 'dist', 'vieneu-server.exe');
const targetExe = join(shellResourcesDir, 'vieneu-server.exe');
if (!existsSync(sourceExe)) fail(`Khong tim thay binary output: ${sourceExe}`);
copyFileSync(sourceExe, targetExe);

log('Dong goi hoan tat!');
log(`Binary: ${targetExe}`);

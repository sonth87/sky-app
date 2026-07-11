/**
 * stage-models.js — Flatten HF cache (resources/vieneu) → staged bundle (resources/vn).
 *
 * Dùng chung cho cả macOS (build.sh) và Windows (build-win.js): node stage-models.js
 *
 * Tại sao cần: HF cache (resources/vieneu) lưu snapshot dạng symlink trỏ vào blobs/.
 * Symlink không hoạt động ổn định khi bundle vào app đóng gói (nhất là Windows).
 * vn/ chứa file THẬT (đã đi theo symlink) nên runtime load được trên mọi OS.
 *
 * paths.ts (Electron) khi packaged trỏ HF_HOME = process.resourcesPath/vn cho cả mac + win,
 * nên cả 2 nền tảng đều cần bước staging này.
 */
const {
  existsSync, rmSync, mkdirSync, readdirSync,
  writeFileSync, copyFileSync, cpSync,
} = require('node:fs');
const { join, resolve, basename } = require('node:path');

const cwd = __dirname;                                    // apps/tts-service/
const rootDir = resolve(cwd, '..', '..');                 // monorepo root
const slideResourcesDir = join(rootDir, 'apps', 'slide', 'resources');
const vieneuCacheDir = join(slideResourcesDir, 'vieneu'); // nguồn: HF cache
const vieneuStageDir = join(slideResourcesDir, 'vn');     // đích: staged bundle
const stageSnapshotFile = join(vieneuStageDir, '.snapshot');
const forceRefresh = process.env.TTS_BUILD_FORCE === '1' || process.argv.includes('--force');

const MODEL_REPO = 'models--pnnbao-ump--VieNeu-TTS-v3-Turbo';
const CODEC_REPO = 'models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX';

function log(msg) {
  console.log(`[Stage] ${msg}`);
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

function copyFileSafe(src, dst) {
  mkdirSync(join(dst, '..'), { recursive: true });
  copyFileSync(src, dst);
}

function copyTree(src, dst) {
  cpSync(src, dst, { recursive: true, force: true });
}

function readMarker(filePath) {
  if (!existsSync(filePath)) return '';
  try {
    return require('node:fs').readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function writeMarker(filePath, value) {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${value}\n`, 'utf8');
}

function stageIsCurrent(snapshotName) {
  if (readMarker(stageSnapshotFile) !== snapshotName) return false;
  const hfRoot = join(vieneuStageDir, 'hub', MODEL_REPO);
  const snapDst = join(hfRoot, 'snapshots', snapshotName);
  return existsSync(join(snapDst, 'config.json'))
    && existsSync(join(snapDst, 'tokenizer.json'))
    && existsSync(join(snapDst, 'onnx'))
    && existsSync(join(hfRoot, 'refs', 'main'))
    && existsSync(join(hfRoot, 'blobs'))
    && existsSync(join(vieneuStageDir, 'sea_g2p', 'sea_g2p.bin'));
}

function findSnapshotDir(repoDir) {
  const hubDir = join(repoDir, 'hub');
  if (!existsSync(hubDir)) return null;
  for (const entry of readdirSync(hubDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(MODEL_REPO)) continue;
    const snapRoot = join(hubDir, entry.name, 'snapshots');
    if (!existsSync(snapRoot)) continue;
    const snaps = readdirSync(snapRoot, { withFileTypes: true }).filter((x) => x.isDirectory());
    if (snaps.length > 0) return join(snapRoot, snaps[0].name);
  }
  return null;
}

/** Tìm sea_g2p.bin trong venv site-packages (mac: lib/pythonX.Y, win: Lib). */
function findSeaG2pBin() {
  const candidates = [];
  // Windows: venv/Lib/site-packages/
  candidates.push(join(cwd, 'venv', 'Lib', 'site-packages', 'sea_g2p', 'sea_g2p.bin'));
  // macOS/Linux: venv/lib/pythonX.Y/site-packages/
  const libDir = join(cwd, 'venv', 'lib');
  if (existsSync(libDir)) {
    for (const entry of readdirSync(libDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('python')) {
        candidates.push(join(libDir, entry.name, 'site-packages', 'sea_g2p', 'sea_g2p.bin'));
      }
    }
  }
  return candidates.find((p) => existsSync(p)) || null;
}

function stageBundledModels() {
  const srcRepo = findSnapshotDir(vieneuCacheDir);
  if (!srcRepo) fail(`Khong tim thay snapshot VieNeu trong ${vieneuCacheDir}`);
  const snapshotName = basename(srcRepo);

  if (!forceRefresh && stageIsCurrent(snapshotName)) {
    log(`Stage cache OK (${snapshotName}), skip copy.`);
    return;
  }

  if (existsSync(vieneuStageDir)) rmSync(vieneuStageDir, { recursive: true, force: true });
  mkdirSync(vieneuStageDir, { recursive: true });

  const hfRoot = join(vieneuStageDir, 'hub', MODEL_REPO);
  const snapDst = join(hfRoot, 'snapshots', snapshotName);
  mkdirSync(snapDst, { recursive: true });
  copyTree(join(srcRepo, 'config.json'), join(snapDst, 'config.json'));
  copyTree(join(srcRepo, 'tokenizer.json'), join(snapDst, 'tokenizer.json'));
  copyTree(join(srcRepo, 'onnx'), join(snapDst, 'onnx'));
  copyTree(join(vieneuCacheDir, 'hub', MODEL_REPO, 'refs'), join(hfRoot, 'refs'));
  copyTree(join(vieneuCacheDir, 'hub', MODEL_REPO, 'blobs'), join(hfRoot, 'blobs'));

  const refsMain = join(hfRoot, 'refs', 'main');
  if (existsSync(refsMain)) writeFileSync(refsMain, snapshotName, 'utf8');

  const codecRepo = join(vieneuCacheDir, 'hub', CODEC_REPO);
  if (existsSync(codecRepo)) {
    copyTree(codecRepo, join(vieneuStageDir, 'hub', CODEC_REPO));
  }

  const seaG2pBinSrc = findSeaG2pBin();
  if (seaG2pBinSrc) {
    copyFileSafe(seaG2pBinSrc, join(vieneuStageDir, 'sea_g2p', 'sea_g2p.bin'));
    log('Staged sea_g2p.bin');
  } else {
    log('WARN: khong tim thay sea_g2p.bin trong venv');
  }

  writeMarker(stageSnapshotFile, snapshotName);
  log(`Staged bundled models to ${vieneuStageDir}`);
}

module.exports = { findSnapshotDir, stageBundledModels };

// Cho phép chạy độc lập: node stage-models.js
if (require.main === module) {
  stageBundledModels();
}

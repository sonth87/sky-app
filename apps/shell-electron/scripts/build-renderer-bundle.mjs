#!/usr/bin/env node
/**
 * build-renderer-bundle.mjs — GĐ8 OTA Update, Phase B.
 *
 * Đóng gói dist/ (đã build qua `electron-vite build` — script này KHÔNG tự
 * build) thành zip + manifest.json để publish lên hosting tĩnh (GitHub
 * Releases/S3/Cloudflare Pages...). Chạy: `pnpm build && pnpm build:renderer-bundle`.
 *
 * bundleVersion = package.json's "version" (SemVer thật, KHÔNG còn timestamp
 * — xem docs/dev/versioning.md's mục "OTA Update"). Nguồn sự thật cho
 * releaseNotes/minAppVersion là VERSION.json's entry mới nhất (entries[0]) —
 * KHÔNG tự tính gì, chỉ đọc. Trước khi chạy script này: bump package.json's
 * version + thêm entry mới vào VERSION.json (xem versioning.md's "Quy trình
 * BẮT BUỘC khi sửa code renderer/Electron").
 *
 * Output: apps/shell-electron/release-renderer/ (gitignored, local only) —
 * upload thủ công lên hosting đã chọn, rồi SỬA field "url" trong
 * manifest.json trỏ đúng URL zip thật trước khi publish manifest.json.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');
const distDir = join(appRoot, 'dist');
const outDir = join(appRoot, 'release-renderer');

/** Entry breaking:true GẦN NHẤT (mảng mới nhất ở đầu) — mọi bundle renderer
 * TỪ THỜI ĐIỂM ĐÓ trở đi (bao gồm entry hiện tại nếu nó breaking) phải yêu
 * cầu app tối thiểu version đó để tương thích IPC. */
function resolveMinAppVersion(entries) {
  const breakingEntry = entries.find((e) => e.breaking);
  return breakingEntry?.minAppVersion ?? breakingEntry?.version ?? undefined;
}

function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const rs = createReadStream(path);
    rs.on('data', (d) => hash.update(d));
    rs.on('error', reject);
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

function zipDir(srcDir, destZip) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destZip);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

async function main() {
  if (!existsSync(distDir) || !existsSync(join(distDir, 'index.html'))) {
    console.error(`[build-renderer-bundle] dist/ chưa build hoặc thiếu index.html — chạy "pnpm build" trước.`);
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf-8'));
  const versionData = JSON.parse(readFileSync(join(appRoot, 'VERSION.json'), 'utf-8'));
  const entries = versionData.entries;
  if (!entries?.length) {
    console.error('[build-renderer-bundle] VERSION.json rỗng — thêm 1 entry trước khi build.');
    process.exit(1);
  }
  const latestEntry = entries[0];

  if (latestEntry.version !== pkg.version) {
    console.error(
      `[build-renderer-bundle] VERSION.json's entry mới nhất (${latestEntry.version}) khác ` +
      `package.json's version (${pkg.version}) — bump 2 file cùng lúc trước khi build.`
    );
    process.exit(1);
  }

  const bundleVersion = pkg.version;
  const minAppVersion = resolveMinAppVersion(entries);
  const releaseNotes = latestEntry.summary;

  mkdirSync(outDir, { recursive: true });
  const zipName = `renderer-bundle-${bundleVersion}.zip`;
  const zipPath = join(outDir, zipName);

  console.log(`[build-renderer-bundle] zipping dist/ -> ${zipName} ...`);
  await zipDir(distDir, zipPath);

  const sizeBytes = statSync(zipPath).size;
  console.log(`[build-renderer-bundle] tính sha256 ...`);
  const sha256 = await sha256File(zipPath);

  const manifest = {
    schemaVersion: 2,
    bundleVersion,
    minAppVersion,
    releaseNotes,
    // Placeholder — SỬA TAY sau khi upload zip lên hosting đã chọn.
    url: `<REPLACE_WITH_UPLOADED_URL>/${zipName}`,
    sha256,
    sizeBytes,
    publishedAt: new Date().toISOString(),
  };

  const manifestPath = join(outDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`[build-renderer-bundle] xong:`);
  console.log(`  zip:      ${zipPath} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  manifest: ${manifestPath}`);
  console.log(`\n  Bước tiếp theo: upload "${zipName}" lên hosting tĩnh, sửa field "url" trong`);
  console.log(`  manifest.json trỏ đúng URL thật, rồi upload manifest.json.`);
}

main().catch((err) => {
  console.error('[build-renderer-bundle] lỗi:', err);
  process.exit(1);
});

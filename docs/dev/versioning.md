# Versioning — Quy tắc bump version

> Quy tắc BẮT BUỘC khi thay đổi code. Monorepo → mỗi package version độc lập, quản bằng **Changesets** + **SemVer**.

## Nguyên tắc

- **SemVer** `MAJOR.MINOR.PATCH` cho từng package trong `packages/*`, `modules/*`, `apps/*`.
- **Changesets** là công cụ chính: mỗi thay đổi đáng kể → tạo 1 changeset mô tả + mức bump. Version + CHANGELOG tự sinh khi release.
- **Không sửa tay `version` trong package.json** khi đã dùng Changesets (để `changeset version` làm) — trừ lần khởi tạo.

## Mức bump

| Mức | Khi nào | Ví dụ |
|---|---|---|
| **PATCH** (0.1.**0**→0.1.**1**) | Fix bug, sửa nhỏ không đổi API | sửa style, fix tính toán, cải thiện perf |
| **MINOR** (0.**1**.0→0.**2**.0) | Thêm tính năng, tương thích ngược | thêm app con, thêm port mới, thêm option |
| **MAJOR** (**0**.1.0→**1**.0.0) | Breaking change | đổi interface `AppModule`, đổi contract port, đổi format license |

**Đặc thù nền tảng:**
- Đổi **contract trong `packages/kernel`/`service-contracts`** → thường **MAJOR** (mọi app phụ thuộc). Cân nhắc kỹ, ghi 1 file mới trong [history/](./history/README.md).
- Thêm **app con mới** (`modules/*`) → **MINOR** của package app đó (không ảnh hưởng version core).
- Đổi **adapter** (`platform-*`) không đổi port → **PATCH/MINOR**.

## Độ chi tiết `summary` theo mức bump — BẮT BUỘC, khác nhau rõ rệt

`summary` trong `VERSION.json` **không phải ghi chú nội bộ** — nó là `releaseNotes` thật hiển thị cho **người dùng cuối** trong Settings > Update (`build-renderer-bundle.mjs` đọc thẳng `entries[0].summary` làm `manifest.releaseNotes` — xem code, không phải suy đoán). Vì vậy độ chi tiết bắt buộc khác nhau theo mức bump, không viết đồng đều:

| Mức | `summary` (người dùng cuối đọc trong app) | `detailsRef` (bắt buộc hay không) |
|---|---|---|
| **MAJOR** | 2-4 câu, giải thích rõ đổi gì + ảnh hưởng gì tới người dùng | **Bắt buộc** — trỏ tới 1 file mới trong `docs/dev/history/YYYY-MM-DD-slug.md` (bối cảnh kỹ thuật đầy đủ: tại sao, sửa gì, cân nhắc gì) |
| **MINOR** | 1-2 câu, nêu tính năng/thay đổi chính | **Bắt buộc** — cùng cơ chế trên |
| **PATCH** | 1 câu ngắn, kiểu "Fix lỗi X" | Không cần |

**Quy tắc gộp PATCH khi build lặp nhiều lần để test cùng 1 lỗi:** vẫn bump version + thêm entry MỚI mỗi lần build (để phân biệt build nào là build nào — `bundleVersion` phải khớp đúng 1 build cụ thể, không được tái dùng). Nhưng `summary` của các entry liên tiếp cùng sửa 1 lỗi **được phép lặp lại y hệt** (vd "Fix lỗi hiển thị tên sinh viên" ở cả 3 entry PATCH liên tiếp) — không cần viết diễn giải khác nhau cho mỗi lần build nội bộ. Chỉ cần khác nhau khi thực sự là fix khác nhau.

**`detailsRef`** (field mới trong entry `VERSION.json`, optional — chỉ có ở MAJOR/MINOR): string, đường dẫn tương đối từ `docs/dev/versioning.md` tới file trong `docs/dev/history/`, ví dụ `"history/2026-07-14-tts-studio-app-moi.md"`. Không hiển thị cho người dùng cuối (UI chỉ đọc `summary`) — dùng khi dev/AI cần tra lại "MINOR này thực chất đổi gì, tại sao".

**Ví dụ 1 entry MAJOR/MINOR đầy đủ:**
```json
{
  "version": "0.3.0",
  "date": "2026-07-14",
  "bump": "minor",
  "summary": "Thêm ứng dụng TTS Studio — chọn giọng đọc, chỉnh tốc độ, nhập văn bản và tạo file âm thanh riêng, lưu lại lịch sử các bản đã tạo để nghe/tải lại.",
  "breaking": true,
  "minAppVersion": "0.3.0",
  "detailsRef": "history/2026-07-14-tts-studio-app-moi.md"
}
```

## Quy trình (khi đã có Changesets)

```bash
# 1. Sau khi code xong, tạo changeset:
pnpm changeset            # chọn package bị ảnh hưởng + mức bump + mô tả

# 2. Commit cả code + file .changeset/*.md

# 3. Khi release (maintainer):
pnpm changeset version    # bump version + sinh CHANGELOG
pnpm changeset publish     # (nếu publish package)
```

## Phân biệt 3 loại "log" — KHÔNG trộn lẫn

| Loại | Ở đâu | Cho ai | Nội dung |
|---|---|---|---|
| **version** | `package.json` mỗi package | máy/tooling | số version SemVer |
| **CHANGELOG.md** | mỗi package (Changesets sinh) | người dùng | tính năng/fix theo góc nhìn dùng |
| **history/** | [dev/history/](./history/README.md) | dev/AI tương lai | quyết định kỹ thuật + LÝ DO + ngày |

→ Changeset mô tả **cho người dùng** (vào CHANGELOG). Quyết định kiến trúc/lý do sâu **cho dev** → tạo 1 file mới trong [history/](./history/README.md). Đừng nhét lý do kỹ thuật dài vào CHANGELOG, và đừng để history/ thành changelog.

## Version toàn nền tảng (app phân phối)

`apps/shell-electron` (bản đóng gói giao người dùng) có version riêng đại diện cả bản build (giống installer version). Bump khi release bản phân phối, độc lập với version các package con.

## OTA Update (GĐ8) — bundleVersion dùng CHUNG SemVer với version app

Kể từ GĐ8 (xem `docs/roadmap/plans/ota-update-strategy.md`), renderer của `apps/shell-electron` có thể tự cập nhật (Loại 1a). `bundleVersion` (trong `manifest.json` do `scripts/build-renderer-bundle.mjs` sinh ra) dùng **chung 1 số SemVer** với `apps/shell-electron/package.json`'s `"version"` — KHÔNG còn là timestamp riêng biệt (đã đổi 2026-07-13, xem lịch sử quyết định trong `docs/roadmap/plans/ota-update-strategy.md`). Lý do dùng chung: chỉ cần nhìn 1 con số để biết "app đang ở bản nào", đúng tinh thần SemVer (nhảy version xa, ví dụ 1.0→1.5, vẫn an toàn trong cùng MAJOR — xem mục "Quy trình BẮT BUỘC" bên dưới cho cách `minAppVersion` chặn renderer không tương thích).

`apps/shell-electron/VERSION.json` là **nguồn sự thật** cho lịch sử version — mỗi entry ghi version, ngày, mức bump, mô tả (dùng làm `releaseNotes` trong manifest), và có breaking IPC hay không (`breaking`/`minAppVersion`). `build-renderer-bundle.mjs` đọc entry mới nhất từ file này (không tự tính gì) khi đóng gói. Xem `electron/slide/renderer-updater.ts` cho chi tiết cơ chế áp dụng.

### Update qua file — tạm ẩn khỏi UI (2026-07-13)

`kernel:update:pickFile` (`electron/update-file-picker.ts`) cho phép user tự chọn 1 file `.zip`/`.dmg`/`.exe` áp dụng thẳng, KHÔNG qua kiểm soát version nào (`.zip` ghi đè `current.json` vô điều kiện, không so `minAppVersion`/`bundleVersion`) — khác OTA tự động luôn so qua 1 `manifest.json` duy nhất do server kiểm soát. Rủi ro: user có thể vô tình áp 1 bundle không tương thích IPC hiện tại (renderer gọi channel main process không tồn tại → crash khó chẩn đoán tại hiện trường buổi lễ).

→ Quyết định: ẩn nút "Chọn file cập nhật…" khỏi `SettingsUpdate.tsx` (device-layout) trong lúc chỉ có 1 kênh phân phối chính thức là OTA tự động. Code backend (IPC handler, `applyRendererZip()` dùng chung, `UpdateActions.pickUpdateFile`) GIỮ NGUYÊN — không xoá, có thể bật lại UI khi có nhu cầu thật (ví dụ máy hoàn toàn không mạng, nhận file qua USB) kèm thêm safeguard version-check trước khi bật lại.

### Quy tắc quyết định: đây là thay đổi Loại 1 hay Loại 2?

Thay đổi thuộc **Loại 1** (renderer OTA — chỉ cần `pnpm build:renderer-bundle` + publish `manifest.json`/zip, KHÔNG cần bump version app/GitHub Release) **chỉ khi và chỉ khi** toàn bộ thay đổi nằm trong code build ra `apps/shell-electron/dist/` (renderer: `apps/shell-electron/src/`, `modules/ceremony`, mọi package chỉ chạy trong renderer process) **VÀ** không đổi bất kỳ điều nào sau:

- Thêm/sửa/xoá bất kỳ IPC channel nào (`window.sky.invoke(channel, ...)` lẫn `window.slide.*`).
- `electron/preload.ts` (bridge exposure).
- Quyền OS mới, native module mới.
- Binary TTS (`apps/tts-service`) hay bất kỳ `extraResources` nào electron-builder đóng gói.
- Bất kỳ file nào trong `apps/shell-electron/electron/` (trừ chính hạ tầng renderer-updater — `electron/slide/renderer-updater.ts`, `electron/slide/env.ts` — khi đang phát triển nó, không áp dụng cho release thường).

Nếu **bất kỳ điều nào ở trên đúng** → đây là **Loại 2**, bắt buộc `pnpm dist` (electron-builder) + publish qua electron-updater/GitHub Release (Windows) hoặc phân phối thủ công `.dmg` (macOS, cho tới khi có code signing — xem `electron/update-checker.ts`).

**Không chắc → mặc định coi là Loại 2** (an toàn hơn — tránh renderer mới gọi IPC channel main process không tồn tại, gây crash khó chẩn đoán tại hiện trường buổi lễ).

### Quy trình BẮT BUỘC khi sửa code renderer/Electron (áp dụng cho AI lẫn dev)

Áp dụng cho **mọi thay đổi đáng công bố** (fix bug ảnh hưởng hành vi, tính năng mới) — **KHÔNG áp dụng** cho refactor nội bộ không đổi hành vi quan sát được, sửa comment, đổi format code.

**Bước 1 — Xác định Loại 1 hay Loại 2** theo đúng bảng ở trên (không lặp lại quy tắc ở đây — dẫn chiếu, tránh mâu thuẫn khi 1 trong 2 nơi bị sửa mà nơi kia quên cập nhật).

**Bước 2 — Bump version (LUÔN LUÔN, cả 2 Loại):**
1. Bump `apps/shell-electron/package.json`'s `"version"` theo mức SemVer phù hợp (bảng "Mức bump" đầu file này — PATCH/MINOR/MAJOR).
2. Thêm 1 entry MỚI vào **ĐẦU** mảng `apps/shell-electron/VERSION.json`'s `entries`:
   - `version`: PHẢI khớp `package.json`'s version vừa bump.
   - `date`: hôm nay (YYYY-MM-DD).
   - `bump`: mức đã dùng ở bước 1 (`'patch'|'minor'|'major'`).
   - `summary`: 1 câu mô tả NGƯỜI DÙNG đọc được (sẽ hiện trong Settings > Update làm release notes) — không viết thuật ngữ code nội bộ.
   - `breaking`: `true` NẾU VÀ CHỈ NẾU thay đổi thuộc Loại 2 (theo tiêu chí bảng Loại 1/Loại 2 ở trên). `false` nếu thuần Loại 1.
   - `minAppVersion`: CHỈ set khi `breaking: true`, giá trị = chính `version` entry này. Omit hoàn toàn nếu `breaking: false`.

**Bước 3 — KHÔNG tự chạy `build:renderer-bundle` ngay sau khi bump:**
Đóng gói + publish OTA là bước RELEASE riêng, do người vận hành quyết định thời điểm — sau khi code + bump version xong, DỪNG LẠI. Không tự chạy `pnpm build && pnpm build:renderer-bundle` trừ khi được yêu cầu rõ ràng.

**Nếu thay đổi thuộc Loại 2:** vẫn bump `package.json` + thêm entry `VERSION.json` như trên với `breaking: true`. Khác biệt: bản phân phối cho Loại 2 đi qua `pnpm dist`/electron-updater (không phải `build:renderer-bundle`) — nhưng entry `breaking: true` này vẫn quan trọng: nó đặt "mức sàn" `minAppVersion` cho MỌI bundle renderer OTA phát hành SAU THỜI ĐIỂM NÀY (`build-renderer-bundle.mjs`'s `resolveMinAppVersion()` tự động kế thừa từ entry `breaking:true` gần nhất, không cần set tay ở các entry Loại 1 tiếp theo).

**Ví dụ cụ thể:**
- Sửa 1 dòng CSS trong `modules/ceremony` → Loại 1, PATCH, `breaking: false`.
- Thêm 1 IPC channel mới trong `electron/slide/ipc.ts` → Loại 2, MINOR (tính năng mới, tương thích ngược — channel cũ vẫn còn), `breaking: true`, `minAppVersion` = version entry này.
- Đổi tên/xoá 1 IPC channel cũ (renderer gọi sẽ lỗi nếu chạy với main process cũ) → Loại 2, MAJOR nếu phá vỡ tương thích rộng, `breaking: true`.

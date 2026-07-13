# Đóng gói & phát hành

## Web (`apps/shell-web`)

```bash
pnpm dev:web              # dev server
pnpm --filter @sky-app/shell-web build   # → apps/shell-web/dist (static)
```

Deploy `dist/` lên web server/CDN tĩnh. Web luôn tự động ở bản mới nhất khi user load trang — không có khái niệm "cập nhật" thủ công (xem `docs/dev/versioning.md`'s mục OTA, `useUpdateActions()` trả `null` trên web nên mục "Update" tự ẩn khỏi Settings).

## Electron (`apps/shell-electron`) — electron-builder + TTS binary

Cấu hình: [`apps/shell-electron/electron-builder.yml`](../../apps/shell-electron/electron-builder.yml).

`dist:mac`/`dist:win`/`dist:all` (`apps/shell-electron/package.json`) tự chạy `pnpm --filter @sky-app/tts-service build:mac`/`build:win` **trước** khi đóng gói — bước này build binary TTS (Python → PyInstaller) và stage model AI vào `apps/shell-electron/resources/`, nơi `electron-builder.yml`'s `extraResources` bundle vào app cuối cùng. Không chạy thẳng `electron-builder` mà bỏ qua bước này — app vẫn mở được nhưng TTS không hoạt động (thiếu `vieneu-server`/`vieneu-server.exe` + model).

**Vì sao script tự chạy `electron-vite build` dù `turbo.json` đã khai `dependsOn: ["build"]`:** CI (`.github/workflows/build-shell-electron.yml`) gọi thẳng `pnpm --filter @sky-app/shell-electron dist:${target}`, KHÔNG qua `turbo run` — nên `dependsOn` của turbo không áp dụng ở đó, script phải tự đủ (self-contained). Khi chạy qua `pnpm app:mac` ở root (có qua turbo), renderer build 2 lần liên tiếp (turbo's `dependsOn` + script tự gọi) — dư vài giây, không phải lỗi. Cố tình giữ nguyên (không bỏ 1 trong 2 phía) để không phá đường CI.

### macOS (dev/test — máy phát triển)

```bash
pnpm dev:electron   # dev server
pnpm app:mac         # (từ root) → apps/shell-electron/release/*.dmg
```

- Chưa code-sign/notarize → lần đầu mở: **chuột phải → Open** (đủ cho test nội bộ, xem `electron-builder.yml`'s comment).
- Lần build TTS đầu tiên tải model VieNeu-TTS (~vài trăm MB) từ HuggingFace — cần mạng, mất vài phút. Các lần build sau **tái sử dụng cache** (venv, model, voice preview) nếu `requirements.txt`/Python version không đổi — xem mục "Cache & force rebuild" bên dưới.

### Windows (production — máy hội trường)

```bash
pnpm app:win         # (từ root) → apps/shell-electron/release/*.exe (NSIS installer)
```

- **Cross-build từ mac**: `electron-builder`'s NSIS installer cross-compile được từ mac không cần Wine (đã verify 2026-07-13, electron-builder 26) — **NHƯNG binary TTS (PyInstaller) không cross-compile được**, nó build cho chính OS đang chạy. `pnpm app:win`/`app:all` chạy trên mac sẽ tạo `.exe` hợp lệ nhưng **thiếu `vieneu-server.exe` thật** (TTS Windows không hoạt động). Muốn có bản Windows đầy đủ TTS, build trên **Windows thật** hoặc **CI Windows runner** (xem `.github/workflows/build-shell-electron.yml`).

#### ⚠️ Yêu cầu 1 lần trên mỗi máy Windows: bật Developer Mode

Lần build đầu tiên trên một máy Windows mới, electron-builder tải gói `winCodeSign`
(chứa cả tool ký mã macOS lẫn Windows đóng chung 1 file). Bên trong có **symbolic link**
(`libcrypto.dylib`, `libssl.dylib`) — Windows chỉ cho phép tạo symlink nếu chạy
Administrator hoặc đã bật **Developer Mode**. Nếu chưa bật, build sẽ báo lỗi:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

Cách xử lý (chỉ cần làm **1 lần** cho mỗi máy):

```powershell
powershell -ExecutionPolicy Bypass -File apps/shell-electron/scripts/windows-enable-symlinks.ps1
```

(Script tự xin quyền Administrator qua UAC để bật Developer Mode.) Hoặc bật thủ công:
Settings → Privacy & security → For developers → **Developer Mode**.

Nếu build đã lỡ chạy lỗi trước khi bật, xóa cache tải dở rồi build lại:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
```

> Build trên **CI Windows runner** (GitHub Actions) không gặp lỗi này vì các runner đã bật sẵn Developer Mode — đây cũng là lý do nên dùng CI cho bản production Windows.

#### soxr không có wheel binary cho Python 3.13/3.14 trên Windows

`apps/tts-service/requirements.txt` ghim `soxr>=0.3,<0.4` (do `vieneu` yêu cầu) — bản soxr này **không có wheel Windows cho Python 3.13/3.14**, chỉ build được từ source (cần compiler C++ thường không có sẵn trên máy build). `apps/tts-service/build-win.js`'s `findPython()` đã xử lý: dò ưu tiên Python 3.12 → 3.11 → 3.10 trước (có wheel soxr), 3.13/3.14 để fallback cuối cùng. Nếu máy build chỉ có Python 3.13+/không có Python Launcher (`py.exe`), lệnh build sẽ fail sớm và rõ ràng ở bước kiểm tra wheel soxr thay vì lỗi mù mờ giữa chừng — cài thêm Python 3.12 (`winget install Python.Python.3.12` hoặc python.org) là cách khắc phục.

## Cache & force rebuild (TTS binary)

`apps/tts-service/build.sh` (mac) và `build-win.js` (Windows) tự cache venv Python, model VieNeu đã tải, voice preview WAV, và bước "stage" (flatten HuggingFace cache → `resources/vn/`) — tránh xoá-tải-lại tài nguyên nặng (venv + model ~vài trăm MB) mỗi lần build. Điều kiện skip: hash `requirements.txt` khớp + Python version khớp + smoke-test import package OK (venv); snapshot model tồn tại đủ file cần thiết (model/preview/stage).

Ép rebuild toàn bộ (ví dụ sau khi đổi `requirements.txt` hoặc nghi ngờ cache hỏng):

```bash
# mac
pnpm --filter @sky-app/tts-service build:mac -- --force
# hoặc
TTS_BUILD_FORCE=1 pnpm --filter @sky-app/tts-service build:mac

# Windows
pnpm --filter @sky-app/tts-service build:win -- --force
```

**Lưu ý**: PyInstaller (bước đóng gói cuối, `--clean vieneu-server.spec`) **không có cache** — luôn chạy lại mỗi lần build, không phụ thuộc `--force`.

## Lưu ý đa nền tảng

| Vấn đề | Xử lý |
|--------|-------|
| Đường dẫn file | `path.join`/`join()` + `app.getPath('userData')`, không hardcode `/` hay `\` |
| Cổng `ws_port`/`http_port` | Kiểm tra cổng trống khi khởi động, fallback nếu bị chiếm |
| `SIGKILL` không hợp lệ trên Windows | `electron/slide/python-server.ts`'s `stopPythonServer()` dùng `kill('SIGTERM')`, fallback `kill()` (TerminateProcess) — không dùng `SIGKILL` trực tiếp |
| HuggingFace cache symlink giả trên Windows | `build-win.js`'s `resolveSnapshotPointers()` phát hiện file "pointer" (nội dung bắt đầu `../`, do Windows không tạo symlink Unix thật) và ghi đè bằng nội dung blob thật |
| Voice registry/ref clone ghi vào resources (read-only khi packaged) | `electron/slide/data/paths.ts`'s `vieneuUserDataDir()` tách hẳn ra `userData` (luôn ghi được), seed lần đầu từ bundle |
| Firewall Windows | Lần đầu chạy server có thể hỏi quyền mạng → người vận hành chọn **Allow** |

## Checklist phát hành

- [ ] `pnpm typecheck` pass toàn repo.
- [ ] Test `pnpm dev:electron` mở được, TTS hoạt động (dev mode dùng venv/model local, không qua `resources/`).
- [ ] Build mac (`pnpm app:mac`), mở thử `.dmg`/`.app`, xác nhận TTS server khởi động (kiểm tra log, không còn lỗi tải model qua mạng vì đã bundled).
- [ ] Build win trên CI hoặc máy Windows thật, test trên máy Windows thật.
- [ ] Test offline hoàn toàn (rút mạng sau khi mở app — model đã bundled sẵn, không cần tải).
- [ ] Bump version theo `docs/dev/versioning.md`'s "Quy trình BẮT BUỘC" (package.json + VERSION.json).

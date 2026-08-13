# Icon app đóng gói

`icon.svg` — nguồn gốc (ocean-sea-splash). `icon.png` — bản render 1024×1024 nền trong
suốt (qua `sharp`, `density: 384` để nét ở kích thước lớn), dùng trực tiếp cho:

- `../../electron-builder.yml`'s top-level `icon:` — electron-builder tự sinh `.icns`
  (mac)/`.ico` (win) từ 1 PNG ≥512×512, không cần chuẩn bị sẵn cả 2 định dạng.
- `../../electron/main.ts` — dock icon lúc `dev:app` (macOS, `app.dock.setIcon()`) + window/
  taskbar icon (`BrowserWindow`'s `icon` option, mọi platform).

**Đổi icon khác:** thay `icon.svg`, rồi render lại PNG:

```bash
node -e "require('sharp')('icon.svg', { density: 384 }).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile('icon.png')"
```

Không đặt icon trong `apps/shell-electron/resources/` — thư mục đó bị
`.gitignore` (là đích build TTS, xem `docs/dev/build-and-release.md`).

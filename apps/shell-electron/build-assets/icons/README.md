# Icon app đóng gói (chưa có — TODO)

Đặt icon thương hiệu Sky-App vào đây khi có asset thật, rồi khai trong
`../../electron-builder.yml`:

```yaml
mac:
  icon: build-assets/icons/icon.icns
win:
  icon: build-assets/icons/icon.ico
```

electron-builder cũng chấp nhận 1 `icon.png` (≥512×512, nền trong suốt) và
tự sinh `.icns`/`.ico` — không bắt buộc chuẩn bị sẵn cả 2 định dạng.

Không đặt icon trong `apps/shell-electron/resources/` — thư mục đó bị
`.gitignore` (là đích build TTS, xem `docs/dev/build-and-release.md`).

Cho tới khi có icon thật, `.dmg`/`.exe` build ra dùng icon mặc định của
Electron — không phải lỗi, chỉ chưa hoàn thiện thương hiệu.

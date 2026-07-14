# .vendor/

Tarball cục bộ của `@sonth87/device-layout` (repo riêng, không phải workspace member — xem `docs/architecture/overview.md` §6). KHÔNG commit `*.tgz` (xem `.gitignore`).

Tái tạo:

```bash
./scripts/vendor-device-layout.sh
pnpm install
```

Mặc định tìm device-layout ở `~/PROJECTS/device-layout`. Đổi bằng `DEVICE_LAYOUT_DIR=/path pnpm ...`.

Khi có cơ chế publish chính thức (npm registry riêng hoặc CI), bước này sẽ thay bằng cài đặt version thật — xem "Quyết định còn mở" trong `docs/architecture/overview.md`.

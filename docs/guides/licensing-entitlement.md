# Guide: Licensing & Entitlement — khóa/mở app-feature theo license

> Nền tảng hỗ trợ **activation theo tính năng**: license key quyết định app/feature nào được bật. Verify **offline-capable**.
>
> ⚠️ Code chưa tồn tại — mô tả thiết kế dự kiến (GĐ6).

## Mô hình

```
License key (cấp cho khách)
   = payload JSON  { entitlements: string[], expiry, deviceBinding? }
   + chữ ký Ed25519 (ký bằng PRIVATE key của bạn)

App nhúng PUBLIC key → verify chữ ký OFFLINE → tin payload → gate theo entitlements[]
```

- **Offline verify**: không cần mạng để kiểm license hợp lệ (chỉ cần public key nhúng sẵn).
- **Online refresh** (tùy chọn): định kỳ gọi license server lấy entitlements mới / thu hồi. KHÔNG chặn nếu offline.

## Entitlement là gì

Một chuỗi định danh quyền, quy ước phân cấp:
- `app.<id>` — quyền mở nguyên 1 app (vd `app.ceremony`).
- `feature.<app>.<name>` — quyền 1 tính năng con (vd `feature.ceremony.voice-clone`).

## Gate ở 2 tầng

### Tầng 1 — Launcher (mở app)

`AppModule.entitlement` khai quyền cần. `EntitlementGate` kiểm trước khi mở:
- Có → mở bình thường.
- Thiếu → app **ẩn khỏi dock** (`AppConfig.disabled` → device-layout's `IconGrid`
  lọc bỏ hẳn khỏi danh sách icon, xác nhận qua runtime — KHÔNG hiện mờ/khóa như
  bản nháp thiết kế ban đầu định hướng theo mfe-shell's gating; đó cần sửa
  device-layout's `IconGrid.tsx` để đổi, ngoài phạm vi GĐ6).

```ts
// kernel — pseudo
function canOpen(app: AppModule, lic: License): boolean {
  return !app.entitlement || lic.entitlements.includes(app.entitlement);
}
```

### Tầng 2 — Feature-flag trong app

```tsx
function MyApp({ platform }: AppContentProps) {
  const canClone = platform.entitlements.has('feature.ceremony.voice-clone');
  return <>{canClone ? <VoiceCloneButton/> : <UpgradeHint/>}</>;
}
```

## Verify flow (offline)

```
1. Đọc license (Electron: file + OS keystore | Web: localStorage/server) qua LicensePort
2. Verify chữ ký Ed25519 bằng public key nhúng
3. Kiểm expiry (+ deviceBinding nếu có)
4. Nạp entitlements[] vào EntitlementGate
5. (nền) online refresh nếu có mạng — cập nhật/thu hồi
```

## Cấp phát license key (phía bạn)

- Cần **private key** giữ bí mật (KHÔNG commit) để ký license.
- Công cụ gen key (CLI nội bộ) — *chưa thiết kế*, thuộc "quyết định còn mở" ([architecture/overview.md](../architecture/overview.md) §6).
- Quy ước: mỗi lần cấp key = 1 payload entitlements + expiry, ký, giao khách.

## Giới hạn (đặt kỳ vọng đúng)

Ed25519 offline verify **ngăn sửa entitlement thông thường** (user không tự thêm quyền vì không có private key). Nhưng KHÔNG chống được:
- Patch binary bỏ qua bước gate.
- Chia sẻ key hợp lệ (trừ khi có `deviceBinding` + online revoke).

→ Xác định rõ mức đe dọa thực tế trước khi đầu tư thêm (anti-tamper, obfuscation...). Với ngữ cảnh nội bộ/khách tin cậy, mức này thường đủ.

## Checklist khi thêm feature trả phí

- [ ] Đặt tên entitlement theo quy ước (`app.*` / `feature.*.*`)
- [ ] Khai `entitlement` trong `AppModule` (nếu gate cả app)
- [ ] Kiểm `platform.entitlements.has()` trong UI (nếu gate feature)
- [ ] Có nhánh degrade/hint rõ ràng khi thiếu quyền
- [ ] Cập nhật danh sách entitlement vào tài liệu app ([docs/apps/](../apps/))

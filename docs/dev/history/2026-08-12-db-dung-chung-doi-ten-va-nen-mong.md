# 2026-08-12 — DB dùng chung: đổi tên + nền móng cho Python nối vào

> Sonth chốt hướng kiến trúc: **một DB cho cả app**, mỗi module có bảng riêng đặt theo tiền
> tố module, và **tiến trình Python của tts-service cũng dùng chung DB đó** cho nhất quán.
> Đổi luôn tên `ceremony` → `sky-app`. Chấp nhận đánh đổi: Python nối thẳng DB sẽ không chạy
> ở chế độ web (DB nằm trong IndexedDB của trình duyệt) — chấp nhận được vì một số tính năng
> vốn đã chỉ chạy trên Electron.
>
> Đây là **Phase 0** của kế hoạch đó: chỉ nền móng, chưa cho Python đụng DB.

## Phát hiện đổi cách làm

**`ceremony-db` đã LÀ db dùng chung rồi** — 18 bảng từ 5 module (`layout_*` ×4, `event_*` ×3,
`data_source_*` ×2, `asset`, `ceremony`, `app_config`, `variable_registry`,
`field_mapping_profile`, `effect_preset`). Cái tên là di sản của module đầu tiên dùng nó.
Quy ước tiền tố cũng đã **tự hình thành** ở các module thêm sau. Nên việc cần làm là đặt lại
tên cho đúng thực tế và viết quy ước xuống, không phải xây mới.

**`sqlite3` ĐÃ nằm sẵn trong binary PyInstaller** — không cần thêm dependency, không phải
dựng lại venv. Bằng chứng ở `apps/tts-service/build/vieneu-server/PKG-00.toc`:
`_sqlite3.cpython-313-darwin.so`, kéo theo gián tiếp qua `vieneu` → `pandas` →
`pandas.io.sql` → `sqlite3`. **Vì là gián tiếp nên phải khai `'sqlite3'` vào `hiddenimports`**
ở Phase 1 — nếu `vieneu` bỏ nhánh pandas thì nó biến mất im lặng và chỉ lộ ra lúc chạy bản
đóng gói.

**`voice-registry.json` hiện đã là file 3 người ghi, không khoá gì cả** — Electron
(`seedUserVoiceDir`), tier `bundled`, và tier `ext` (hai tier **sống song song có chủ đích**,
`python-server.ts:20-30`). `_load_or_init` còn `_save()` lại file mỗi lần khởi động. Tức là
chuyển sang SQLite + WAL + `busy_timeout` **an toàn hơn hiện trạng**, không phải rủi ro mới —
đây là lập luận quyết định cho việc cho Python dùng DB.

## Bug 1 — tiến trình Python mồ côi, không ai giết được

`startPythonServerOnce` ghi đè state của tier mà không giết tiến trình cũ
(`python-server.ts:540-541`):

```ts
const st = newTierState(engineId);
tiers.set(tier, st);        // tham chiếu `proc` cũ mất, tiến trình vẫn sống
```

Đường tới đó: `waitForHealth` hết giờ (300s) nhưng tiến trình **vẫn sống** — nó thường đang
nạp model (VoxCPM đo thật ~118s, có ca vượt 300s). Nhánh đó chỉ `return`, không kill
(`:736-740`) → status `'error'` → lần `ensureTierForEngine` sau không vào nhánh `stopTier`
(chỉ gọi khi `mustRespawn`) → `tiers.set` ghi đè. Từ đó **không ai giết được nó nữa**, kể cả
`stopPythonServer()` lúc thoát app (nó duyệt `tiers`, mà entry cũ đã bị thay).

Cùng loại lỗi với ca 2026-08-05 đã ghi trong chính file đó.

**Sửa hai chỗ**: kill `proc` ở nhánh health-timeout; và `await stopTier(tier)` ở đầu
`startPythonServerOnce` nếu tier còn tiến trình sống.

**Phải sửa TRƯỚC khi cho Python nối DB**: một tiến trình mồ côi không giết được sẽ giữ
read-mark WAL và chặn checkpoint vô thời hạn.

## Bug 2 — `busy_timeout` đúng chỉ do trùng hợp

`better-sqlite3-executor.ts` mới set `journal_mode=WAL` + `foreign_keys=ON`. `busy_timeout`
đang là 5000ms **do mặc định của thư viện** (`better-sqlite3/lib/database.js:34`), và Python
`sqlite3.connect()` cũng mặc định 5.0s — hai bên trùng nhau tình cờ, không nơi nào khai.

Từ khi hai runtime khác nhau cùng mở một file, con số đó là **hợp đồng**, không còn là chi
tiết nội bộ. Đã khai tường minh. Một bản nâng cấp better-sqlite3 đổi mặc định sẽ biểu hiện
thành lỗi ghi ngắt quãng lúc hai bên cùng bận — rất khó chẩn đoán.

## Đổi tên

| Thứ | Cũ | Mới |
|---|---|---|
| Package | `@sky-app/ceremony-db` | `@sky-app/app-db` |
| Thư mục | `packages/ceremony-db` | `packages/app-db` (qua `git mv`, giữ lịch sử) |
| File DB | `ceremony-data/ceremony.db` | `ceremony-data/sky-app.db` |
| data-service | `data/ceremony.db` | `data/sky-app.db` |

20 file import được cập nhật.

**`migrateLegacyDbName()`** (`paths.ts`) đổi tên DB của bản cài cũ, gọi **trước** khi mở kết
nối đầu tiên trong `store.ts`'s `getExecutorOrOpen()`. Mở file mới trước rồi mới đổi tên là
tạo ra một DB rỗng và bỏ lại toàn bộ dữ liệu cũ ở tên cũ.

Đổi **cả 3 file** `.db`/`-wal`/`-shm`. Bỏ sót `-wal` là mất những giao dịch chưa checkpoint —
app không bao giờ đóng kết nối nên checkpoint chỉ xảy ra tự động theo ngưỡng, WAL có thể
đang giữ lượng ghi đáng kể.

**Hai thứ CỐ Ý không đổi tên:**

- **Thư mục `ceremony-data/`** — nó còn chứa `assets/` mà đường dẫn tương đối của chúng nằm
  trong DB (`asset.relativePath`) và trong protocol `ceremony-asset://`. Di chuyển tệp ảnh
  của người dùng để đổi một cái tên thư mục là rủi ro không tương xứng.
- **Tên IndexedDB `ceremony-db`** (chế độ web) — IndexedDB không có lệnh đổi tên; muốn đổi
  phải mở DB cũ, đọc toàn bộ bytes, ghi sang DB mới, xoá DB cũ. Một đường dữ liệu mới có thể
  hỏng giữa chừng, đổi lấy một cái tên người dùng không bao giờ nhìn thấy.

## Quy ước đặt tên bảng (AGENTS.md §2.1)

Bảng mới đặt `<module>_<tên>`. Migration 016 đổi `effect_preset` → `tts_effect_preset` —
bảng đó thêm hôm qua, chưa phát hành nên rẻ. **Nhóm bảng cũ để nguyên** (`ceremony`,
`app_config`, `asset`, `variable_registry`, `field_mapping_profile`): đang giữ dữ liệu thật,
mỗi cái kéo theo query + IPC handler + adapter, và migration không rollback được.

Cùng chỗ đó ghi 3 quy tắc cho việc nhiều tiến trình dùng chung DB, sẽ áp dụng ở Phase 1:
một chủ ghi mỗi bảng; chỉ Electron main chạy migration; mọi kết nối tự set pragma.

## Kiểm chứng

Migration 016 chạy thử cả hai kịch bản (qua driver sql.js):

- **DB mới**: 16 migration lên đủ, `tts_effect_preset` có 4 preset, bảng `effect_preset` cũ
  không còn.
- **DB đã ở v15 + 1 preset người dùng tự tạo**: sau migrate còn đủ 5 preset, preset của người
  dùng giữ nguyên.

`pnpm typecheck` 35/35. `pytest` 101/101. `pnpm -w test` 27/28 — lỗi còn lại là test timing
`module-tts-studio` đỏ **từ trước**, không liên quan.

⚠️ **Chưa kiểm được bằng app thật**: bước đổi tên DB cần chạy Electron với dữ liệu thật.
Xem "Còn phải làm".

## Còn phải làm

- **Kiểm `migrateLegacyDbName()` với dữ liệu thật** — backup `userData/ceremony-data/` trước.
  Ba kịch bản: (a) DB cũ → đổi tên đúng, layout/event/asset còn nguyên; (b) mở lại lần 2 →
  không đổi lại, không mất gì; (c) máy sạch → tạo thẳng `sky-app.db`.
- **Kiểm lỗi mồ côi**: hạ `HEALTH_TIMEOUT_MS` để ép timeout, rồi `ps` xác nhận không còn
  tiến trình Python nào sót sau khi thoát app.
- Phase 1-6 (Python nối DB, một giọng nhiều mẫu, lịch sử sinh audio, stories timeline, audio
  channels, STT+LLM) — xem `~/.claude/plans/h-y-l-n-k-ho-ch-parsed-pancake.md`.

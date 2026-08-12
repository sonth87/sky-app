# 2026-08-12 — Python nối vào DB dùng chung (Phase 1)

> Tiếp theo [Phase 0 — đổi tên DB + nền móng](./2026-08-12-db-dung-chung-doi-ten-va-nen-mong.md).
> Giờ cho tiến trình Python của tts-service thật sự đọc/ghi bảng `tts_voice` trong
> `sky-app.db` thay vì `voice-registry.json`.

## Vì sao an toàn hơn hiện trạng, không phải rủi ro mới

`voice-registry.json` từ trước tới nay đã là file **BA người ghi, không khoá gì cả**:
Electron seed lúc cài (`seedUserVoiceDir`), tiến trình Python tier `bundled`, và tier `ext`
— hai tier **sống song song có chủ đích** (đổi engine không giết tiến trình đang chạy, xem
`python-server.ts`'s docstring). Mỗi lần Python khởi động còn tự ghi đè lại file
(`_load_or_init` → `_save()`). Chuyển sang SQLite WAL + `busy_timeout` là siết chặt một lỗ
hổng đã tồn tại, không phải mở lỗ hổng mới.

## Nguyên tắc thiết kế: không tin tưởng suông vào thứ tự gọi

Electron migrate DB **trước** khi spawn Python — đúng, và đồng bộ (`bootstrapSlideBackend()`
ở `main.ts` chạy `ceremonyStore.loadFromDisk()` xong mới tới `startPythonServer()`, không có
`await` nào chen giữa). Nhưng lời hứa đó chỉ đứng vững do **vị trí gọi hàm** trong một file —
không có gì chặn code sau này gọi sai thứ tự.

Nên `db.py`'s `connect()` **tự kiểm** `SELECT MAX(version) FROM schema_version` mỗi lần, thay
vì tin Electron đã lo hết. Nếu schema thấp hơn `REQUIRED_SCHEMA_VERSION` (17 — migration tạo
`tts_voice`) hoặc bảng đó chưa tồn tại → trả `None`, rơi về JSON. Đây cũng là lưới an toàn
cho tình huống Electron và Python được đóng gói/cập nhật lệch nhau.

**`db.py` tuyệt đối không tự tạo bảng nào.** `migrate.ts` phía TypeScript không có khoá và
dùng `CREATE TABLE` trần — hai tiến trình cùng migrate là hỏng DB. Nguyên tắc này đã ghi vào
`AGENTS.md §2.1` ở Phase 0.

## Thiết kế: hai kho lưu trữ cùng API, chọn qua factory

`voice_registry.py` giờ có:

- **`VoiceRegistryJson`** — chính là class `VoiceRegistry` cũ, **đổi tên, không đổi 1 dòng
  logic nào**. Dùng khi chạy độc lập ngoài Electron, `verify_engine.py`, hoặc DB chưa sẵn sàng.
- **`VoiceRegistrySqlite`** — lưu trong bảng `tts_voice` (migration 017), cùng chữ ký API:
  `list_voices` / `get_voice` / `set_hidden` / `set_ref_text` / `add_cloned` /
  `find_by_source_catalog_id` / `delete_cloned` / `get_ref_path` / `get_preset_id`.
- **`create_voice_registry(registry_path, ref_dir)`** — điểm vào DUY NHẤT. `main.py` gọi hàm
  này thay vì constructor trực tiếp (1 dòng đổi). Chọn kho theo `db.connect()`.

`_ensure_presets()` (SQL) tương đương `_load_or_init`'s merge preset của bản JSON: `INSERT OR
IGNORE` 10 preset mỗi lần khởi tạo, tự nhận preset mới khi VieNeu update, không ghi đè preset
người dùng đã lỡ sửa (vd set `hidden=False`).

`_row_to_voice_dict()` chuyển 1 dòng SQL thành dict **cùng hình dạng** với entry JSON cũ:
`hidden` thành bool, `category_json`/`tags_json` parse ngược thành list, và **lọc bỏ mọi
field NULL** — JSON gốc chỉ có field nào thực sự được set, giữ đúng hình dạng để dễ đối
chiếu khi debug và không đổi hành vi ở phía gọi (toàn bộ call site dùng `.get()`).

## Nhập dữ liệu cũ — đúng một lần, không mất giọng đã clone

`_import_json_once()` chạy trong `create_voice_registry()` khi chọn SQL: nếu bảng đã có
≥1 cloned voice thì **dừng ngay** (đã nhập trước đó, hoặc người dùng đã clone giọng mới qua
SQL) — không có đường nào ghi đè. Nếu chưa, đọc `voice-registry.json`, `INSERT OR IGNORE`
từng cloned voice, rồi đổi tên file JSON thành `.imported.json` — **không xoá**, để đối
chiếu hoặc khôi phục thủ công nếu phát hiện nhập sai. File JSON hỏng hoặc không tồn tại →
bỏ qua êm, không chặn khởi động vì giọng preset vẫn dùng được ngay cả khi nhập thất bại.

`extra` field của `add_cloned()` bên JSON nhận **bất kỳ key nào** (`**(extra or {})`); bên
SQL phải biết trước tập cột nên liệt kê tường minh (`_CLONE_EXTRA_COLUMNS`... — thực ra map
trực tiếp trong câu INSERT): `ref_text, accent, category, tags, tagline, description,
source_catalog_id, source_lang`. Khớp đủ với 2 call site thật trong `main.py`
(`_import_catalog_entry`, `/voices/clone`) tại thời điểm viết — **thêm field mới vào `extra`
ở nơi gọi mà quên thêm cột SQL tương ứng thì field đó lặng lẽ không được lưu**, khác hẳn hành
vi "nhận bất kỳ key nào" của bản JSON. Đánh đổi có ý thức: SQL cần cột cố định.

## `hiddenimports` — khai tường minh dù đã có sẵn

`sqlite3` (stdlib) đã nằm trong binary PyInstaller hiện tại — bằng chứng ở
`build/vieneu-server/PKG-00.toc`: `_sqlite3.cpython-313-darwin.so`, kéo theo **gián tiếp**
qua `vieneu` → `pandas` → `pandas.io.sql`. Đã thêm `'sqlite3'` vào `hiddenimports` của
`vieneu-server.spec` để không phụ thuộc vào một nhánh import tình cờ của dependency khác —
nếu `vieneu` bỏ nhánh gradio/pandas ở bản sau, thiếu dòng này thì sqlite3 biến mất khỏi
binary một cách im lặng, chỉ lộ ra lúc chạy bản đóng gói.

## Kiểm chứng

63 test mới (`test_db.py` 9, `test_voice_registry_sqlite.py` 27 + phần còn lại của suite
136 tổng), toàn bộ pass, không hồi quy `VoiceRegistryJson` (logic không đổi, chỉ đổi tên).

**Kiểm end-to-end thật** — không chỉ mock: dùng driver `sql.js` chạy `runMigrations()`
**thật** (TypeScript thật, không phải bản SQL tay chép trong Python test) để sinh file
`.db`, rồi cho Python thật (`sqlite3` stdlib, không mock) nối vào qua `SKY_APP_DB_PATH`:

```
1. Python nối được vào DB do TypeScript migrate thật
2. create_voice_registry() chọn đúng VoiceRegistrySqlite
3. Tự động tạo 10 preset, đúng kỳ vọng
4. Thêm + đọc lại giọng clone thành công, category JSON round-trip đúng
```

Đây là bằng chứng schema hai phía (`017_tts_voice.ts` và `db.py`/`voice_registry.py`) khớp
nhau thật, không chỉ khớp trên giấy.

`pnpm typecheck` 35/35.

## Còn phải làm

- **Chưa kiểm bằng Electron thật.** `python-server.ts` đã thêm `SKY_APP_DB_PATH` vào env
  spawn, nhưng chưa chạy `pnpm dev` để xác nhận Python thật sự nối được vào DB do
  `ceremonyStore` migrate lúc khởi động app (khác với kịch bản e2e ở trên, vốn tự tay tạo
  file bằng script). Nên làm trước khi phát hành.
- `config_store.py` (advanced infer params + device + engine) **cố ý chưa đổi** — vẫn là
  JSON. Khác `voice-registry.json`, Electron còn **đọc** file này lúc khởi động
  (`readDeviceConfig()` quyết định tier trước khi Python kịp chạy) — chuyển sang SQL cần
  thiết kế thêm cho phía đọc sớm đó, để lại cho phase sau nếu cần.
- Phase 2 (một giọng nhiều file mẫu) sẽ thêm bảng `tts_voice_sample` — không đổi lại thiết
  kế `tts_voice` hiện tại, chỉ thêm quan hệ 1-n.

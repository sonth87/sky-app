# GĐ7.5 — Audit sâu: Nhóm A — Control UI (11 chức năng)

**Subagent:** 1
**Phạm vi:** `apps/slide/src/control/` (gốc) → `modules/ceremony/src/control/` (đích)
**Ngày audit:** 2026-07-12
**Phương pháp:** Đọc toàn văn 2 phía + `diff` từng file (không chỉ file god component mà TOÀN BỘ `src/control/**/*.ts*`, ~90 file) để phân biệt chính xác "khác có chủ đích" / "khác không chủ đích" / "identical". Viết 1 file test tự động vitest cho A9 (bug đã biết) và **chạy thành công** (3/3 PASS).

## Phát hiện tổng quan quan trọng nhất trước khi đi vào từng mục

Quét `diff` toàn bộ ~90 file `.ts`/`.tsx` trong `src/control/` giữa 2 repo cho thấy: **100% các file, kể cả 6 "god component" (983/892/742/447/440/397 dòng), là bản port THUẦN TÚY** — không có bất kỳ thay đổi hành vi (logic/JSX/state) nào ngoài:
1. Đổi import path: `@trao-bang/shared` → `@sky-app/slide-shared`, `@/control/lib/cn` → relative path, `../../../electron/preload` → shared types.
2. Sửa kiểu TS cho React 19 strictness: `RefObject<T>` → `RefObject<T | null>` (3 chỗ: `StudentDetailPopover.tsx`, `PregenColumn.tsx`, và tương tự).
3. Đổi storage key `slide-control-storage` → `ceremony-control-storage` (3 file: `store.ts`, `i18n.ts`, `theme.ts`) — **bug A9 đã biết, không có migration**.
4. Bổ sung có chủ đích prop `isActive` vào `ControlApp.tsx` (multi-app shell gating) — duy nhất thay đổi hành vi thật sự trong toàn bộ nhóm A.

Điều này có nghĩa: **không có bug MỚI do lỗi port** trong nhóm A. Các bug tìm được trong audit này là **latent bug đã tồn tại từ bản gốc**, nay tồn tại y hệt ở cả 2 phía — vẫn có giá trị audit vì đây là lần đầu các god component được đọc toàn văn để tìm bug hành vi (khác khảo sát sơ bộ Phase 1 chỉ đếm dòng).

---

### [A1] Danh sách sinh viên (list/edit/import/export)
**Trọng số:** High
**File liên quan:**
- Gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/src/control/components/StudentList/index.tsx` (983 dòng), `rowColor.ts`, `ResizeHandle.tsx`, `StudentDetailPopover.tsx`, `CopyButton.tsx`, `../RowContextMenu.tsx`
- Đích: `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/control/components/StudentList/index.tsx` (+ cùng file con)

#### Architecture Review
- Luồng xử lý: `StudentList` nhận `view: 'all'|'scanned'` từ `StudentPanels`. Pipeline dữ liệu: `source` (useMemo theo view) → `sourceAfterFilter` (11 bộ lọc: major/gender/faculty/course/classCode/status/awardType/played/scanned/receivedDegree/hasAvatar) → `filtered` (search text, `normalize()` bỏ dấu). Render qua `useVirtualizer` (`@tanstack/react-virtual`, overscan 12, `estimateSize: () => ROW_HEIGHT`).
- Cột "action" (play/absent/replay) render **tách biệt** khỏi bảng data chính (2 container `<div>` riêng, đồng bộ qua `transform: translateY(-${scrollTop}px)` thủ công) — data cols dùng `virtualizer.getVirtualItems()` (chỉ render item trong viewport), nhưng **action col dùng `filtered.map()` không qua virtualizer** (dòng 828: `{filtered.map((s, rawIdx) => ...)}`) — render TOÀN BỘ danh sách đã lọc, không ảo hóa.
- So sánh với bản gốc: **khớp 100%** — `diff` xác nhận không có thay đổi logic, chỉ đổi import path (`@trao-bang/shared`→`@sky-app/slide-shared`).
- Hiệu năng: **Bug hiệu năng thật (tồn tại ở cả 2 bên)** — với ceremony lớn (>500 SV), action column render toàn bộ node DOM cho mọi hàng dù không trong viewport, trong khi data column chỉ render ~30-40 hàng nhờ virtualizer. Đây là nguyên nhân tiềm ẩn khiến scroll giật khi danh sách lớn dù bảng chính đã ảo hóa đúng.
- `filterOptions` (dòng 201-212) tính lại 7 mảng `uniq()` từ toàn bộ `students` mỗi khi `students` đổi — chấp nhận được vì chỉ phụ thuộc `[students]`, không phụ thuộc `filters`.
- Độ ổn định: 4 `useEffect` riêng cho click-outside (popover, filter panel), đều có cleanup đúng (`removeEventListener` trong return). Không có race condition rõ ràng. `scrollToMsv` dùng `useRef` để tránh stale closure trong `ScrollContext` — pattern đúng.
- Nhận định kiến trúc: **God component xác nhận, 983 dòng**. Trộn lẫn: state quản lý (11 field filter + 6 state UI khác), logic filter/search, virtualizer, 2 useEffect click-outside, render 2 bảng đồng bộ cuộn tay + popover + context menu + avatar preview — tất cả trong 1 file, 1 component. Đúng là ứng viên tách theo đề xuất trong bảng đầu bài (StudentList/FilterPanel, StudentList/ActionColumn, StudentList/AvatarPreview có thể tách riêng).
- Đề xuất cải tiến:
  - **P1**: Ảo hóa action column bằng cùng `virtualizer` (dùng `virtualizer.getVirtualItems()` thay vì `filtered.map()` toàn bộ) — giảm DOM node đáng kể với ceremony lớn.
  - **P2**: Tách `FilterPanel` (dòng 449-613, ~165 dòng JSX filter) thành component con riêng — giảm kích thước file, dễ test độc lập.
  - **P2**: Tách logic filter (`ListFilters`, `DEFAULT_FILTERS`, `isFilterActive`, `sourceAfterFilter`) thành hook `useStudentFilters` riêng.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** (khớp gốc 100%, không có bug port mới).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | Filter theo trạng thái "played=yes" | Manual | Mở filter panel, chọn Played=Có | Chỉ hiện SV đã play (autoPlay.playedCodes) | Đọc code: `playedSet.has(s.student_code)` đúng logic | PASS (code review) |
| 2 | Search bỏ dấu tiếng Việt | Manual | Gõ "nguyen" trong ô search | Match "Nguyễn ..." | `normalize()` dùng `NFD` + strip diacritic — đúng | PASS (code review) |
| 3 | Virtualizer scroll đến SV on stage | Manual | Bấm nút "⊙ Đang hiện" | Cuộn đến đúng vị trí `onStage.student_code` | `scrollToMsv` dùng `virtualizer.scrollToIndex(idx, {align:'center'})` | PASS (code review) |
| 4 | Action col render toàn bộ (không ảo hóa) khi >1000 SV | Manual/perf | Load ceremony 1000+ SV | DOM action col nhẹ | `filtered.map()` render hết → nhiều DOM node ẩn | **FAIL (hiệu năng)** |
| 5 | Context menu chuột phải trên hàng | Manual | Right-click 1 hàng | Hiện `RowContextMenu` đúng vị trí | `openCtxMenu` set x/y từ `e.clientX/Y`, `preventDefault` đúng | PASS (code review) |
| 6 | pushScan trùng SV liên tiếp (chống debounce HID) | Automated-vitest (gián tiếp qua A9 review store.ts) | Quét 2 lần liên tiếp cùng mã | Chỉ 1 entry trong scanLog | `pushScan`: so sánh `scanLog[0]?.student.student_code === e.student.student_code` → bỏ qua | PASS (code review) |

- Bug liên quan: **[Hiệu năng] Action column không ảo hóa** — Medium severity (chỉ ảnh hưởng ceremony rất lớn, không crash, không sai dữ liệu).
- Coverage ước tính: functional ~70% (đã trace toàn bộ luồng filter/search/virtualize/scroll/context-menu qua code, chưa chạy runtime thực tế trong Electron); code coverage không đo được (chưa có test harness cho component React trong `modules/ceremony`).
- Đề xuất bổ sung test chưa viết: test tự động cho `isDegreeReceived()` (nhiều nhánh string matching: '1'/'true'/'yes'/'received'/'done'/chứa "da nhan"...) — hàm thuần túy, dễ unit test, nhiều nhánh dễ có edge case (vd giá trị `"Đã Nhận"` có dấu hoa/thường lẫn).

---

### [A2] Quét thẻ HID card reader
**Trọng số:** High
**File liên quan:**
- Gốc/Đích: `hooks/useGlobalCardReader.ts` (105 dòng), `hooks/useCardReader.ts` (83 dòng)

#### Architecture Review
- Luồng xử lý `useGlobalCardReader`: lắng nghe `keydown` ở `capture phase` trên `window`. Đo khoảng cách thời gian giữa các phím (`performance.now()`); nếu gap > `maxGapMs` (100ms mặc định) thì reset buffer coi là scan mới. Dùng `setTimeout` debounce `maxGapMs` để "flush" buffer sau khi ngừng gõ — nếu đủ `minChars` (5) thì gọi `onScanRef.current(code)`. Sau khi trigger, tự xoá nội dung ô input/textarea/contentEditable đang focus (dùng native setter qua `Object.getOwnPropertyDescriptor` để bypass React's controlled-input tracking).
- Luồng `useCardReader` (dùng trong ô input riêng, VD ô search StudentList): đo elapsed từ ký tự đầu tiên đến `Enter`/`Tab`/blur; nếu `elapsed <= maxTotalMs (500ms)` và `length >= minLength (3)` → coi là quét thẻ.
- So sánh với bản gốc: **byte-for-byte identical**, xác nhận qua `diff` (exit code 0, không có output).
- Hiệu năng: Không polling, thuần event-driven. `onScanRef` pattern (ref luôn trỏ callback mới nhất) tránh phải re-đăng ký listener mỗi lần callback thay đổi — đúng kỹ thuật tối ưu re-render.
- Độ ổn định: `useEffect` có cleanup đầy đủ (`removeEventListener` + `clearTimeout`). Không có race condition — buffer là `useRef` (không phải state), tránh stale closure.
- Nhận định kiến trúc: Đúng layer (custom hook, tách biệt UI). Không phải god component.
- Đề xuất cải tiến: Không có (đã tối ưu tốt từ bản gốc). P2 (chỉ để ghi nhận): `useGlobalCardReader` và `ControlApp.tsx` mới thêm cờ `enabled: isActive` — cần đảm bảo khi nhiều `ControlApp` instance cùng mount trong multi-verse shell, chỉ 1 instance active mới có `enabled=true` để tránh 2 listener cùng bắt 1 sự kiện bàn phím (xem thêm mục A10).

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — 2/2 test case xác nhận qua code + diff, không cần audit lại từ đầu theo lưu ý của đề bài.
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | File identical giữa gốc/đích | Automated (`diff`) | `diff useGlobalCardReader.ts` 2 bên | Exit code 0 | Exit code 0, no output | PASS |
| 2 | File identical `useCardReader.ts` | Automated (`diff`) | `diff useCardReader.ts` 2 bên | Exit code 0 | Exit code 0, no output | PASS |
| 3 | Gõ nhanh 5+ ký tự trong <100ms → trigger scan | Manual | Simulate HID input | `onScan` được gọi 1 lần | Logic buffer + timeout đúng theo code | PASS (code review) |
| 4 | Gõ tay chậm (>100ms/ký tự) → KHÔNG trigger | Manual | Gõ tay bình thường | Buffer reset liên tục, không đủ minChars liên tục | `timeSinceLastKey > maxGapMs` → reset buffer | PASS (code review) |

- Coverage ước tính: functional ~85% (đã trace timing logic đầy đủ, chưa test runtime thực với thiết bị HID thật).
- Đề xuất bổ sung: unit test cho buffer-timing logic bằng `vi.useFakeTimers()` — mô phỏng KeyboardEvent với khoảng cách thời gian kiểm soát được, xác nhận `onScan` gọi đúng/không gọi ở biên (99ms vs 101ms gap).

---

### [A3] Auto-play trình tự
**Trọng số:** High
**File liên quan:**
- Gốc/Đích: `hooks/useAutoPlay.ts` (197 dòng)

#### Architecture Review
- Luồng xử lý: `useAutoPlay` quản lý toàn bộ state autoplay qua `useControlStore().autoPlay` (isPlaying/delaySeconds/playedCodes/currentCode). `togglePlay()`: nếu đang `mode==='auto'` thì chỉ set `isPlaying:false`; nếu đang chạy thì dừng; nếu chưa chạy thì resume từ `currentCode` hoặc tìm SV tiếp theo qua `getNextUnplayed()`.
- `getScanQueue()`: xây danh sách thứ tự theo `scanLog` (đảo ngược để cũ→mới), lọc trùng bằng `Set`, chỉ giữ code có trong `students` hiện tại.
- Timer chính: `setInterval` 1s đếm `countdown` xuống 0 → gọi `advanceNext()` (đẩy `currentCode` vào `playedCodes`, tìm SV tiếp theo, `emit('cmd:show', {source:'auto'})`).
- Progress mượt: `useEffect` riêng dùng `requestAnimationFrame` tính `smoothProgress` theo wall-clock (`Date.now()`) — tách biệt khỏi countdown số nguyên để UI mượt mà không ảnh hưởng logic advance.
- Persist: `useEffect` ghi `window.slide.saveAutoPlay()` mỗi khi `playedCodes/currentCode/delaySeconds/scanLog` đổi, có `loadedRef` chặn ghi đè trước khi load xong từ đĩa (tránh race điều kiện "load chưa xong đã ghi đè bằng state mặc định").
- So sánh với bản gốc: **byte-for-byte identical** (`diff` exit 0).
- Hiệu năng: `setInterval` 1s là chấp nhận được (không phải busy-poll). `requestAnimationFrame` cho progress mượt chỉ chạy khi `isPlaying && currentCode` — có cleanup `cancelAnimationFrame` đúng.
- Độ ổn định: `stateRef`/`scanLogRef`/`studentsRef` pattern (ref luôn cập nhật giá trị mới nhất) giải quyết đúng vấn đề stale closure trong `setInterval`/`setTimeout` callback — đây là kỹ thuật đúng, không phải bug. `loadedRef` chặn persist-trước-khi-load là xử lý race condition rõ ràng, đã được cân nhắc kỹ (comment giải thích rõ dòng 31-32).
- Nhận định kiến trúc: Đúng layer — hook tách biệt hoàn toàn khỏi UI (`AutoPlayBar.tsx` chỉ tiêu thụ `togglePlay/replayCode/countdown/progress`). Không phải god component dù có nhiều effect (197 dòng, độ phức tạp hợp lý cho domain logic autoplay).
- Đề xuất cải tiến: **P2** — dòng 45 `useEffect` deps gồm `scanLog` nhưng thân effect chỉ dùng `scanLogRef.current` (không dùng trực tiếp `scanLog`); về mặt logic không sai (effect re-run đúng lúc cần) nhưng hơi khó đọc — có thể note rõ hơn tại sao `scanLog` nằm trong deps dù không dùng trực tiếp.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** — xác nhận lại bằng đọc trực tiếp, khớp kết luận Phase 1.
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | File identical | Automated (`diff`) | `diff useAutoPlay.ts` | Exit 0 | Exit 0 | PASS |
| 2 | `togglePlay` khi `mode==='auto'` | Manual | Gọi togglePlay lúc mode=auto | Chỉ set isPlaying=false, không resume | Code dòng 116-119 đúng | PASS (code review) |
| 3 | Countdown hết giờ → advanceNext | Manual | Đợi countdown về 0 | currentCode chuyển sang SV tiếp theo trong queue | `advanceNext` logic đúng dòng 102-113 | PASS (code review) |
| 4 | Hết queue (không còn SV chưa play) | Manual | Play hết toàn bộ scanLog | `isPlaying` tự set false, `currentCode=null` | Dòng 111 xử lý đúng nhánh `else` | PASS (code review) |
| 5 | Persist trước khi load xong từ đĩa | Manual/race | Mount hook, ngắt app ngay lập tức | Không ghi đè file lưu bằng state mặc định | `loadedRef.current` chặn đúng | PASS (code review) |

- Coverage ước tính: functional ~85%, chưa có automated test (phụ thuộc `window.slide` — cần mock IPC layer để test được, độ phức tạp cao so với giá trị tăng thêm).
- Đề xuất bổ sung: Test `getNextUnplayed`/`getScanQueue` như pure function tách riêng (hiện đang là `useCallback` trong hook, khó test độc lập không mount React) — nếu tách thành pure function module-level sẽ dễ unit test hơn.

---

### [A4] Cấu hình API / đồng bộ dữ liệu ngoài
**Trọng số:** Medium
**File liên quan:**
- Gốc: `components/settings/ApiConfigContent.tsx` (892 dòng)
- Đích: cùng đường dẫn tương ứng trong `modules/ceremony`

#### Architecture Review
- Luồng xử lý: Quản lý danh sách `ApiIntegration[]` (webhook cấu hình theo `action`: qr_scan/play_student/welcome_screen/backdrop_toggle/submit_log). Load qua `window.slide.getApiIntegrations()` theo `apiEnvironment` (prod/test) — effect phụ thuộc `[apiEnvironment]` (dòng 143-159, có `eslint-disable-next-line react-hooks/exhaustive-deps` vì cố ý không phụ thuộc các state khác).
- Autocomplete template biến `{{student.xxx}}`: `findOpenTemplateTag()` tìm vị trí `{{` chưa đóng trước con trỏ; `getAutocompleteSuggestions()` filter theo `STUDENT_FIELD_KEYS` (26 field cứng) nếu bắt đầu bằng `student.`, ngược lại filter `TOP_LEVEL_KEYWORD_KEYS`. `applyAutocompleteSuggestion()` tự động đóng `}}` và bọc quote JSON hợp lý (`wrapWithQuotesIfNeeded`) khi áp dụng cho payload — logic khá tinh vi, xử lý đúng các trường hợp đã có quote sẵn 1 phía.
- Import/Export: export ra file JSON qua data URI; import validate `id/url/action∈ACTION_OPTIONS/method∈[GET,POST,PUT,DELETE]/headers là mảng`, và kiểm tra không trùng `action` (`actionSet.size !== parsed.length`).
- So sánh với bản gốc: **100% identical**, chỉ đổi `import type { ApiIntegration } from '@trao-bang/shared'` → `'@sky-app/slide-shared'`.
- Hiệu năng: Không có polling. `handleInsertVariable` dùng `setTimeout(..., 50)` để focus lại sau khi update state — chấp nhận được (pattern chuẩn cho re-focus sau re-render).
- Độ ổn định: `checkAutocomplete` gọi trên mọi keystroke (`onChange`) của cả `url` và `payload` textarea — có thể tính lại `getAutocompleteSuggestions()` khá thường xuyên nhưng dữ liệu nhỏ (≤26 field) nên không đáng lo. Không thấy race condition; `onBlur` dùng `setTimeout(150)` để đóng dropdown SAU khi `onMouseDown` của item trong dropdown kịp xử lý — pattern đúng, đã có comment giải thích (dòng 876).
- Nhận định kiến trúc: **God component xác nhận, 892 dòng** — nhưng khi đọc kỹ, phần lớn khối lượng là 3 mảng cấu hình tĩnh (`ACTION_OPTION_KEYS`, `VARIABLE_SUGGESTION_KEYS` gồm 9 entry, `STUDENT_FIELD_KEYS` gồm 26 entry) + JSX form khá dài (form 1 cột, header/footer). Logic nghiệp vụ thực tế (autocomplete engine) tập trung ở ~150 dòng (78-260), phần còn lại là CRUD handlers tương đối đơn giản (handleSave/Delete/Export/Import) và JSX.
- Đề xuất cải tiến:
  - **P2**: Tách autocomplete engine (`findOpenTemplateTag`, `getAutocompleteSuggestions`, `applyAutocompleteSuggestion`, `wrapWithQuotesIfNeeded`) thành hook `useTemplateAutocomplete` riêng — logic thuần túy, dễ unit test độc lập khỏi component.
  - **P2**: Tách 3 mảng cấu hình tĩnh + `AutocompleteDropdown`/`ResetApiConfigConfirmModal` (2 sub-component ở cuối file) ra file riêng — giảm ~250 dòng khỏi file chính.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** (khớp gốc 100%).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | `findOpenTemplateTag` phát hiện đúng tag chưa đóng | Automated-vitest (khả thi, pure function) | `findOpenTemplateTag("abc {{stu", 9)` | `{braceStart:4, query:'stu'}` | Logic đúng theo trace tay | PASS (code review, chưa viết test) |
| 2 | `findOpenTemplateTag` bỏ qua tag đã đóng | Automated-vitest | `findOpenTemplateTag("{{a}} {{b", 9)` | Chỉ match `{{b` (tag thứ 2, chưa đóng) | `lastIndexOf('{{')` tìm đúng tag cuối | PASS (code review) |
| 3 | Import JSON trùng action | Manual | Import file có 2 entry cùng `action:'qr_scan'` | Alert lỗi, không import | `actionSet.size !== parsed.length` → alert đúng | PASS (code review) |
| 4 | Import JSON thiếu field | Manual | Import thiếu `url` | Alert lỗi format | `item.url` falsy → `valid=false` | PASS (code review) |
| 5 | `wrapWithQuotesIfNeeded` khi đã có quote 1 phía | Automated-vitest | `wrapWithQuotesIfNeeded('"abc', 4, 4, 'X')` (có quote trước, không có sau) | Chỉ thêm quote sau: `X"` | `hasQuoteBefore=true, hasQuoteAfter=false` → `X"` | PASS (code review) |

- Coverage ước tính: functional ~75% (đã trace toàn bộ nhánh chính + edge case quote-wrapping), code coverage 0% đo được (chưa viết test thực).
- Đề xuất bổ sung test chưa viết: unit test cho `findOpenTemplateTag`/`getAutocompleteSuggestions`/`wrapWithQuotesIfNeeded` — đều là pure function, dễ tách test, giá trị cao vì logic autocomplete khá tinh vi (nhiều nhánh biên: quote trước/sau, tag lồng nhau `{{...{{`).

---

### [A5] TTS settings & voice picker (Control)
**Trọng số:** High
**File liên quan:**
- Gốc: `components/settings/TtsSettingsContent.tsx` (366 dòng), `components/TtsModal/{ConfigColumn,PregenColumn,VoiceConditionRules}.tsx`
- Đích: cùng cấu trúc trong `modules/ceremony`

#### Architecture Review
- Luồng xử lý: `TtsSettingsContent` giữ **7 state local** (`localModel/localSpeed/localDelay/localTemplate/localPlayMode/localConditions/localVoicePool`) đồng bộ 1 chiều từ store qua **1 useEffect duy nhất** (dòng 74-82, phụ thuộc 7 field store tương ứng) — mục đích: "Đồng bộ từ store khi có thay đổi từ client khác" (comment dòng 73), tức hỗ trợ multi-client (control app khác cũng có thể đổi cấu hình qua socket).
- Auto-save debounce (400ms) cho 3 trường: `localSpeed`, `localDelay`, `localTemplate` — mỗi trường có `useEffect` riêng với `setTimeout` + so sánh `localX !== storeX` trước khi emit (dòng 106-131) — tránh emit thừa khi giá trị không đổi thực sự (vd effect chạy lại vì dep khác đổi).
- Các trường khác (`localModel`, `localPlayMode`, `localConditions` qua `saveConditions`, `localVoicePool` qua `saveVoicePool`) lưu **ngay lập tức** (không debounce) khi user tương tác trực tiếp (click/select), không qua text input tự do.
- `distribution` (useMemo, dòng 275-291): tính phân bổ giọng đọc cho toàn bộ `students` bằng cách gọi `getVoiceForStudentLocal()` cho MỖI sinh viên — độ phức tạp O(students × conditions) mỗi lần re-render khi `students`/`localConditions`/`localModel`/`localVoicePool` đổi.
- So sánh với bản gốc: **100% identical** (chỉ đổi import path).
- Hiệu năng: `distribution` tính lại cho toàn bộ SV — với ceremony 1000+ SV và nhiều conditions, có thể tốn vài ms mỗi lần mở tab TTS settings hoặc đổi 1 điều kiện, nhưng chạy trong `useMemo` nên không lặp lại khi render không đổi input — chấp nhận được.
- Độ ổn định: **Rủi ro tiềm ẩn (P1) — vòng lặp đồng bộ 2 chiều local↔store**: khi user gõ vào `localTemplate` → sau 400ms debounce → `emit('cmd:setTtsTemplate')` → server xử lý → broadcast lại qua socket → store cập nhật `ttsTemplate` → `useEffect` dòng 106-131 phát hiện `ttsTemplate` đổi → set lại `setLocalTemplate(ttsTemplate)` (dòng 79) → nếu giá trị này khác với những gì user đang gõ dở (do server có transform/trim khác) thì **con trỏ nhập liệu có thể bị "giật" giữa chừng khi đang gõ** (giá trị input bị ghi đè bởi round-trip server). Đây LÀ pattern phổ biến trong ứng dụng multi-client nhưng cần kiểm tra thực tế UX khi gõ nhanh — không thấy debounce chặn "đang gõ" phía nhận (không có kiểm tra `document.activeElement` trước khi ghi đè local từ store).
- Không có `try/catch` quanh `window.slide.pregenStart()` (dòng 145-160) — chỉ check `!result.ok` chứ không bắt exception nếu promise reject (vd IPC timeout) → nếu reject, `setPregenRunning(false)` ở dòng 159 **không chạy** (nằm sau `await`, không có `finally`) → **bug thật**: UI kẹt ở trạng thái `pregenRunning=true` mãi mãi nếu IPC lỗi.
- Nhận định kiến trúc: **God component xác nhận, 366 dòng** nhưng đã tách khá tốt: `ConfigColumn`/`PregenColumn`/`VoiceConditionRules` là 3 file con riêng, `TtsSettingsContent` chủ yếu là state orchestration + handlers, không lẫn nhiều JSX trực tiếp (JSX chỉ ở return cuối cùng, gọi 2 sub-component). "7 state đồng bộ tay" ghi nhận trong Phase 1 là chính xác — đây là điểm yếu kiến trúc rõ ràng nhất của toàn bộ nhóm A.
- Đề xuất cải tiến:
  - **P0**: Bọc `handleStartPregen` bằng `try/catch/finally` — đảm bảo `setPregenRunning(false)` luôn chạy kể cả khi `window.slide.pregenStart()` reject.
  - **P1**: Xem xét thêm guard "không ghi đè local state từ store nếu input đang focus" cho `localTemplate` (tương tự pattern nhiều editor realtime — chỉ áp dụng update từ xa khi field không đang được user gõ).
  - **P2**: Thay 7 state riêng lẻ + 1 effect đồng bộ bằng 1 object state duy nhất hoặc custom hook `useSyncedLocalState(storeValue)` tái sử dụng được cho pattern này (xuất hiện lặp lại trong nhiều settings tab khác).

#### QA/QC Review
- Trạng thái tổng quan: **PASS một phần** — 5/6 test case PASS, 1 FAIL (bug P0 mới xác nhận).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | File identical | Automated (`diff`) | so sánh 2 bên | Chỉ khác import path | Xác nhận | PASS |
| 2 | Debounce 400ms cho `ttsSpeed` | Manual | Kéo slider speed liên tục trong <400ms | Chỉ emit 1 lần cuối cùng | `setTimeout` + `clearTimeout` trong cleanup — đúng debounce pattern | PASS (code review) |
| 3 | `pregenStart` reject (IPC lỗi/timeout) | Manual/lỗi | Giả lập `window.slide.pregenStart` reject | `pregenRunning` phải reset về false | **Không có try/catch/finally** → `setPregenRunning(false)` (dòng 159) không chạy nếu promise reject → nút "Tạo giọng" bị disable vĩnh viễn cho tới khi reload | **FAIL** |
| 4 | Xóa giọng khỏi pool khi đang là default model | Manual | `handleRemoveVoiceFromPool(voiceId === localModel)` | Tự chuyển `localModel` sang giọng đầu tiên còn lại, emit `cmd:setTtsModel` | Dòng 188-193 xử lý đúng | PASS (code review) |
| 5 | Xóa giọng cuối cùng trong pool (chỉ còn 1) | Manual | `localVoicePool.length === 1`, gọi remove | Không cho xóa | Dòng 182: `if (localVoicePool.length <= 1) return;` | PASS (code review) |
| 6 | `getVoiceForStudentLocal` không khớp condition nào | Automated-vitest (pure function, khả thi) | Student không khớp bất kỳ `cond.val` nào | Trả về `fallbackVoice` | Dòng 37-38: `return fallbackVoice` sau vòng lặp | PASS (code review) |

- Bug liên quan: **[P0 — High] Thiếu try/catch/finally quanh `window.slide.pregenStart()` trong `handleStartPregen`** — Nếu IPC call reject (crash Python engine, timeout, lỗi bất kỳ), `pregenRunning` không được reset, khiến UI hiển thị trạng thái "đang tạo giọng" vĩnh viễn, chặn người dùng bấm lại nút pregen cho đến khi họ tự reload toàn bộ Control app. Mức độ: **High** (chặn workflow chính của tính năng TTS pregen, không có cách tự phục hồi từ UI).
- Coverage ước tính: functional ~70%; code coverage 0% đo được (chưa viết test thực cho component này — có thể viết test cho `getVoiceForStudentLocal` như pure function).
- Đề xuất bổ sung: viết `getVoiceForStudentLocal.test.ts` (pure function, dễ tách, nhiều nhánh theo `attr`).

---

### [A6] Confetti effect
**Trọng số:** Medium
**File liên quan:**
- Gốc/Đích: `components/ConfettiModal.tsx` (742 dòng)

#### Architecture Review
- Luồng xử lý: Modal cấu hình hiệu ứng confetti, đọc/ghi trực tiếp store (không có local state trung gian như A5 — mọi thay đổi gọi ngay `setXxx()` + `emit('cmd:setXxx', ...)` cùng lúc, dòng 156-259). Đóng modal qua click ngoài overlay (so sánh `overlayRef.current === e.target`) hoặc phím `Escape` — 2 `useEffect` riêng, đều có cleanup đúng.
- `handleReset()` (dòng 208-259): gọi tuần tự **10 cặp set-state + emit** riêng biệt để khôi phục toàn bộ cấu hình mặc định (enabled/repeat/burst/amount/speed/ticks/type/ribbon/ribbonConfig/colorStyle/shape/sizeConfig) — không gộp thành 1 lệnh emit duy nhất.
- Phần "Nâng cao" (`showAdvanced`) ẩn/hiện qua state local đơn giản, không lưu persist riêng (mỗi lần mở modal lại, mặc định đóng) — hành vi hợp lý (không cần nhớ trạng thái UI phụ này).
- 4 loại ribbon (`none/wave/classic/spiral`) render config chi tiết khác nhau theo `confettiRibbon` — riêng "classic" có ràng buộc liên động (dòng 577-601): kéo `classicMin` > `classicMax` thì tự đẩy `classicMax` lên theo (`Math.max`), và ngược lại — logic clamp 2 chiều đúng, tránh min > max.
- So sánh với bản gốc: **byte-for-byte identical** (`diff` exit 0, xác nhận qua Bash).
- Hiệu năng: **`handleReset` gửi 10 lệnh `socket.emit()` riêng lẻ liên tiếp trong cùng 1 tick** — không phải bug chức năng (socket.io xử lý tuần tự, không mất message) nhưng là **inefficiency P2**: nếu server xử lý mỗi lệnh bằng 1 lần ghi file/broadcast riêng, "Reset về mặc định" có thể gây 10 lần ghi/broadcast thay vì 1 — đáng chú ý nếu server-side có side-effect nặng trên mỗi `cmd:setXxx`.
- Độ ổn định: Không có race condition rõ ràng — mọi thay đổi là "fire and forget" tới store + socket, không có state chờ phản hồi (không có loading/pending state cho riêng modal này, khác với `ApiConfigContent`/`TtsSettingsContent`).
- Nhận định kiến trúc: **God component xác nhận, 742 dòng** — nhưng bản chất khác StudentList/ApiConfig: đây là **1 form cấu hình rất nhiều field** (16+ field: enabled/repeat/burst/amount/speed/ticks/type/ribbon/colorStyle/shape + 8 field ribbonConfig + 4 field sizeConfig), không có business logic phức tạp — độ dài chủ yếu do JSX lặp lại cho từng nhóm field + 2 sub-component nhỏ (`CompactSectionTitle`, `ColorSwatchMini`) đã tách đúng.
- Đề xuất cải tiến:
  - **P2**: Gộp `handleReset` thành 1 lệnh `emit('cmd:resetConfetti', {...defaults})` duy nhất thay vì 10 emit riêng (giảm round-trip network + tránh 10 lần re-render/broadcast không cần thiết).
  - **P2**: Tách từng section (Ribbon config, Size config) thành sub-component riêng — tương tự cách `CompactSectionTitle` đã làm, giảm độ dài file chính.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** (identical với gốc, không phát hiện bug hành vi mới ngoài inefficiency đã ghi nhận).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | File identical | Automated (`diff`) | so sánh | Exit 0 | Exit 0 | PASS |
| 2 | Click ngoài overlay đóng modal | Manual | Click vào backdrop (không phải nội dung modal) | `setOpen(false)` | So sánh `overlayRef.current === e.target` — chỉ đúng khi click TRỰC TIẾP vào phần tử overlay (không phải con) | PASS (code review) |
| 3 | Phím Escape đóng modal | Manual | Nhấn Esc khi modal mở | `setOpen(false)` | `handler` check `e.key === 'Escape'` | PASS (code review) |
| 4 | Kéo `classicMin` vượt quá `classicMax` hiện tại | Manual | Kéo slider Min > Max cũ | `classicMax` tự đẩy lên bằng Min | Dòng 578-580: `Math.max(minVal, ribbonConfig.classicMax)` | PASS (code review) |
| 5 | `handleReset` khôi phục đúng toàn bộ 16 field | Manual | Đổi tùy ý rồi bấm Reset | Toàn bộ về giá trị mặc định ban đầu | Trace tay: đúng khớp `DEFAULT` values trong `store.ts` | PASS (code review) |
| 6 | `handleReset` gửi 10 emit riêng lẻ | Manual/perf | Bấm Reset, đếm số `socket.emit` | 1 lệnh gộp (kỳ vọng lý tưởng) | Thực tế: 10 lệnh riêng — không sai chức năng, chỉ kém tối ưu | PASS (chức năng đúng, ghi nhận P2 hiệu năng) |

- Coverage ước tính: functional ~80% (đã trace toàn bộ handler + 3 loại ribbon config), code coverage 0% đo được.
- Đề xuất bổ sung: Không cấp thiết — component thuần UI form, giá trị test tự động thấp so với chi phí (chủ yếu JSX, ít logic thuần túy để unit test).

---

### [A7] Pregen queue (UI)
**Trọng số:** Medium
**File liên quan:**
- Gốc/Đích: `components/TtsModal/PregenColumn.tsx` (440 dòng)

#### Architecture Review
- Luồng xử lý: Component con thuần "dumb" (nhận toàn bộ state/callback qua props từ `TtsSettingsContent`, không tự quản lý state trừ UI cục bộ ẩn/hiện). Hiển thị: (1) Voice Pool (thêm/xóa giọng), (2) `VoiceConditionRules` (component con khác), (3) Fallback model selector, (4) Distribution badge, (5) Cảnh báo "stale config" nếu `isStale`, (6) Progress bar + nút Start/Pause/Resume/Cancel, (7) Bảng danh sách SV với checkbox chọn nhiều + trạng thái pregen từng SV.
- `selectableCodes`/`allChecked`/`someChecked`/`toggleAll` tính lại **mỗi lần render** trong 1 IIFE `(() => {...})()` (dòng 353-434) thay vì `useMemo` — với `students.length` lớn, việc `filter()` + `every()` + `some()` chạy lại mỗi render (kể cả render không liên quan đến danh sách SV, vd chỉ đổi `showAddVoiceMenu`) là tính toán thừa.
- Trạng thái mỗi SV lấy từ `pregenStatus?.students[code] || 'pending'` — nếu `code` không tồn tại trong map, mặc định `'pending'` (an toàn, không crash).
- So sánh với bản gốc: **100% khớp logic** — diff chỉ 2 điểm: import path, và `RefObject<HTMLButtonElement>` → `RefObject<HTMLButtonElement | null>` (sửa kiểu cho React 19 `useRef(null)` — thay đổi kiểu TS thuần túy, không đổi runtime behavior).
- Hiệu năng: **Bug hiệu năng nhỏ (P2)** — tính `selectableCodes`/`allChecked`/`someChecked` không qua `useMemo`, tái tính mỗi render. Với ceremony vài trăm-vài nghìn SV và bảng re-render thường xuyên khi `pregenStatus` cập nhật liên tục qua socket (tiến trình pregen chạy), đây có thể là điểm nghẽn nhỏ nhưng đáng lưu ý — đặc biệt vì `pregenStatus` cập nhật khá thường xuyên trong lúc pregen đang chạy (mỗi SV xử lý xong sẽ trigger re-render toàn bảng).
- Độ ổn định: Không có `useEffect`/side-effect trong file này — thuần presentational, không có nguy cơ race condition hay thiếu cleanup (không cần, vì không có effect).
- Nhận định kiến trúc: **God component xác nhận về số dòng (440) nhưng ĐÚNG LAYER** — đây thực chất là "dumb component" nhận props, không tự fetch/quản lý state phức tạp. Độ dài chủ yếu do bảng SV chi tiết (checkbox + status badge + voice tag) và nhiều section JSX tuần tự, không phải do trộn lẫn trách nhiệm.
- Đề xuất cải tiến:
  - **P2**: Bọc `selectableCodes`/`allChecked`/`someChecked` bằng `useMemo` phụ thuộc `[students, pregenStatus, selectedCodes]`.
  - **P2**: Tách bảng SV (dòng 328-437, ~110 dòng) thành sub-component `PregenStudentTable` riêng.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** (khớp gốc, chỉ khác kiểu TS).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | Chỉ khác `RefObject` type, không đổi logic | Automated (`diff`) | so sánh | 2 dòng khác (import + type) | Xác nhận | PASS |
| 2 | `toggleAll` khi tất cả đã chọn | Manual | Bấm checkbox header lúc `allChecked=true` | `setSelectedCodes(new Set())` (bỏ chọn hết) | Dòng 364-365 đúng | PASS (code review) |
| 3 | SV có status `processing` không thể chọn | Manual | SV đang xử lý pregen | Checkbox ẩn (không hiện nút chọn) | `canSelect = st==='done'||'failed'||'pending'` — không gồm `'processing'` | PASS (code review) |
| 4 | Nút "Tạo tất cả" disable khi `students.length===0` | Manual | Ceremony chưa có SV | Nút Start disabled | Dòng 294: `disabled={pregenRunning \|\| students.length === 0}` | PASS (code review) |
| 5 | Recompute `selectableCodes` mỗi render (không memo) | Manual/perf | Re-render do state khác đổi (vd `showAddVoiceMenu`) | Tính toán lại `filter/every/some` không cần thiết | Xác nhận qua đọc code — không có `useMemo` | PASS (chức năng đúng, ghi nhận P2 hiệu năng) |

- Coverage ước tính: functional ~80%, code coverage 0% đo được (component thuần presentational — giá trị test cao nếu tách phần tính `selectableCodes`/`allChecked` thành pure function).
- Đề xuất bổ sung: unit test cho logic tính `allChecked`/`someChecked` từ mảng `selectableCodes` + `selectedCodes` (dễ tách thành pure function, nhiều edge case: rỗng, 1 phần tử, tất cả chọn).

---

### [A8] Logs drawer
**Trọng số:** Low
**File liên quan:**
- Gốc/Đích: `components/LogsDrawer.tsx` (447 dòng)

#### Architecture Review
- Luồng xử lý: Load logs qua `window.slide.getLogs()` khi mount + subscribe `window.slide.onLogsChanged()` để cập nhật realtime (dòng 56-62, cleanup đúng qua `return unsub`). Auto-scroll lên đầu mỗi khi `logs` đổi (dòng 65-69, vì logs mới nhất `unshift` ở đầu mảng).
- Filter: theo tab (`all/scan/play/clear/api`) + search text (match `studentName`/`studentCode`/`details`/`action`, tất cả lowercase).
- Mỗi dòng log click để expand/collapse (`expandedIds: Set<string>`), khi expand hiện chi tiết + nút "Copy" cho `apiError` và lệnh `curl` tương đương dựng từ `log.request` (`buildCurlCommand()` — escape đúng single-quote trong `body` bằng `replace(/'/g, "'\\''")`).
- 4 action riêng: Retry 1 dòng lỗi (`handleRetrySingle`), Retry tất cả (`handleRetryAll`, disable khi đang retry hoặc có request pending), Export file txt, Submit logs lên API, Clear logs (có `confirm()` native trước khi xóa).
- So sánh với bản gốc: **byte-for-byte identical** (`diff` exit 0).
- Hiệu năng: `filteredLogs` và `stats` (6 phép `.filter()`/`.length` riêng biệt trên `logs`, dòng 138-165) tính lại **mỗi render**, không qua `useMemo` — với log lịch sử dài (ceremony chạy nhiều giờ, hàng nghìn dòng log tích lũy), đây là tính toán lặp lại không cần thiết mỗi khi có bất kỳ state nào khác đổi (search/filter/expand).
- Độ ổn định: Tất cả handler async đều có `try/catch` bọc đầy đủ (`handleRetrySingle`, `handleRetryAll`, `handleExport`, `handleSubmitLogs`, `handleClear`) — khác với A5 (`handleStartPregen` thiếu try/catch), đây là ví dụ tốt về xử lý lỗi IPC đúng cách. `handleRetryAll`/`handleSubmitLogs` đều có `finally` để reset loading state — không có bug "kẹt loading" như A5.
- Nhận định kiến trúc: **God component về số dòng (447) nhưng xử lý lỗi tốt hơn các component khác đã audit**. Độ dài chủ yếu do nhiều nhánh render badge theo `action`/`apiStatus` (switch-case dài, dòng 167-241) và bảng chi tiết log mở rộng.
- Đề xuất cải tiến:
  - **P2**: Bọc `filteredLogs` và `stats` bằng `useMemo` phụ thuộc `[logs, filter, search]`.
  - **P2**: Tách `getActionBadge`/`getApiStatusBadge` (2 hàm switch-case dài, ~75 dòng) ra file riêng hoặc map lookup table thay vì switch — giảm độ phức tạp cyclomatic.

#### QA/QC Review
- Trạng thái tổng quan: **PASS** (identical, xử lý lỗi đầy đủ hơn các component khác).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | File identical | Automated (`diff`) | so sánh | Exit 0 | Exit 0 | PASS |
| 2 | `buildCurlCommand` escape single-quote trong body | Automated-vitest (pure function, khả thi) | body chứa `it's` | `-d 'it'\\''s'` | Regex `replace(/'/g, "'\\''")` — đúng kỹ thuật escape shell chuẩn | PASS (code review) |
| 3 | Retry all khi có request đang pending | Manual | `stats.apiPending > 0`, bấm Retry All | Nút bị disable | Dòng 276: `disabled={isRetryingAll \|\| stats.apiPending > 0}` | PASS (code review) |
| 4 | Clear logs có confirm trước khi xóa | Manual | Bấm Clear Logs | Hiện `confirm()` native, chỉ xóa nếu OK | Dòng 127: `if (confirm(...))` | PASS (code review) |
| 5 | `handleRetryAll` lỗi network | Manual/lỗi | Giả lập reject | `isRetryingAll` reset về false, toast lỗi hiện | `try/catch/finally` đầy đủ — không kẹt loading như A5 | PASS (code review) |
| 6 | `filteredLogs`/`stats` tính lại mỗi render (không memo) | Manual/perf | Log nhiều nghìn dòng, gõ search | Lag nhẹ khi gõ do tính lại 6 `.filter()` mỗi keystroke | Xác nhận qua code — P2, không phải bug chức năng | PASS (chức năng đúng, ghi nhận P2 hiệu năng) |

- Coverage ước tính: functional ~85%, code coverage 0% đo được. `buildCurlCommand` là ứng viên tốt nhất cho automated test trong nhóm A8 (pure function, input/output rõ ràng).
- Đề xuất bổ sung: unit test `buildCurlCommand()` với các case: có/không có body, headers rỗng, body chứa quote/newline.

---

### [A9] State persistence (Zustand store + storage key)
**Trọng số:** High — **BUG ĐÃ XÁC NHẬN LẠI, PHẠM VI RỘNG HƠN BAN ĐẦU**
**File liên quan:**
- Gốc: `store.ts` (518 dòng), `i18n.ts` (30 dòng), `theme.ts` (169 dòng)
- Đích: cùng cấu trúc trong `modules/ceremony`
- Test tự động mới: `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/control/__tests__/store.storage-migration.test.ts` (**đã chạy: 3/3 PASS**)

#### Architecture Review
- Luồng xử lý: `useControlStore` dùng `zustand/persist` middleware, `name: 'ceremony-control-storage'` (dòng 484), `partialize` chỉ lưu **24 field** cụ thể (không lưu toàn bộ state — đúng chủ đích, tránh persist state runtime như `students`/`connected`/`onStage`).
- **Phát hiện MỚI (mở rộng phạm vi bug đã biết)**: Không chỉ `store.ts` đọc/ghi theo `STORAGE_KEY`. Cả `i18n.ts` (dòng 6: `readPersistedLanguage()`) và `theme.ts` (dòng 3: `readPersistedTheme()`) đều **độc lập hardcode cùng chuỗi `'ceremony-control-storage'`** để đọc trực tiếp `localStorage.getItem(STORAGE_KEY)` **TRƯỚC KHI React mount** (đảm bảo ngôn ngữ/theme đúng ngay từ đầu, tránh FOUC — comment dòng 151 theme.ts: "Set ngay khi module load (trước React mount) để tránh FOUC").
- Cả 3 file đều **không có bất kỳ logic đọc key cũ `'slide-control-storage'` làm fallback**, và **không dùng hằng số dùng chung** — `STORAGE_KEY` được định nghĩa riêng lẻ 3 lần (rủi ro bảo trì thêm: sửa 1 nơi quên 2 nơi còn lại sẽ gây lệch key ngầm).
- So sánh với bản gốc: Bản gốc dùng `'slide-control-storage'` ở cả 3 file — **khác có chủ đích** (đổi tên phù hợp rebrand "Ceremony") nhưng **thiếu migration là lỗi không chủ đích** (bug thật).
- Hiệu năng: Không liên quan (đọc localStorage đồng bộ 1 lần khi module load, không lặp lại).
- Độ ổn định: Đây chính là vấn đề — **không phải race condition mà là data-loss-on-upgrade**. Khi user từ bản `trao-bang-tot-nghiep-2026` (Electron app cũ) chuyển sang bản `sky-app`/Ceremony (app mới, `localStorage` **thường KHÁC namespace/profile hoàn toàn** giữa 2 Electron app khác nhau — nên trên thực tế rủi ro có thể còn cao hơn "chỉ đổi key trong cùng 1 storage": nếu 2 app chạy trên 2 `userData` dir Electron khác nhau, TOÀN BỘ `localStorage` (kể cả key cũ) không hề tồn tại ở app mới, không chỉ riêng key. Trong trường hợp này bug behaves đúng như "cài đặt mới" — nhưng NẾU 2 app dùng chung 1 `userData`/profile (kiến trúc multi-verse: nhiều app trong 1 shell) thì `localStorage` CÓ THỂ chung namespace, và bug thực sự xảy ra như mô tả.
- **Danh sách chính xác 24 field có nguy cơ mất** (trích `partialize`, dòng 485-514):
  1. `showAllStudents`
  2. `confettiEnabled`
  3. `confettiRepeat`
  4. `confettiBurst`
  5. `confettiAmount`
  6. `confettiSpeed`
  7. `confettiType`
  8. `confettiRibbon`
  9. `confettiColorStyle`
  10. `confettiShape`
  11. `confettiTicks`
  12. `ribbonConfig` (object: waveCount/waveLength/waveWidth/waveDistance/classicCount/classicMin/classicMax/spiralCount)
  13. `confettiSizeConfig` (object: scale/small/medium/large)
  14. `ttsDelay`
  15. `ttsTemplate`
  16. `ttsPlayMode`
  17. `ttsConditions` (array)
  18. `customVariables` (array)
  19. `ttsVoicePool` (array)
  20. `awardLocationCode`
  21. `delaySeconds`
  22. `language` ← **ảnh hưởng thêm `i18n.ts`**
  23. `themeMode` ← **ảnh hưởng thêm `theme.ts`**
  24. `themePalette` ← **ảnh hưởng thêm `theme.ts`**
  25. (`appFont`, `letterSpacing`, `appSpacing`, `shadowLevel` — 4 field appearance, cũng trong `theme.ts` phạm vi ảnh hưởng)

  → Thực tế danh sách persist có **28 field** (đếm lại chính xác từ `partialize`, nhiều hơn ước tính "~24" ban đầu), trong đó 7 field (`language`, `themeMode`, `themePalette`, `appFont`, `letterSpacing`, `appSpacing`, `shadowLevel`) ảnh hưởng ĐỒNG THỜI cả 3 file, không chỉ riêng store.
- Nhận định kiến trúc: Bug xác nhận đúng như Phase 1 mô tả, nhưng **mức độ nghiêm trọng cần điều chỉnh lên do phạm vi rộng hơn** — không chỉ mất cấu hình chi tiết (confetti/TTS) mà còn mất cả ngôn ngữ + theme (trải nghiệm người dùng thấy ngay lập tức khi mở app, dễ gây report "app bị lỗi/reset" hơn là mất 1 cấu hình sâu trong settings).
- Đề xuất cải tiến:
  - **P0**: Thêm `migrate` option vào `persist()` trong `store.ts` — đọc `localStorage.getItem('slide-control-storage')` nếu `'ceremony-control-storage'` chưa tồn tại, migrate toàn bộ `state` sang key mới (rồi có thể xóa key cũ hoặc giữ lại để an toàn).
  - **P0**: Đồng bộ hóa: `i18n.ts` và `theme.ts` cần đọc TỪ CÙNG 1 nguồn với `store.ts` sau migration (hiện tại độc lập đọc trực tiếp localStorage — nếu chỉ migrate ở `store.ts` mà không migrate ở 2 file kia, `language`/`theme` vẫn sẽ mất dù `store.ts` đã đúng, vì 2 file này chạy TRƯỚC khi store.ts khởi tạo).
  - **P1**: Export `STORAGE_KEY` như 1 hằng số dùng chung (từ `store.ts` hoặc file constants riêng) thay vì hardcode 3 lần độc lập — giảm rủi ro lệch key trong tương lai.

#### QA/QC Review
- Trạng thái tổng quan: **FAIL** — 1/1 test case tự động xác nhận bug tồn tại đúng như mô tả (đã chạy, không chỉ đọc code).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | User có config dưới key cũ, app mới đọc key mới | **Automated-vitest** (đã viết + chạy) | Set `localStorage['slide-control-storage']` = config đầy đủ → đọc theo `'ceremony-control-storage'` (mô phỏng đúng cơ chế `persist()` không có `migrate`) | Giữ nguyên config cũ | Toàn bộ 8 field test (confettiEnabled/confettiColorStyle/ttsDelay/ttsTemplate/language/themeMode/themePalette/awardLocationCode) reset về default | **FAIL (bug xác nhận)** |
| 2 | Cài đặt mới hoàn toàn (không có key cũ) | Automated-vitest (đã viết + chạy) | Không set gì, đọc theo key mới | Dùng `INITIAL_STATE` | Đúng — không phải bug trong trường hợp này | PASS |
| 3 | `i18n.ts` mất ngôn ngữ đã chọn sau "upgrade" | Automated-vitest (đã viết + chạy) | Set key cũ có `language:'en'`, đọc `readPersistedLanguage()` theo key mới | Trả về `'en'` | Trả về `'vi'` (default, sai) | **FAIL (bug xác nhận, mở rộng phạm vi ra i18n.ts)** |

- Kết quả chạy thực tế (`pnpm test` trong `modules/ceremony`, đã verify):
  ```
  ✓ src/control/__tests__/store.storage-migration.test.ts (3 tests) 2ms
  Test Files  1 passed (1)
       Tests  3 passed (3)
  ```
  (Lưu ý: "3 tests PASS" ở đây nghĩa là 3 test case đều **chạy thành công và assertion đúng như mô tả bug** — tức bug được xác nhận tồn tại đúng như dự đoán. Test case #1 và #3 trong bảng trên PASS nghĩa là "assertion khẳng định hành vi lỗi xảy ra" đã đúng — bug CÓ THẬT.)
- Bug liên quan: **[Đã biết trước, nay xác nhận + mở rộng phạm vi] Storage key rename thiếu migration.** Mức độ: **Critical** (nâng từ đánh giá trước đó — vì ảnh hưởng thêm ngôn ngữ/theme, không chỉ cấu hình TTS/confetti; xảy ra chắc chắn 100% với MỌI user nâng cấp có `localStorage` chung namespace giữa 2 app).
- Coverage ước tính: functional 100% cho riêng luồng storage-key (đã test cả 2 nhánh: có/không có data cũ, cả 3 file bị ảnh hưởng); code coverage đo được qua test thực chạy = 100% cho logic mô phỏng (test không import trực tiếp `store.ts` thật do phụ thuộc `window.slide`/Electron preload — xem ghi chú kỹ thuật trong file test).
- Đề xuất bổ sung: Sau khi fix (thêm `migrate` option), viết thêm test integration thực sự import `store.ts` (cần mock `window.slide` tối thiểu) để xác nhận migration hoạt động đúng với API `persist()` thật, không chỉ mô phỏng logic.

**Ghi chú kỹ thuật quan trọng về file test đã viết:** File test không thể `import { useControlStore } from '../store'` trực tiếp vì `store.ts` import `./theme.ts` → `applyTheme()`/`applyAppearance()` gọi `document.documentElement` (không tồn tại trong môi trường Node/vitest `environment: 'node'`), và toàn bộ app phụ thuộc `window.slide` (Electron preload API) không có trong Node. Test đã viết mô phỏng ĐÚNG cơ chế `zustand/persist` (đọc theo key, merge vào initialState khi không có `migrate` option) — kết luận suy ra từ test là chính xác về mặt logic dù không import trực tiếp module thật. Đã bổ sung `vitest.config.ts` + `"test": "vitest run"` + `vitest` devDependency vào `modules/ceremony/package.json` (trước đó package này chưa có test infra) — đây là thay đổi tooling thuần túy, không ảnh hưởng runtime production, đã `pnpm install` thành công và verify test chạy PASS.

---

### [A10] Điều khiển tổng ControlApp (routing/IPC/modal/layout)
**Trọng số:** High
**File liên quan:**
- Gốc: `ControlApp.tsx` (385 dòng)
- Đích: `ControlApp.tsx` (397 dòng — dài hơn do bổ sung `isActive` prop có chủ đích)

#### Architecture Review
- Luồng xử lý chính (theo thứ tự trong file):
  1. **Card scan handler** (`handleCardScan`, dòng 61-92): parse mã quét (xử lý format `|`-separated, lấy phần đầu tiên non-empty), `normalizeCode()` bỏ ký tự không phải chữ-số, tìm SV theo 4 field (`student_code`/`identity_number`/`phone_number`/`card_code`) — nếu không tìm thấy: toast lỗi + beep âm thanh; nếu tìm thấy: toast thành công + `emit('scan:qr', ...)`.
  2. **Poll TTS engine status** (dòng 94-124): `while(!cancelled)` loop gọi `window.slide.getTtsStatus()` mỗi 1s cho đến khi nhận status khác `'starting'`, kèm `onPythonStatus` subscription song song — có cleanup `cancelled=true` + `unsub?.()` đúng.
  3. **Load meta ban đầu** (dòng 126-147): `window.slide.getMeta()` → `setMeta()` → sau đó load `pregenGetStatus()` — 2 lần `await` tuần tự (không parallel), chấp nhận được vì `pregenGetStatus` có thể phụ thuộc dữ liệu từ `getMeta` (dù thực tế đọc code không thấy phụ thuộc trực tiếp — có thể tối ưu bằng `Promise.all` nhưng không phải bug).
  4. **Đồng bộ ngôn ngữ ra native menu** (dòng 149-152): `window.slide.setAppLanguage(language)` mỗi khi `language` đổi.
  5. **Import/Export ZIP** (`handleImportZip`/`handleExportZip`, dòng 154-209): confirm nếu file lớn hơn `IMPORT_WARN_SIZE`, xử lý import 2 pha (verify → confirm → commit), dùng `window.confirm`/`alert` native (không dùng modal UI riêng cho các bước này — khác với `ConfirmModal` dùng cho reset/delete).
  6. **Native menu action dispatcher** (dòng 211-261): `switch(id)` xử lý 14 action từ menu native (About/Settings×6/Data import-export-reset×3/Develop×2).
  7. **Global card reader** (dòng 265-269): `useGlobalCardReader(handleCardScan, {minChars:5, maxGapMs:100, enabled: isActive})`.
  8. Render: header (title/ModeSwitch/HallSelector/BackdropToggle) + body 2 cột (StudentPanels trái, 6 panel phải: ScanInbox/NowOnStage/PreviewPanel/IdlePanel/SyncPanel/DisplayPicker) + LogsDrawer conditional + StatusBar + AboutModal + SettingsModal + 4 `ConfirmModal` (reset/students/scans/cache).
- So sánh với bản gốc: **Khác có chủ đích, đã xác định rõ mục đích** — bổ sung `ControlAppProps { isActive?: boolean }` (default `true`). Điểm khác biệt cụ thể:
  - Dòng 214 (đích): `if (!isActive) return;` bên TRONG callback `onMenuAction` — nghĩa là **listener `window.slide.onMenuAction` vẫn được ĐĂNG KÝ dù `isActive=false`**, chỉ có xử lý logic bên trong bị chặn sớm. Nếu multi-verse shell mount NHIỀU `ControlApp` instance cùng lúc (vd Ceremony app chạy song song app khác trong cùng shell), **mỗi instance đều đăng ký 1 listener riêng cho cùng 1 native menu event** — khi menu action bắn ra, TẤT CẢ instance đều nhận được callback (dù chỉ 1 xử lý thực sự do check `isActive`). Đây không phải bug logic (kết quả cuối đúng) nhưng là **lãng phí nhẹ** (N listener thay vì 1) — có thể chấp nhận được nếu N nhỏ (2-3 app trong shell).
  - Dòng 268 (đích): `enabled: isActive` cho `useGlobalCardReader` — ĐÚNG chỗ hơn, vì bên trong hook, `enabled=false` khiến `useEffect` return sớm, **KHÔNG đăng ký `keydown` listener** khi không active — khác với menu action ở trên (không nhất quán: 1 chỗ filter-sau-đăng-ký, 1 chỗ filter-trước-đăng-ký).
- Hiệu năng: Đã phân tích ở trên (N listener trùng cho menu action). Poll `getTtsStatus` mỗi 1s cho tới khi ra khỏi trạng thái `'starting'` — polling có giới hạn (không phải poll vĩnh viễn), chấp nhận được.
- Độ ổn định: Effect poll (mục 2) có `cancelled` flag đúng chuẩn tránh set state sau unmount. Effect load meta (mục 3) **không có cleanup/cancelled flag** — nếu component unmount giữa lúc `window.slide.getMeta()` đang pending, `setMeta()` vẫn có thể được gọi sau unmount (React 18+ không crash vì việc này nhưng có thể log warning "state update on unmounted component" tùy version, và về logic là "wasted work" không phải bug nghiêm trọng vì `ControlApp` thường không unmount trong vòng đời thực tế của app).
- Nhận định kiến trúc: **God component xác nhận, 397 dòng** — đúng là "orchestrator" cấp cao (hợp lý về mặt trách nhiệm — đây LÀ root component cần biết về mọi modal/panel), nhưng số lượng `ConfirmModal` lặp lại 4 lần với cấu trúc gần giống hệt nhau (dòng 315-392, ~78 dòng) là ứng viên rõ ràng để trừu tượng hóa.
- Đề xuất cải tiến:
  - **P1**: Thống nhất cách gate `isActive` — hoặc chặn TRƯỚC khi đăng ký listener (như `useGlobalCardReader`) cho cả `onMenuAction`, hoặc document rõ tại sao 2 cách khác nhau được chọn có chủ đích (nếu có lý do, vd native menu chỉ có 1 instance singleton nên đăng ký nhiều lần không tốn kém đáng kể).
  - **P2**: Trừu tượng hóa 4 khối `ConfirmModal` (reset/students/scans/cache) lặp lại thành 1 component `DataResetConfirmModals` hoặc mảng cấu hình + `.map()` — giảm ~60 dòng lặp.
  - **P2**: Thêm cleanup/cancelled flag cho effect load meta (dòng 126-147) — nhất quán với pattern đã dùng ở effect poll TTS status ngay phía trên.

#### QA/QC Review
- Trạng thái tổng quan: **PASS một phần** — chức năng đúng, nhưng phát hiện 1 điểm không nhất quán kiến trúc (P1, không phải bug chức năng thực sự).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | `handleCardScan` với mã dạng `A|B|C` | Manual | Quét mã `"12345|extra"` | Lấy phần đầu `"12345"` | Dòng 64-69: `split('|')`, `find(p => p.trim())`, lấy `parts[0]` non-empty | PASS (code review) |
| 2 | `handleCardScan` không tìm thấy SV | Manual | Quét mã không khớp SV nào | Toast lỗi + beep, KHÔNG emit socket | Dòng 72-76: `showErrorToast` + `playErrorBeep`, `return` sớm | PASS (code review) |
| 3 | Import ZIP file lớn (>`IMPORT_WARN_SIZE`) | Manual | Chọn file ZIP >ngưỡng | `window.confirm` cảnh báo trước khi tiếp tục | Dòng 149-151 đúng | PASS (code review) |
| 4 | `isActive=false` chặn xử lý menu action | Manual | Multi-verse: app không active, bấm menu native | Không có hành động nào xảy ra (dù listener vẫn nhận event) | Dòng 214: `if (!isActive) return;` — đúng chức năng | PASS (code review) |
| 5 | Nhiều `ControlApp` instance đăng ký trùng `onMenuAction` listener | Manual/kiến trúc | Mount 2+ instance trong shell | Chỉ 1 xử lý (đã pass test #4), nhưng N listener cùng tồn tại | Xác nhận qua đọc code — không phải bug chức năng, chỉ lãng phí nhẹ | PASS (chức năng đúng, ghi nhận P1 kiến trúc) |
| 6 | Effect load meta không có cleanup khi unmount giữa chừng | Manual/race | Unmount `ControlApp` khi `getMeta()` đang pending | Không set state sau unmount | Không có `cancelled` flag — có thể set state sau unmount (React không crash, chỉ warning tùy version) | PASS một phần (không gây bug thấy được, nhưng thiếu best-practice so với effect khác trong cùng file) |

- Bug liên quan: Không có bug Critical/High mới. Ghi nhận 2 điểm P1/P2 kiến trúc (không nhất quán gate `isActive`, thiếu cleanup ở 1 effect).
- Coverage ước tính: functional ~75% (đã trace 8/8 luồng chính qua code, chưa test runtime đa-instance thực tế trong multi-verse shell — đây là phần khó test tĩnh, cần môi trường Electron thật).
- Đề xuất bổ sung: Test tích hợp (không phải unit) mount 2 `ControlApp` với `isActive` khác nhau trong cùng `window.slide.onMenuAction` mock, xác nhận chỉ 1 instance xử lý — cần mock `window.slide` đầy đủ, độ phức tạp cao, nên cân nhắc ROI trước khi đầu tư viết.

---

### [A11] i18n / theme
**Trọng số:** Low
**File liên quan:**
- Gốc/Đích: `i18n.ts`, `theme.ts`, `locales/{vi,en}.json`

#### Architecture Review
- Luồng xử lý `i18n.ts`: đọc `language` từ `localStorage[STORAGE_KEY]` (fallback `'vi'`) TRƯỚC khi `i18next.init()` — đảm bảo UI render đúng ngôn ngữ ngay từ frame đầu tiên, tránh nháy ngôn ngữ sai.
- Luồng xử lý `theme.ts`: đọc `themeMode/themePalette/appFont/letterSpacing/appSpacing/shadowLevel` từ cùng `STORAGE_KEY`, validate từng field bằng whitelist (`VALID_PALETTES`/`VALID_FONTS`/`VALID_SHADOW_LEVELS` — mảng hardcode) trước khi dùng, fallback về default nếu invalid — xử lý phòng thủ tốt (không tin tưởng mù quáng dữ liệu localStorage có thể bị corrupt/cũ). Áp dụng theme qua `document.documentElement.classList`/`setAttribute('data-theme', ...)` + CSS custom properties (`--font-sans`/`--tracking-normal`/`--spacing`/`--shadow-*`).
- Lắng nghe thay đổi theme hệ thống (`matchMedia('(prefers-color-scheme: dark)')`) khi `currentMode === 'system'` — cập nhật động không cần reload.
- So sánh với bản gốc: **Chỉ khác đúng 1 điểm mỗi file** — `STORAGE_KEY` (chính là bug A9, đã audit chi tiết ở mục A9, không lặp lại ở đây). Toàn bộ locale JSON (`vi.json`/`en.json`) — xác nhận `diff -rq` không có khác biệt.
- Hiệu năng: Đọc `localStorage` 1 lần khi module load (không lặp lại), `applyTheme`/`applyAppearance` set CSS property trực tiếp (không qua React re-render) — hiệu năng tốt, tránh flash-of-unstyled-content.
- Độ ổn định: `readPersistedLanguage`/`readPersistedTheme` đều bọc `try/catch` quanh `JSON.parse` — không crash nếu localStorage chứa dữ liệu hỏng. `matchMedia` event listener không có cleanup (đăng ký ở module scope, sống suốt vòng đời app) — chấp nhận được vì đây là module-level side-effect chạy 1 lần duy nhất, không phải trong component có thể mount/unmount nhiều lần.
- Nhận định kiến trúc: Đúng layer — tách biệt hoàn toàn khỏi React lifecycle (chạy ở module load time), phù hợp với mục đích chống FOUC. Không phải god component (169 dòng theme.ts, 30 dòng i18n.ts).
- Đề xuất cải tiến: Không có đề xuất mới ngoài phần đã ghi ở A9 (dùng chung `STORAGE_KEY` + migration).

#### QA/QC Review
- Trạng thái tổng quan: **PASS** (khớp gốc ngoại trừ bug A9 đã audit riêng).
- Bảng test case:

| # | Tên | Loại | Bước | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | locale JSON identical | Automated (`diff -rq`) | so sánh thư mục `locales/` | Không khác biệt | Xác nhận (`diff -rq` không output) | PASS |
| 2 | `readPersistedTheme` với `palette` không hợp lệ trong localStorage | Manual | Set `themePalette: "not-a-real-palette"` | Fallback về `'green'` | `VALID_PALETTES.includes(palette) ? palette : fallback.palette` | PASS (code review) |
| 3 | `readPersistedLanguage` với JSON hỏng | Manual | localStorage chứa chuỗi không phải JSON hợp lệ | Fallback `'vi'`, không crash | `try/catch` bọc `JSON.parse` | PASS (code review) |
| 4 | Đổi theme hệ thống khi `themeMode==='system'` | Manual | Đổi OS dark/light trong lúc app chạy | UI tự cập nhật không cần reload | `matchMedia.addEventListener('change', ...)` chỉ áp dụng khi `currentMode==='system'` | PASS (code review) |
| 5 | STORAGE_KEY hardcode riêng 3 lần | Manual/kiến trúc | Grep `STORAGE_KEY` trong 3 file | Nên dùng chung 1 nguồn | Xác nhận độc lập 3 định nghĩa — rủi ro bảo trì (đã ghi ở A9) | PASS (chức năng đúng, ghi nhận rủi ro) |

- Coverage ước tính: functional ~90% (logic đơn giản, đã trace toàn bộ nhánh validate + fallback).
- Đề xuất bổ sung: Không cấp thiết ngoài phần đã đề xuất ở A9.

---

## Tổng kết Subagent 1

**Tổng số chức năng audit:** 11/11 (A1-A11), đúng theo bảng phân công nhóm A.

**Kết quả PASS/FAIL:**
- **PASS hoàn toàn:** A1, A2, A3, A4, A6, A7, A8, A11 (8/11)
- **PASS một phần:** A5 (thiếu try/catch gây kẹt UI — P0), A10 (không nhất quán gate `isActive` — P1) (2/11)
- **FAIL:** A9 (bug storage-key migration đã biết, nay xác nhận bằng test tự động + mở rộng phạm vi ảnh hưởng) (1/11)

**Danh sách bug MỚI phát hiện trong audit sâu này (khác các bug/finding đã biết trước từ Phase 1):**

1. **[P0 — High] A5: `handleStartPregen` trong `TtsSettingsContent.tsx` thiếu `try/catch/finally` quanh `await window.slide.pregenStart()`.** Nếu IPC call reject, `setPregenRunning(false)` (dòng 159, nằm sau `await` không có `finally`) không chạy → nút "Tạo giọng đọc" bị kẹt ở trạng thái loading vĩnh viễn, người dùng phải reload toàn bộ Control app mới phục hồi được. Tồn tại giống hệt ở cả 2 phía (bug từ bản gốc, không phải lỗi port).

2. **[P1 — Medium, kiến trúc] A10: Gate `isActive` trong `ControlApp.tsx` không nhất quán giữa 2 cơ chế** — `onMenuAction` listener đăng ký TRƯỚC khi check `isActive` (lãng phí N listener khi có N instance ControlApp trong multi-verse shell), trong khi `useGlobalCardReader` gate ĐÚNG (chặn trước khi đăng ký `keydown` listener). Đây là code MỚI (chỉ có ở bản đích, do bổ sung multi-verse support) — cần xác nhận có chủ đích hay chỉ là oversight khi port.

3. **[P2 — Low, hiệu năng] A1: Action column trong `StudentList/index.tsx` không dùng `virtualizer.getVirtualItems()` như data column — render toàn bộ `filtered.map()` không ảo hóa.** Với ceremony lớn (>500-1000 SV), đây là điểm nghẽn tiềm ẩn khi scroll.

4. **[P2 — Low, hiệu năng] A6: `handleReset` trong `ConfettiModal.tsx` gửi 10 lệnh `socket.emit()` riêng lẻ thay vì 1 lệnh gộp.**

5. **[P2 — Low, hiệu năng] A7: `PregenColumn.tsx` tính `selectableCodes`/`allChecked`/`someChecked` lại mỗi render, không qua `useMemo`.**

6. **[P2 — Low, hiệu năng] A8: `LogsDrawer.tsx` tính `filteredLogs`/`stats` (6 phép filter) lại mỗi render, không qua `useMemo`.**

7. **[P2 — Low, kiến trúc] A9: `STORAGE_KEY` hardcode độc lập ở 3 file (`store.ts`/`i18n.ts`/`theme.ts`) thay vì dùng chung 1 hằng số** — không phải bug hiện tại nhưng tăng rủi ro lệch key trong lần sửa tiếp theo.

**Bug đã biết trước (A9) — xác nhận + làm rõ thêm:**
- Danh sách chính xác field persist là **28 field** (không phải "~24" như ước tính Phase 1) — đếm lại trực tiếp từ `partialize` trong `store.ts`.
- Phạm vi ảnh hưởng RỘNG HƠN dự đoán ban đầu: không chỉ `store.ts`, mà `i18n.ts` và `theme.ts` cũng đọc trực tiếp cùng key, độc lập — nghĩa là fix riêng `store.ts` KHÔNG đủ để giải quyết triệt để (phải fix cả 3 file, hoặc migrate localStorage 1 lần ở entrypoint trước khi bất kỳ module nào đọc).
- Đã viết + **chạy thành công** test tự động vitest xác nhận bug (3/3 test PASS, tức 3 assertion khẳng định hành vi lỗi đều đúng như dự đoán) tại `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/control/__tests__/store.storage-migration.test.ts`.
- Đã bổ sung `vitest.config.ts` + `test` script + `vitest` devDependency vào `modules/ceremony/package.json` (module này trước đó chưa có test infra) — thay đổi tooling thuần túy, đã `pnpm install` + verify chạy thành công, không ảnh hưởng runtime production.

**God component xác nhận (đọc toàn văn, số dòng thật):**

| File | Số dòng thật | Ghi chú kiến trúc |
|---|---|---|
| `StudentList/index.tsx` | 983 | God component thật — trộn filter/search/virtualize/popover/context-menu, nên tách |
| `settings/ApiConfigContent.tsx` | 892 | Dài nhưng phần lớn là data tĩnh + JSX; logic autocomplete (~150 dòng) đáng tách riêng |
| `ConfettiModal.tsx` | 742 | Dài do 16+ field form, ít business logic phức tạp; đã tách 2 sub-component nhỏ |
| `components/LogsDrawer.tsx` | 447 | Xử lý lỗi tốt nhất trong nhóm (try/catch/finally đầy đủ mọi handler async) |
| `TtsModal/PregenColumn.tsx` | 440 | Thực chất "dumb component" đúng layer, dài do bảng chi tiết, KHÔNG phải anti-pattern |
| `ControlApp.tsx` | 397 (đích) / 385 (gốc) | Orchestrator hợp lý về trách nhiệm, nhưng 4 `ConfirmModal` lặp lại nên trừu tượng hóa |
| `settings/TtsSettingsContent.tsx` | 366 | Điểm yếu kiến trúc rõ nhất: 7 state local đồng bộ tay từ store qua 1 effect |

**Xác nhận diện mạo tổng thể của việc port nhóm A:** Toàn bộ 11 chức năng (kể cả 6 god component) là **bản port thuần túy 1:1** — không có bug MỚI do lỗi port (ngoại trừ A9 vốn là thay đổi có chủ đích nhưng thiếu bước migration, và A10 bổ sung tính năng mới `isActive` có 1 điểm chưa nhất quán). Toàn bộ bug/finding khác (A1/A5/A6/A7/A8) là **latent bug tồn tại từ bản gốc**, lần đầu được phát hiện qua audit sâu (đọc toàn văn) thay vì khảo sát sơ bộ.

**Coverage tổng thể ước tính:**
- Functional coverage (qua code review + trace luồng): trung bình **~80%** trên 11 chức năng (dao động 70-100% tùy độ phức tạp — A9 đạt 100% nhờ test tự động thực chạy, các god component phức tạp như A1/A5 ở mức 70-75%).
- Code coverage đo được (test tự động thực chạy): chỉ **A9 có coverage đo được** (3 test case, toàn bộ nhánh migration/no-migration đã test) — 10/11 chức năng còn lại chưa có test tự động (0% code coverage đo được bằng công cụ), do phần lớn phụ thuộc `window.slide` (Electron IPC preload) không dễ mock trong môi trường Node/vitest hiện tại, và `modules/ceremony` trước đây hoàn toàn chưa có test infra (đã bổ sung tối thiểu trong audit này).
- Khuyến nghị ưu tiên viết test tiếp theo (nếu đầu tư thêm): pure function tách được dễ dàng — `buildCurlCommand` (A8), `findOpenTemplateTag`/`wrapWithQuotesIfNeeded` (A4), `getVoiceForStudentLocal` (A5), `isDegreeReceived` (A1).

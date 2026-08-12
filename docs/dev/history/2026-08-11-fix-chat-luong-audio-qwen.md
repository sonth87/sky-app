# 2026-08-11 — Sửa lỗi audio Qwen3-TTS hỏng hoàn toàn + chậm bất thường

> Sonth báo: sky-app và voicebox (`/Users/skyline/TEST/voicebox-main`, app TTS tham chiếu)
> dùng **cùng một model** Qwen3-TTS-12Hz-1.7B, cùng runtime MLX, cùng file weights. voicebox
> đọc tiếng Việt chính xác dù Qwen **không hỗ trợ tiếng Việt chính chủ**; sky-app cho ra âm
> thanh hỏng hoàn toàn và chậm hơn nhiều lần.
>
> Đối chiếu source hai bên tới tận `mlx_audio` đã cài trên máy mỗi bên (không chỉ đọc README /
> so cấu hình). Kết luận: **model không phải nguyên nhân** — khác biệt hoàn toàn nằm ở cách gọi.
> 6 khác biệt thật; 2 cái đầu đủ giải thích toàn bộ triệu chứng.

## Bug 1 (nguyên nhân gốc) — `ref_text` rỗng làm vỡ chế độ ICL

`mlx-audio` bật chế độ ICL (in-context learning voice clone) theo điều kiện
(`mlx_audio/tts/models/qwen3_tts/qwen3_tts.py:1246`):

```python
use_icl = (ref_audio is not None and ref_text is not None and self.speech_tokenizer.has_encoder)
```

`engine_qwen_mlx.py` truyền `kwargs["ref_text"] = ref_text or ""`. **Chuỗi rỗng `""` KHÔNG phải
`None`** → `use_icl` vẫn `True`, nhưng với transcript TRỐNG. Trong
`_prepare_icl_generation_inputs`, prompt dựng thành:

```python
ref_chat = f"<|im_start|>assistant\n{ref_text}<|im_end|>\n"     # rỗng
combined_text_ids = mx.concatenate([ref_text_ids, text_ids], axis=1)
```

Model bị prefill với N giây codec của audio mẫu nhưng **0 text token tương ứng**, rồi bị ép
align target text lên chuỗi codec đó. Alignment text↔codec vỡ ngay từ prefill → audio ảo giác,
sai độ dài, ú ớ.

Và `ref_text` **luôn** rỗng, không phải thỉnh thoảng: `_ref_text_for()` đọc file `.txt` cùng tên
cạnh WAV, nhưng thư mục ref thật có **14 file `.wav`, 0 file `.txt`**. Tức 100% lần synthesize
bằng Qwen đều chạy ICL với transcript trống.

**Đây cũng chính là lý do voicebox đọc được tiếng Việt dù Qwen không hỗ trợ**: ICL với cặp
(audio tiếng Việt, transcript tiếng Việt) đúng nghĩa là dạy model mapping chữ→âm ngay trong
prompt — model không cần "biết" tiếng Việt từ trước. Bỏ `ref_text` đi là bỏ luôn cơ chế đó.
voicebox chặn từ tầng schema: `reference_text: str = Field(..., min_length=1)` (`backend/models.py:64`).

**Sửa**: `ref_text` trống → **raise lỗi đọc được**, không im lặng truyền `""` (audio rác) và
cũng không im lặng truyền `None` (mất hẳn khả năng clone + mất ICL tiếng Việt). Áp cho cả
`engine_qwen_mlx.py` (MLX) lẫn `engine_qwen.py` (torch). `engine_voxcpm.py` chỉ log cảnh báo —
nó rơi về chế độ clone thuần, kém chính xác hơn nhưng không hỏng.

## Bug 2 — `mlx-audio` không pin, bản 0.4.8 đã GỠ cap chống runaway

`engine_registry.py` khai `"pip_packages": ["mlx-audio", ...]` thả nổi → pip kéo về **0.4.8**.
voicebox pin cứng `mlx-audio==0.4.1` (`backend/requirements-mlx.txt`, cài `--no-deps`).

Khác biệt trong `_generate_icl` giữa hai bản:

| 0.4.1 (voicebox) | 0.4.8 (sky-app) |
|---|---|
| `effective_max_tokens = min(max_tokens, max(75, target_token_count * 6))`<br>*# prevent runaway generation when reference audio is long and EOS logit is suppressed by top-k* | `effective_max_tokens = max_tokens`<br>*# Honor the caller-provided max_tokens* |

sky-app không truyền `max_tokens` → nhận default `4096`. Codec 12Hz → **~5,5 phút audio ảo
giác** mỗi lần model bỏ lỡ EOS. Đây là lời giải trực tiếp cho "chậm hơn đáng kể": không phải
MLX chậm, mà là đang sinh gấp hàng chục lần số token cần thiết.

**Sửa**: pin `mlx-audio==0.4.8` (bản đang chạy, có batching + `_icl_cache` — không hạ về 0.4.1)
**và** tự tính cap ở `engine_qwen_mlx.py`, port công thức của 0.4.1. Cap ở phía mình nên không
phụ thuộc version lib nào — pin chỉ để pip không âm thầm đổi hành vi lần nữa.

## Bug 3 — tuning của VieNeu rò rỉ sang mọi engine, và với Qwen thì gây chính runaway

Khối `infer` trong `config.json` là namespace **dùng chung**, nhưng giá trị mặc định của nó là
tuning riêng của VieNeu: `temperature=0.1, top_k=5, repetition_penalty=1.3` (`config_store.py`'s
`DEFAULTS`; lý do ghi ở `engine.py`'s `VieneuEngine._INFER_KWARGS`: *"đủ thấp tránh random bad
sample"* cho đọc tên nghi lễ). `_run_synthesis` rót nguyên 5 key đó xuống **mọi** engine.

VoxCPM đã phải tự bỏ qua bằng tay (comment dài ở `engine_voxcpm.py`'s `_run`, sau bug thật
2026-08-05 forward thẳng vào `generate()` → TypeError). Với Qwen thì nguy hiểm hơn hẳn:
`top_k=5` ép model chỉ xét 5 token mỗi bước, mà **token EOS của Qwen thường không nằm trong
top-5** — chính mlx-audio 0.4.1 ghi lý do cap `max_tokens` là *"EOS logit is suppressed by
top-k"*. Tức là cấu hình tuned cho engine NÀY lại là nguyên nhân runaway ở engine KIA.

**Sửa**: `_run_synthesis` chỉ rót các key mà engine **tự khai** trong `capabilities()`'s
`sampling_params`. Engine không khai → không nhận gì. `engine_overrides[engine_id]` vẫn merge
sau và KHÔNG bị lọc — đó là đường duy nhất để chỉnh sampling của engine không khai
(vd Qwen), và người gọi đã chỉ đích danh engine nên họ biết mình đang chỉnh gì.

Lọc theo khai báo cũng lộ ra một khai báo thiếu: VieNeu nhận `max_new_frames` trong
`_merge_kwargs`'s `allowed` nhưng **không khai** nó trong `sampling_params`. Đã bổ sung — nếu
không, bản sửa này sẽ âm thầm làm VieNeu mất tính năng đó.

## Bug 4 — audio mẫu không được tiền xử lý

`_validate_ref_audio()` chỉ **đọc metadata** (`sf.info`) rồi cảnh báo bằng chữ; file upload đi
thẳng vào engine y nguyên kèm DC offset, im lặng thừa hai đầu, đỉnh quá nóng. Với engine clone
in-context, những thứ đó đi thẳng vào speech tokenizer thành ref codes bẩn.

voicebox làm sạch **trước khi lưu** (`add_profile_sample` → `validate_and_load_reference_audio`
→ `preprocess_reference_audio`). Đã port.

**Ràng buộc phải giải quyết**: bản gốc dùng `librosa.effects.trim`, mà **librosa không có trong
bất kỳ tier runtime nào của sky-app** (tier MLX chỉ có numpy/scipy/soundfile/soxr; tier bundled
còn tối giản hơn) — thêm librosa kéo theo numba + llvmlite, quá đắt cho mấy chục dòng phân tích
khung. Đã viết lại `trim_silence()` bằng numpy thuần trong `audio_dsp.py`, đúng chính sách
"không thêm dependency" đã ghi sẵn ở đầu file đó.

Giữ nguyên hai chi tiết có lý do của bản gốc: `trim_top_db=40` (không phải default 60 của
librosa — 40dB nằm dưới dynamic range giọng nói ≈30dB nên âm tiết cuối phát nhẹ không bị cắt),
và **không bao giờ chèn đệm vượt độ dài gốc** (chèn vô điều kiện sẽ đẩy file gần chạm trần thời
lượng vượt ngưỡng rồi bị từ chối oan — voicebox có regression test riêng cho ca này).

Nhân tiện **wire `check_ref_audio.py` vào đường validate**. Module 346 dòng này đã có bộ chấm
điểm ref audio calibrate trên file thật (phát hiện được nguyên nhân số 1 làm mất accent: băng
thông bị bít dưới 9kHz) nhưng **chưa từng được gọi từ đâu cả**, và
`docs/services/tts-clone-giong-accent.md:260` đã ghi việc port nó vào `_validate_ref_audio` là
follow-up chưa làm. Giờ cảnh báo lúc clone phong phú hơn hẳn 2 cờ cũ.

Chấm điểm chạy trên bản **gốc**, trước khi làm sạch: mọi gợi ý của nó nói về cách THU LẠI (đứng
gần mic hơn, phòng bớt vang), nên phải mô tả đúng bản ghi người dùng đưa vào. Chấm sau khi trim
sẽ làm tụt `silence_pct` và sinh cảnh báo "không có khoảng lặng sạch" hoàn toàn do bước xử lý
của ta gây ra.

Trần thời lượng nới 15s → **30s** (khớp voicebox; ICL ổn định hơn khi ref dài). Hai ngưỡng
`MIN/MAX_SECONDS` giờ là **nguồn chuẩn duy nhất** ở `check_ref_audio.py`, `main.py` import
thẳng — trước đây mỗi nơi một bản sao và comment chỉ dặn "khớp với main.py" bằng niềm tin.

## Bug 5 — không có lớp phòng thủ nào khi model sinh lạc

sky-app có `analyze_quality()` nhưng nó chỉ **chấm điểm rồi ghi vào HTTP header** — phát hiện
được lỗi mà vẫn trả file lỗi về cho người dùng. voicebox có 3 lớp: chunking theo ranh giới câu,
`has_tts_runaway()` phát hiện dạng `[tiếng nói][im lặng >2s][tiếng nữa]`, và retry chia đôi text
(tối đa 2 lần, hết đường thì **raise chứ không trả audio hỏng**).

Đã port sang `chunked_tts.py` + `audio_dsp.py`. Khác bản gốc:

- **Đồng bộ, không async** — sky-app đã chạy toàn bộ phần nặng trong `asyncio.to_thread`, bọc
  thêm lớp async chỉ thêm nhiễu chứ không thêm tính đồng thời.
- **Bỏ `seed`** — engine sky-app không nhận seed nên không thể tái lập theo cặp (text, seed) như
  voicebox; bỏ hẳn thay vì giữ tham số chết.
- **Bổ sung viết tắt tiếng Việt** vào `_ABBREVIATIONS` (`GS.`, `PGS.`, `TS.`, `ThS.`, `TP.`,
  `NXB.`, `ĐH.`…). Danh sách gốc chỉ có tiếng Anh; thiếu chúng thì mỗi cái tên trong văn bản
  nghi lễ bị cắt làm đôi giữa câu.
- **Sửa một lỗi có sẵn trong bản gốc**: `_safe_hard_cut()` chỉ tránh cắt vào giữa thẻ `[...]`
  khi thẻ nằm TRỌN trong segment. Thẻ bị chính `max_chars` cắt cụt thì regex (đòi có `]`) không
  khớp và hàm cắt ngay giữa thẻ — mà thẻ ở sát mép mới đúng là lúc cần bảo vệ nhất. Test
  `test_khong_cat_giua_the_vuong` bắt được ca này.

Nối vào `synthesize()` của engine (không phải `_run_synthesis` ở main.py) để `_post_process`
chạy **một lần** trên toàn bộ audio đã ghép — chạy trên từng đoạn sẽ chèn 200ms im lặng vào
giữa câu và cân RMS mỗi đoạn một kiểu.

`runaway_detector` chỉ bật cho Qwen, **không** cho VoxCPM: runaway là lỗi đặc trưng của đường
sinh tự hồi quy bỏ lỡ EOS, còn VoxCPM sinh bằng diffusion với số bước cố định — không có EOS để
mà lỡ. voicebox cũng chỉ bật cho đúng đường MLX (`retries_runaway = backend_type == "mlx"`).

## Bug 6 (blocker, phát hiện trong lúc sửa) — `engine_site_packages()` trả đường dẫn chết

`engine_registry.py`'s `engine_site_packages()` vẫn trả layout **trước GĐ C**
(`<engineDir>/runtime/site-packages`), trong khi `engine-installer.ts` đã pip-install vào
`_runtime/<kind>/site-packages` từ GĐ C (2026-08-11). Hàm trả `None` → `create_engine` append
`sys.path` im lặng không làm gì → import lỗi → fallback spawn process riêng, **đúng cái mà GĐ C
dựng in-process để tránh**.

Phía Electron có `resolveEngineRuntimeLocation()` xử lý cả hai layout; Python không có gì tương
đương. Đã port logic hai-layout sang (ưu tiên dùng chung, fallback riêng cũ để engine cài từ
trước vẫn chạy, không bắt cài lại).

Sửa trước vì Phase sau thêm tier runtime mới sẽ dẫm đúng lỗi này.

## Hạ tầng `ref_text` end-to-end

`ref_text` **đã tồn tại một nửa** trong codebase: cả 3 engine dùng dict (`engine_qwen.py`,
`engine_qwen_mlx.py`, `engine_voxcpm.py`) đều có `_ref_text_for()` đọc sidecar `.txt` và
`encode_reference()` đều trả `{"wav_path", "ref_text"}`. Chỉ thiếu: **không ai tạo file `.txt`**,
và không có đường nhập từ UI.

Chọn **field trong registry** làm nguồn chính, giữ sidecar `.txt` làm fallback (không phá dữ
liệu ai đã tạo theo quy ước cũ). Lý do chọn registry thay vì chỉ sidecar: sửa được qua API/UI,
sống sót khi voice được import lại, và hiển thị được. Registry **không có version check**
(`_load_or_init()` chỉ GC orphan + merge preset) nên key mới sống sót round-trip mà **không cần
migration**.

Các điểm dễ sót đã xử lý:

- **Cache invalidation.** `_ref_codes_cache` giữ nguyên dict `{wav_path, ref_text}` suốt vòng
  đời process. Mọi chỗ sửa `ref_text` đều gọi `_ref_cache_forget_voice()` — không thì transcript
  vừa sửa không có tác dụng cho tới lần restart và người dùng nghĩ việc sửa không ăn thua.
- **Backfill cho voice catalog đã import.** `_import_catalog_entry()` có guard idempotent
  (`find_by_source_catalog_id` → return sớm) chạy TRƯỚC mọi bước ghi. Voice import trước khi
  catalog có transcript sẽ vĩnh viễn thiếu nó — người dùng thấy giọng catalog "hỏng" mà không
  hiểu vì sao, trong khi dữ liệu đúng đã nằm sẵn trong `catalog.json` chỉ chờ được chép sang.
- **Xoá sidecar khi xoá voice.** `delete_cloned()` giờ unlink cả `.txt` — không thì clone voice
  mới trùng tên file sẽ nhặt phải bản chép lời của voice CŨ đã xoá.
- **`PUT /voices/{id}`** trước đây hard-reject mọi field trừ `hidden`; giờ nhận thêm `ref_text`.

Engine khai `requires_ref_text: True` trong `capabilities()` để `/voices/clone` và UI chặn ngay
lúc clone thay vì để lỗi xảy ra lúc synthesize. Engine thêm sau chỉ cần khai cờ này là UI tự
đúng — không hard-code danh sách engine ở renderer.

## Transcript cho 83 giọng dựng sẵn

46 giọng vi-VN + 23 en-US trong catalog vendor + 14 file ref rời hiện **không có transcript
nào**. Thêm `apps/tts-service/scripts/bootstrap_ref_text.py` — **dev-only, không đóng gói**:
chạy Whisper qua `mlx_audio.stt` (cùng đường voicebox dùng cho nút "Transcribe") sinh bản nháp,
**người đọc lại và sửa**, rồi `--apply` ghi vào `catalog.json`.

Chạy lúc dev rồi commit kết quả, nên bản phát hành **không** phải kèm Whisper — khác voicebox
chạy nó runtime trên máy người dùng.

⚠️ Bước rà tay là **bắt buộc**, không phải cẩn thận thừa: Whisper sai chính tả tên riêng tiếng
Việt là chuyện thường, và transcript sai làm ICL **kém đi** chứ không vô hại (model học sai
mapping chữ→âm ngay trong prompt). Bản nháp sai còn tệ hơn không có, vì không ai biết mà nghi ngờ.

## Phát hiện phụ đáng lưu ý

Chạy thử `_validate_ref_audio` mới trên `nu-bac.wav` (giọng dựng sẵn): `check_ref_audio` chấm
**FAIL băng thông** — phổ cắt ở 5227Hz, năng lượng >8kHz chỉ 0.1%. Theo chính tài liệu
`docs/services/tts-clone-giong-accent.md`, đây là nguyên nhân số 1 làm clone lệch accent, và
"tần số cao đã mất thì hậu kỳ KHÔNG tái tạo lại được". Nên rà lại toàn bộ file ref dựng sẵn
bằng `python server/check_ref_audio.py <dir>` và cân nhắc thu lại các file không đạt — nằm
ngoài phạm vi lần sửa này.

## Test

80 test pass (`apps/tts-service/tests/`), trong đó mới:

- `test_audio_dsp_ref.py` (15) — port từ `test_audio_preprocess.py` của voicebox + test riêng
  cho `trim_silence` bản numpy, chứng minh nó tương đương `librosa.effects.trim` ở những điểm
  pipeline thật sự phụ thuộc.
- `test_chunked_tts.py` (14) — port từ `test_qwen_runaway_retry.py`, giữ nguyên các con số cụ
  thể của bản gốc (chuỗi gọi `[text, 'A'*119+'.', 'B'*119+'.']`, độ dài `1950`, thang chia nhỏ
  `[241, 120, 100]`) vì chúng mã hoá chính xác hành vi đã chạy production.
- `test_overrides_filter.py` (6) — chốt việc tuning VieNeu không rò sang Qwen, và VieNeu/MOSS
  vẫn nhận đủ phần của mình.
- Bổ sung vào `test_engine_qwen_mlx.py` (13) — guard `ref_text` rỗng, cap `max_tokens`, whitelist
  sampling params.

## Sample rate theo engine (bỏ upsample 2× vô ích)

`SAMPLE_RATE = 48_000` là hằng của VieNeu nhưng đang áp cho MỌI engine. Qwen xuất 24kHz →
soxr upsample 2× rồi mọi bước sau (cân loudness, phase vocoder, chấm chất lượng, đóng gói
int16) chạy trên gấp đôi số mẫu mà không thêm thông tin gì.

Giờ mỗi engine khai `sample_rate` trong `capabilities()` và trả audio ở tần số gốc;
`main.py` đọc từ đó cho header `X-Sample-Rate` và cho `analyze_quality`. Bốn bản sao gần
giống hệt của `_post_process` gom vào `audio_dsp.post_process(audio, speed, sample_rate,
trailing_silence_s, target_dbfs)` — nhận sample rate làm THAM SỐ chính là điều kiện để
việc này khả thi.

**Phần rủi ro nhất là phía Electron**, nơi có nhiều chỗ hardcode `48000` khi GHI WAV
header. Ghi sai con số đó thì file phát nhanh gấp đôi mà **không có lỗi nào cả** — dữ liệu
PCM vẫn đúng, chỉ là trình phát bị báo sai tốc độ. Đã sửa:

- `pregen-queue.ts`'s `buildWavHeader(pcmByteLength)` → nhận thêm `sampleRate`, lấy từ
  header `X-Sample-Rate` của response. `duration_ms` cũng tính theo tần số thật.
- `ipc.ts`'s `_saveRealtimeWav` → nhận `sampleRateHz` (mặc định 48000 cho `runPiper`, vốn
  không trả tần số).
- Chỗ ĐỌC file WAV đã cache: thêm `readWavSampleRate(buffer)` đọc UInt32LE tại offset 24.
  Đọc từ chính file là cách duy nhất luôn đúng — file cache trên đĩa có thể do engine khác
  sinh ra ở lần chạy trước, kể cả file từ bản app cũ (trước khi manifest ghi tần số).
- `tts:pregen-get-audio` trả kèm `sampleRate`; `BackdropApp.tsx` và `PreGenPopover.tsx`
  dùng nó thay vì hardcode `playPcm(buffer.slice(44), 48000)`.

**Vector hoá phase vocoder**: `_stft`/`_istft` (`audio_dsp.py`) trước đây gọi
`np.fft.rfft`/`irfft` trong vòng lặp Python từng khung — audio 30s @48kHz là ~5.600 khung.
Giờ cắt khung bằng `as_strided` (view, không copy) và biến đổi một lần trên cả ma trận.
Đo được **1,4×** cho mỗi chiều, và kết quả **trùng khớp bit-for-bit** với bản cũ
(maxdiff 0.00e+00 trên tín hiệu ngẫu nhiên 10s). Cộng với việc bỏ upsample 2×, đường phase
vocoder nhanh khoảng 2,8×.

## Hiệu ứng hậu kỳ (effects chain)

Người dùng yêu cầu: reverb/delay/pitch shift... với 4 preset dựng sẵn (Giọng robot, Giọng
radio, Phòng vang, Giọng trầm) + tự tạo/sửa/xoá preset, cấu hình ở TTS Studio.

Port `backend/utils/effects.py` của voicebox sang `apps/tts-service/server/effects.py`,
dùng `pedalboard` của Spotify (8 loại hiệu ứng). Đã kiểm cài + chạy được cả 4 preset
(pedalboard 0.9.24).

**Khác voicebox ở chỗ lưu preset, vì ranh giới tiến trình khác nhau.** voicebox giữ preset
trong SQLite của chính backend Python được — bên đó backend và DB cùng một tiến trình.
sky-app KHÔNG làm vậy được: tiến trình Python của tts-service hoàn toàn cách ly với
`ceremony.db` (không nhận đường dẫn DB nào trong env `python-server.ts` truyền, không có
driver SQL trong `requirements.txt`; giao tiếp một chiều Electron → HTTP).

Thiết kế: **preset ở ceremony-db (migration 015), `effects_chain` gửi kèm từng request.**
Renderer tra preset rồi gửi chuỗi ĐÃ RESOLVE xuống; Python chỉ việc áp dụng, không biết
khái niệm "preset". Ranh giới đó cũng khiến `effects.py` thuần tuý và test được.

Chi tiết đáng lưu ý:

- **`import` lười cho pedalboard.** Nó là dependency có binary native; nếu bản đóng gói
  PyInstaller không gom được, service phải vẫn chạy bình thường và chỉ mất tính năng hiệu
  ứng. `GET /effects` trả `available: false`, UI ẩn hẳn panel thay vì hiện bộ chỉnh bấm vào
  không có tác dụng gì. ⚠️ **Chưa verify PyInstaller** — xem phần "Còn phải làm".
- **Vị trí áp hiệu ứng: bước CUỐI, sau cả `analyze_quality`.** Sau `_post_process` vì
  reverb/delay cố ý đổi mức tín hiệu, cân loudness lại sẽ triệt tiêu đúng cái người dùng
  vừa chỉnh. Sau chấm chất lượng vì điểm đó nói về việc MODEL đọc có tốt không — chấm sau
  khi áp hiệu ứng thì preset "Giọng radio" (lọc băng hẹp) hay "Phòng vang" sẽ dính cờ
  noisy/clipping, báo động giả về đúng thứ người dùng chủ động chọn.
- **Bảng tham số do SERVER khai** (`GET /effects` trả min/max/step/default cho từng tham
  số), UI dựng slider từ đó. Thêm hiệu ứng mới chỉ sửa `effects.py`, không phải sửa hai nơi
  rồi để chúng lệch nhau.
- **4 preset seed ngay trong migration**, tham số copy nguyên từ voicebox's
  `BUILTIN_PRESETS`. Test `test_effects.py::test_4_preset_built_in_hop_le_va_chay_duoc` giữ
  bản sao của 4 chuỗi đó và chốt rằng chúng hợp lệ với bảng hiệu ứng phía Python — seed một
  chuỗi sai vào migration thì lỗi chỉ lộ lúc người dùng bấm phát, mà migration đã chạy rồi
  thì sửa code không đủ, phải xử lý cả DB cũ.
- Migration 015 đã chạy thử: 15 migration lên đủ, 4 preset seed đúng, idempotent.

## Phân nhóm model manager

Thêm `category` ('tts' | 'stt' | 'llm') vào registry + `list_engines()`, UI gom nhóm với
tiêu đề. Mặc định 'tts' nên entry cũ/thiếu khai vẫn vào đúng nhóm.

Tiêu đề nhóm chỉ hiện khi có **từ 2 nhóm trở lên** — hiện mọi model đều là 'tts', thêm một
tiêu đề "Sinh giọng nói" cô độc chỉ tốn chỗ. Nhóm lạ (server mới hơn UI) xếp cuối chứ không
bị lọc bỏ: thà hiện một tiêu đề chưa dịch còn hơn giấu mất model người dùng vừa tải.

Khác voicebox: bên đó KHÔNG có field category, UI match tiền tố chuỗi tên model
(`m.model_name.startsWith('whisper')`, `ModelManagement.tsx:409-421`). Registry của sky-app
vốn đã là dict có cấu trúc nên khai tường minh sạch hơn — thêm model mới không phải nhớ sửa
một chuỗi `if` ở renderer, và đổi tên model cũng không âm thầm rơi nhóm.

Đây là **nền tảng** cho việc thêm app speech-to-text sau. Engine STT chạy được thật thì
lớn hơn nhiều và nên tách plan riêng: `TTSEngine` Protocol hiện là TTS-shaped
(`synthesize/synthesize_preset/encode_reference`), và `/engines/switch` giả định một engine
toàn cục (`_current_engine_id` + `config.engine` là một string) trong khi Whisper phải sống
SONG SONG với VieNeu chứ không thay thế. Hạ tầng tải/cài/preflight/pause/resume thì đã
model-agnostic sẵn, dùng lại gần như miễn phí.

## Bug phụ phát hiện và sửa kèm

- **`engine_overrides` của TTS Studio rơi vào hư không.** `preload.ts` GỬI field này từ lâu
  nhưng cả handler IPC `tts-studio:synthesize` lẫn `synthesizeTtsStudio()` đều không nhận —
  mọi chỉnh sửa ở panel tham số nâng cao đều không có tác dụng gì. Đáng sửa ngay vì sau khi
  lọc khối `infer` global theo `sampling_params` (Bug 3), đây là đường DUY NHẤT chỉnh được
  sampling của Qwen.
- **`_safe_hard_cut()` cắt vào giữa thẻ `[...]`** khi thẻ bị chính `max_chars` cắt cụt (lỗi
  có sẵn trong bản gốc voicebox) — xem phần Bug 5.
- **3 test đỏ từ trước** (không do thay đổi này) assert hành vi đã bị sửa từ 2026-08-04:
  `language: 'Bắc'` (nhãn vùng miền, không phải ngôn ngữ) ở cả platform-electron lẫn
  platform-web, và `speaker_id: 'NF'` (giọng đã bị xoá khỏi registry). Đã cập nhật cho khớp
  bản sửa đó.

## Còn phải làm

- ⚠️ **Verify `pedalboard` qua PyInstaller** (`vieneu-server.spec` pin `hiddenimports` tường
  minh và có `excludes`). Nếu không gom được: fallback đã có sẵn (import lười → effects tự
  tắt), nhưng nên cài ở tier ext để tính năng không mất hẳn ở bản đóng gói.
- **Chạy `scripts/bootstrap_ref_text.py`** rồi RÀ TAY 83 transcript trước khi commit. Chưa
  làm bước này thì giọng dựng sẵn vẫn chưa dùng được với Qwen.
- **Kiểm thủ công đường nghi lễ** sau khi đổi sample rate: pregen → phát trên Backdrop.
  Typecheck và test đơn vị không bắt được lỗi "phát nhanh gấp đôi".
- 1 test `module-tts-studio` đỏ từ trước (timing, retry `listVoices`) — không liên quan,
  chưa đụng tới.

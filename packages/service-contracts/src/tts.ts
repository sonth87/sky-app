import type { EffectConfig, EffectTypeInfo } from './effect-preset.js';

/**
 * TtsPort — sinh audio giọng nói. Electron: client → local Python service (IPC).
 * Web: HTTP → backend TTS service. Xem docs/architecture/web-vs-electron.md.
 */
export interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  /** Loại giọng đọc (vd 'preset'|'cloned'). */
  type?: string;
  /** Vùng miền/giọng (vd 'northern'|'central'|'southern') — chỉ có khi server trả (registry mở rộng). */
  accent?: string;
  /** Nhóm nội dung phù hợp (vd 'narrator', 'podcast', 'news') — dùng để filter UI. */
  category?: string[];
  /** Mood/chất giọng (vd 'calm', 'warm', 'deep') — hiển thị phụ. */
  tags?: string[];
  tagline?: string;
  description?: string;
  /** id catalog entry gốc nếu voice này được server tự encode ngầm từ 1 catalog entry
   * (lần đầu synthesize chọn nó) — dùng để khớp/loại trùng với danh sách catalog ở UI. */
  sourceCatalogId?: string;
  /** Bản chép lời của audio mẫu — audio đó đang nói câu gì.
   *
   * Engine clone kiểu in-context cần nó để căn text↔âm thanh: Qwen BẮT BUỘC (thiếu là
   * audio hỏng hoàn toàn, không phải giảm chất lượng), VoxCPM tuỳ chọn (có thì clone
   * chính xác hơn), VieNeu/MOSS không dùng. Xem `TtsCapabilities.requiresRefText`. */
  refText?: string;
}

/** 1 entry trong thư viện voice mẫu 'hệ thống' — search/preview trước khi chọn dùng.
 * Không cần bước import riêng: chọn synthesize lần đầu server tự encode ngầm. */
export interface VoiceCatalogEntry {
  id: string;
  name: string;
  lang: string;
  language: string;
  gender: 'female' | 'male';
  age: string;
  accent: string;
  category: string[];
  tagline: string;
  description: string;
  tags: string[];
  file: string;
  clonable: boolean;
  source: 'vendor';
  /** true nếu đã từng được chọn dùng (server đã encode sẵn) — chỉ ảnh hưởng UI biết
   * phát preview qua registry hay qua file catalog gốc, không đổi cách chọn/dùng. */
  imported: boolean;
  /** true nếu đây là giọng mặc định để chọn lúc app mở (chỉ có tối đa 1 voice/ngôn ngữ). */
  default?: boolean;
}

/** vd "vi" → "Vietnamese" — khớp tên hiển thị đã dùng trong catalog.json's "language" field
 * (xem apps/tts-service/resources/voice-ref/{lang}/catalog.json). Thêm 1 ngôn ngữ mới (vd
 * "ko-KR") chỉ cần thêm 1 dòng ở đây — không phải sửa logic suy luận. */
const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
};

/**
 * Suy ra `Voice.language` hiển thị được (vd "Vietnamese"/"English") từ `sourceLang` thô
 * lưu trong registry (vd "vi-VN"/"en-US", field `extra.source_lang` — xem voice_registry.py).
 * Mặc định "Vietnamese" khi thiếu — mọi voice trước khi catalog en-US được thêm (preset
 * VieNeu, cloned thủ công qua /voices/clone, cloned từ catalog cũ chưa có source_lang) đều
 * là tiếng Việt, chưa từng có khái niệm ngôn ngữ khác. Prefix lạ (chưa có trong
 * LANGUAGE_NAMES) trả về nguyên `sourceLang` thay vì đoán bừa — thà hiện mã ngôn ngữ thô
 * còn hơn gắn nhãn sai (bug thật đã sửa trước đó: mọi thứ không phải "en*" đều bị gán cứng
 * "Vietnamese", nên "ko-KR" sẽ hiện sai thành tiếng Việt nếu không có nhánh này).
 *
 * Bug thật đã sửa (2026-08-04): 2 adapter (platform-electron/platform-web) trước đó gán
 * thẳng `language: v.region` — `region` là nhãn VÙNG MIỀN tiếng Việt (Bắc/Trung/Nam, xem
 * voice_registry.py's region_map), khác hẳn khái niệm NGÔN NGỮ. Voice en-US (không có accent)
 * rơi vào default "Bắc" của region_map ở main.py, khiến bộ lọc "Ngôn ngữ" trên UI lẫn lộn
 * "Bắc/Nam" (nhãn vùng miền của voice đã import vào registry) với "Vietnamese"/"English"
 * (giá trị `language` đúng, chỉ có ở voice catalog CHƯA import).
 */
export function languageFromSourceLang(sourceLang?: string): string {
  if (!sourceLang) return 'Vietnamese';
  const prefix = sourceLang.split('-')[0]?.toLowerCase();
  return (prefix && LANGUAGE_NAMES[prefix]) || sourceLang;
}

export interface SpeakOptions {
  voiceId?: string;
  speed?: number;
  temperature?: number;
  engine_overrides?: Record<string, Record<string, any>>;  // Engine-specific params
  /** Chuỗi hiệu ứng hậu kỳ đã resolve từ preset (xem EffectPresetPort). Client tra preset
   *  rồi gửi chuỗi cuối cùng — service TTS không biết khái niệm "preset" vì nó cách ly với
   *  cơ sở dữ liệu chứa preset. */
  effectsChain?: EffectConfig[];
}

export interface SynthesizeResult {
  buffer: ArrayBuffer;
  sampleRate: number;
}

export interface TtsPort {
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  listVoices(): Promise<Voice[]>;
  /** Sinh audio, trả buffer thô thay vì tự phát — dùng cho app cần giữ/lưu/tải audio (vd tts-studio). */
  synthesizeBuffer(text: string, opts?: SpeakOptions): Promise<SynthesizeResult>;
  /** URL để nghe thử 1 giọng trước khi chọn (vd audio tag src). */
  getPreviewUrl(voiceId: string): Promise<string>;
  /** Lấy capabilities của engine hiện tại (sampling params, emotion support, etc) — để UI render dynamic controls. */
  getEngineCapabilities?(): Promise<Record<string, any>>;
  /** Thư viện voice mẫu 'hệ thống' — optional: chỉ Electron adapter hỗ trợ hiện nay. */
  listVoiceCatalog?(lang?: string): Promise<VoiceCatalogEntry[]>;
  /** URL nghe thử audio gốc của catalog entry — dùng khi voice này CHƯA từng được
   * chọn dùng (chưa có trong registry nên chưa có /preview qua engine). */
  getCatalogAudioUrl?(lang: string, entryId: string): Promise<string>;
  /** Clone voice từ MỘT HOẶC NHIỀU file âm thanh mẫu — nhiều mẫu ghép lại cho model nhiều
   * ngữ cảnh về giọng hơn (port từ voicebox's combine_voice_prompts, xem
   * audio_dsp.py's combine_voice_samples). */
  cloneVoice?(opts: {
    /** Mỗi phần tử là 1 sample. Kiểu file tuỳ platform: đường dẫn string (Electron) hoặc
     * `File` (Web) — xem `filePath` cũ để biết vì sao `any`. */
    samples: Array<{ filePath: string | any; refText?: string }>;
    label: string;
    gender: string;
    region: string;
    age?: string;
    language?: string;
    tagline?: string;
    description?: string;
    tags?: string[];
  }): Promise<{
    ok: boolean;
    voice?: { id: string; label: string; gender: string; region: string; type: string; warnings?: string[] };
    error?: string;
  }>;
  /** Thêm 1 mẫu audio cho voice clone ĐÃ CÓ (khác lúc tạo mới — voice phải tồn tại rồi). */
  addVoiceSample?(voiceId: string, filePath: string | any, refText?: string): Promise<{
    ok: boolean;
    sample?: { id: string; ref_file: string; ref_text?: string; warnings?: string[] };
    error?: string;
  }>;
  /** Xoá 1 mẫu. Server từ chối (400) nếu đó là mẫu CUỐI CÙNG của voice — voice phải có ít
   * nhất 1 mẫu để còn dùng được. */
  deleteVoiceSample?(voiceId: string, sampleId: string): Promise<{ ok: boolean; error?: string }>;
  /** Danh sách mẫu của 1 voice clone — dùng khi mở lại giọng để sửa (thêm/xoá mẫu). */
  listVoiceSamples?(voiceId: string): Promise<Array<{ id: string; ref_file: string; ref_text?: string }>>;
  /** Sửa bản chép lời của SAMPLE ĐẦU TIÊN (giọng dựng sẵn hoặc đã clone trước khi có ô
   * nhập này). Server tự xoá embedding đã cache để transcript mới có hiệu lực ngay. */
  updateVoiceRefText?(voiceId: string, refText: string): Promise<{ ok: boolean; error?: string }>;
  /** Xóa voice đã clone. */
  deleteVoice?(voiceId: string): Promise<{ ok: boolean; error?: string }>;
  /** Mở hộp thoại chọn file âm thanh của OS (chỉ khả dụng trên Electron). */
  /** Mở hộp thoại chọn file — chọn được NHIỀU file cùng lúc (1 giọng clone từ nhiều mẫu). */
  pickAudioFile?(): Promise<{ ok: boolean; filePaths?: string[] }>;
  /** Bảng hiệu ứng hậu kỳ khả dụng + định nghĩa tham số, do service TTS khai
   *  (`GET /effects`). UI dựng slider từ đây thay vì hard-code — thêm hiệu ứng mới chỉ
   *  cần sửa phía service. Trả mảng rỗng khi service không hỗ trợ hiệu ứng. */
  listEffectTypes?(): Promise<EffectTypeInfo[]>;
}

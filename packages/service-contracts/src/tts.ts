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
  /** Thư viện voice mẫu 'hệ thống' — optional: chỉ Electron adapter hỗ trợ hiện nay. */
  listVoiceCatalog?(lang?: string): Promise<VoiceCatalogEntry[]>;
  /** URL nghe thử audio gốc của catalog entry — dùng khi voice này CHƯA từng được
   * chọn dùng (chưa có trong registry nên chưa có /preview qua engine). */
  getCatalogAudioUrl?(lang: string, entryId: string): Promise<string>;
  /** Clone voice từ file âm thanh mẫu. */
  cloneVoice?(opts: {
    filePath: string | any;
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
  /** Xóa voice đã clone. */
  deleteVoice?(voiceId: string): Promise<{ ok: boolean; error?: string }>;
  /** Mở hộp thoại chọn file âm thanh của OS (chỉ khả dụng trên Electron). */
  pickAudioFile?(): Promise<{ ok: boolean; filePath?: string }>;
}

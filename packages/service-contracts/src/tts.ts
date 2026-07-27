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

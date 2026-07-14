/** Trạng thái vòng đời của sinh viên trong buổi lễ */
export type StudentStatus =
  | 'registered'
  | 'checked_in'
  | 'called'
  | 'on_stage'
  | 'returned'
  | 'absent';

export type OnStageSource = 'auto' | 'manual' | null;
export type OperatingMode = 'auto' | 'manual';

/** Một sinh viên trong đợt trao bằng */
export interface Student {
  // Định danh
  id: string;                   // UUID từ hệ thống
  student_code: string;         // mã sinh viên (khóa QR)
  display_order: number;        // số thứ tự trao
  full_name: string;
  gender: string;
  date_of_birth: string;        // ISO datetime "2004-03-17T00:00:00+00:00"
  major_name: string;           // ngành
  faculty_name: string;         // khoa
  class_code: string;           // mã lớp "TA 16 - 01"
  course_code: string;          // khóa học "K16"
  phone_number: string;
  identity_number: string;      // CCCD / ID quốc phòng / số căn cước
  email: string;
  card_code?: string;           // Mã thẻ cứng / thẻ sinh viên
  gpa: number;
  classification: string;       // "Xuất sắc" | "Giỏi" | "Khá" | "Trung bình"
  classification_type: number;  // Mã loại phân loại
  achievement_title: string;    // danh hiệu phụ, "Khong" nếu không có
  award_type: string;           // "KHENTHUONG" | "TOTNGHIEP"
  award_type_code: string | null; // Mã loại giải thưởng
  award_content: string;        // nội dung khen thưởng — dùng làm key chọn backdrop
  presentation_template_type: string; // "Khen thưởng" | "Trao bằng"
  presentation_template_type_code: string | null; // Mã loại template
  quote: string | null;
  image_file_name: string;
  image_relative_path: string;  // đường dẫn ảnh tương đối, "" nếu chưa có
  graduation_batch_id: string;  // ID của đợt trao bằng
  batch_name: string;           // Tên đợt trao bằng
  degree_award_status: string;  // Trạng thái nhận bằng
  image_base64?: string | null;

  // Trạng thái vận hành (Slide quản lý)
  status: StudentStatus;
  ts_checkin: string | null;
  ts_called: string | null;
  ts_on_stage: string | null;
  ts_returned: string | null;
  src_on_stage: OnStageSource;
  staff_presenter: string | null; // tên cán bộ trao bằng

  // Tùy chọn
  absent?: boolean;
  absent_reason?: string;
}

/** Thông tin buổi lễ */
export interface Ceremony {
  id: number;
  name: string;               // "Lễ Trao Bằng Tốt Nghiệp"
  graduation_year: string;    // "2024-2025"
  date: string;               // ISO date
  venue: string;
  university_name: string;    // "TRƯỜNG ĐẠI HỌC ĐẠI NAM"
  ministry_name: string;      // "BỘ GIÁO DỤC VÀ ĐÀO TẠO"
  title_line1: string;        // dòng tiêu đề 1 trên backdrop (idle)
  title_line2: string;        // dòng tiêu đề 2
  logo: string;               // tên file logo
  backdrops_config: string;   // tên file config template, vd "assets/2026/backdrops.json"
  idle_image?: string;        // ảnh nền màn hình chào mừng, vd "assets/2026/backdrop_idle.jpg"
  idle_image_variants?: Partial<Record<BackdropAspectRatio, string>>; // ảnh màn chờ theo tỷ lệ, fallback về idle_image
}

export interface TtsCondition {
  id: string | number;
  attr: string;
  val: string;
  voice: string;
}

/** Toán tử so khớp cho rule của biến điều kiện tùy chỉnh */
export type VarRuleOp = 'equals' | 'contains' | 'in' | 'gt' | 'lt' | 'gte' | 'lte';

/** Một rule trong biến điều kiện: "Nếu [attr] [op] [val] → [result]" */
export interface CustomVariableRule {
  id: string | number;
  attr: string;   // "Ngành" | "Khoa" | "Giới tính" | "Xếp loại" | "Lớp" | "Khóa" | "Họ tên" | "GPA"
  op: VarRuleOp;
  val: string;    // với op 'in': các giá trị phân tách bằng dấu phẩy
  result: string; // text kết quả, vd "Kỹ sư"
}

/**
 * Biến điều kiện tùy chỉnh dùng trong template TTS (vd @danh_xung).
 * Giá trị được tính theo rules (xét từ trên xuống, rule đầu tiên khớp thắng),
 * fallback về `default` nếu không rule nào khớp.
 */
export interface CustomVariable {
  id: string | number;
  key: string;    // "danh_xung" → dùng @danh_xung; phải match /^[a-zA-Z_]+$/ (giới hạn regex renderTemplate)
  label: string;  // "Danh xưng" — hiện trong dropdown gợi ý @
  rules: CustomVariableRule[];
  default: string; // "Cử nhân" — fallback khi không rule nào khớp
}

/** Cấu hình vận hành */
export interface AppConfig {
  ws_port: number;
  http_port: number;
  mode: OperatingMode;
  delay_seconds: number;
  auto_open_browser: boolean;
  kiosk_mode: boolean;
  auto_load_first: boolean;
  slide_display_seconds: number;
  // Tự động về màn chờ (welcome screen) sau N giây không có SV mới được play.
  // Áp dụng cho cả mode auto và manual. Mặc định TẮT (idle_timeout_enabled=false).
  idle_timeout_enabled?: boolean;
  idle_timeout_seconds?: number;
  tts_model?: string;
  tts_speed?: number;
  tts_sentence_prefix?: string;
  tts_conditions?: TtsCondition[];
  tts_voice_pool?: string[];
  custom_variables?: CustomVariable[];
  layout_overrides?: Record<string, Partial<BackdropTemplate>>;
}

/** Một API tích hợp ngoài (webhook) gọi khi có sự kiện quét/phát/xóa slide */
export interface ApiIntegration {
  id: string;
  action: 'qr_scan' | 'play_student' | 'welcome_screen' | 'backdrop_toggle' | 'submit_log';
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: { key: string; value: string }[];
  payload: string;
}

/** Trạng thái phiên hiện tại */
export interface SessionState {
  current_on_stage_msv: string | null; // student_code của SV đang hiển thị
  pending_msv: string | null;
  mode: OperatingMode;
  last_scan_msv: string | null;
  last_scan_ts: string | null;
  broadcast_count: number;
  sync_queue: string[];
}

/** Toàn bộ dữ liệu một đợt — cấu trúc bundle.json */
export interface CeremonyBundle {
  room_id: string;
  room_name: string;
  ceremony: Ceremony;
  config: AppConfig;
  students: Student[];
  session_state: SessionState;
  _synced_at?: string;
  _bundle_version?: string;
}

// ---- Backdrop template types ----

/** Tỷ lệ khung hình màn hình chiếu backdrop */
export type BackdropAspectRatio = '16:9' | '25:9';

/** Một vùng hình chữ nhật trên backdrop, toạ độ theo % khung 16:9 */
export interface BackdropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Style chung cho text — dùng cho cả panel lẫn field riêng */
export interface BackdropTextStyle {
  align?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'center' | 'bottom';
  fontSize?: number;    // % chiều cao khung
  fontWeight?: number;
  color?: string;
  italic?: boolean;
  uppercase?: boolean;
}

/** Panel: vùng chứa nhiều field, stack theo chiều dọc. Style mặc định cho các field bên trong. */
export interface BackdropPanel extends BackdropRegion, BackdropTextStyle {
  gap?: number;
  fieldOrder?: string[];  // thứ tự field hiển thị, mặc định: full_name, major_name, classification, quote
}

/** Field riêng lẻ — override style từ panel nếu có set */
export type BackdropFieldOverride = BackdropTextStyle & {
  fontSize?: number;
  show?: boolean;
  prefix?: string;
  /** fontWeight riêng cho phần prefix (VD "NGÀNH: "). Mặc định = fontWeight của field. */
  prefixFontWeight?: number;
  text?: string;
};

/** Biến thể ảnh nền + toạ độ theo tỷ lệ màn hình. Toạ độ % tính theo khung của chính biến thể đó. */
export interface BackdropVariant {
  image: string;
  avatar?: BackdropRegion;
  panels?: BackdropPanel[];
  fields?: Record<string, BackdropFieldOverride>;
}

/** Template backdrop cho một loại tốt nghiệp / danh hiệu */
export interface BackdropTemplate {
  image: string;
  layout?: string;  // reference to layout in backdrops_layouts.json
  avatar?: BackdropRegion;
  avatarShape?: 'circle' | 'square';
  ring?: string;    // path to ring image
  // Panel layout: mỗi panel là một cụm text stack dọc
  panels?: BackdropPanel[];
  // Biến thể theo tỷ lệ màn hình (vd "25:9"). Tỷ lệ nào không khai báo sẽ fallback về image/avatar/panels ở trên (mặc định = 16:9).
  variants?: Partial<Record<BackdropAspectRatio, BackdropVariant>>;
  title?: string;   // override title from student data
  // Field overrides: key = tên field (full_name, major_name, classification, quote)
  // hoặc tên panel index "panel_0", "panel_1" không dùng
  fields?: Record<string, BackdropFieldOverride>;
  // Legacy — vẫn hỗ trợ để không break config cũ
  full_name?: BackdropTextRegion;
  major_name?: BackdropTextRegion;
  classification?: BackdropTextRegion;
  quote?: BackdropTextRegion;
  extra?: Record<string, BackdropTextRegion>;
}

/** Vùng chứa text + style (dùng cho legacy fields) */
export type BackdropTextRegion = BackdropRegion & BackdropTextStyle;

/** Map award_content → template. Key trùng student.award_content (uppercase trim). */
export type BackdropTemplateMap = Record<string, BackdropTemplate>;

/** Resolve template từ award_content, fallback về "default" */
export function resolveTemplate(
  templates: BackdropTemplateMap,
  awardContent: string | undefined,
): BackdropTemplate | null {
  if (!templates) return null;
  const key = (awardContent ?? '').trim().toUpperCase();
  return templates[key] ?? templates['default'] ?? null;
}

/**
 * Lấy { image, avatar, panels } hiệu lực cho một template theo tỷ lệ màn hình.
 * Nếu template không khai báo variant cho tỷ lệ đó thì fallback về field top-level (tương thích ngược, coi là "16:9").
 */
export function resolveTemplateVariant(
  template: BackdropTemplate,
  aspectRatio: BackdropAspectRatio,
): { image: string; avatar?: BackdropRegion; panels?: BackdropPanel[]; fields?: Record<string, BackdropFieldOverride> } {
  const variant = template.variants?.[aspectRatio];
  return {
    image: variant?.image ?? template.image,
    avatar: variant?.avatar ?? template.avatar,
    panels: variant?.panels ?? template.panels,
    fields: variant?.fields,
  };
}

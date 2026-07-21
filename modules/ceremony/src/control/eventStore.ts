// useEventStore — Giai đoạn 3 kế hoạch Event (docs/roadmap/plans/layout-designer/
// 10-quan-ly-dot-le-event.md, 13-ceremony-mo-rong.md). Slice Zustand RIÊNG khỏi useControlStore
// (store.ts, ~80 field phẳng trộn nhiều mối quan tâm — realtime/config/TTS/confetti) — quyết
// định kiến trúc đã chốt lúc lập kế hoạch: Gate component tự trị, không cần biết 80 field kia,
// để chỗ mở rộng cho Giai đoạn 4 (wizard 5 bước) không đụng store dashboard cũ.
//
// KHÔNG persist qua zustand/persist (khác useControlStore's settings) — Event active luôn đọc
// lại từ DB lúc mount, không cache local, vì đây là trạng thái SERVER (SQLite), không phải
// preference người dùng. NGOẠI LỆ DUY NHẤT: cờ "đã tự thoát Gate lần trước" (EXITED_GATE_KEY,
// xem readExitedGateEventId/writeExitedGateEventId bên dưới) — lưu eventId đã thoát, đọc 1 lần
// rồi xoá ngay, không phải cache dữ liệu Event.

import { create } from 'zustand';
import type { CanonicalGroup, CanonicalSubject, DataSource, EventDocument, EventSummary, FieldMappingProfile } from '@sky-app/slide-shared';
import type { EventPort, DataSourcePort } from '@sky-app/service-contracts';
import { useControlStore } from './store.js';
import { canonicalRecordsToStudents } from './canonicalToStudent.js';

/**
 * Cờ "đã tự thoát Gate lần trước" — KHÔNG dùng zustand/persist (khác useControlStore's
 * settings), chỉ 1 giá trị thô (eventId đã thoát) trong localStorage riêng biệt khỏi
 * `ceremony-control-storage` (storage-key.ts). Lý do cần tồn tại: `exitToGate()` không đổi
 * status DB (Event vẫn 'active') — nếu không có cờ này, tắt/mở lại app sẽ LUÔN tự động vào lại
 * Event đang active trong DB, bỏ qua việc user vừa chủ động thoát ra Gate trước khi tắt app
 * (bug thật phát hiện qua sử dụng thật, 2026-07-19).
 *
 * LƯU KÈM `eventId` (không phải boolean thô) — quan trọng để tránh lỗi khác: nếu giữa lúc thoát
 * và lúc mở lại app, có thiết bị/phiên KHÁC gọi `setActive()` sang 1 Event MỚI, cờ chỉ được áp
 * dụng khi Event đang active trong DB VẪN LÀ Event mà user đã thoát — Event mới kích hoạt phải
 * được vào thẳng bình thường, không bị cờ cũ chặn nhầm (phát hiện qua nhắc lại của user,
 * 2026-07-19, sau khi bản đầu chỉ dùng boolean thô không phân biệt được 2 case này).
 */
const EXITED_GATE_KEY = 'ceremony-event-exited-gate';

/** Trả `eventId` đã thoát nếu còn cờ, `null` nếu không có (chưa từng thoát/đã xoá). */
function readExitedGateEventId(): string | null {
  try {
    return localStorage.getItem(EXITED_GATE_KEY);
  } catch {
    return null;
  }
}

function writeExitedGateEventId(eventId: string | null): void {
  try {
    if (eventId) localStorage.setItem(EXITED_GATE_KEY, eventId);
    else localStorage.removeItem(EXITED_GATE_KEY);
  } catch {
    // localStorage không khả dụng (SSR/test) — fail-soft, hành vi cũ (luôn vào lại Event active).
  }
}

interface EventState {
  activeEvent: EventDocument | null;
  events: EventSummary[];
  loading: boolean;
  /** `dataSourcePort` optional cùng lý do `activateEvent` — môi trường chưa có adapter (web
   * WASM chưa implement, xem service-contracts's comment) vẫn phải hoạt động, chỉ là
   * `students` rỗng thay vì throw. */
  checkGate: (eventPort: EventPort, dataSourcePort: DataSourcePort | undefined) => Promise<void>;
  refreshList: (eventPort: EventPort) => Promise<void>;
  activateEvent: (eventPort: EventPort, dataSourcePort: DataSourcePort | undefined, id: string) => Promise<void>;
  /** Quay lại màn Danh sách Event (Gate) — CHỈ điều hướng UI cục bộ, KHÔNG đổi status trong DB
   * (không gọi setActive/save). Event vẫn 'active', backdrop trình chiếu vẫn tiếp tục bình
   * thường — giống "thu nhỏ" chứ không phải "kết thúc lễ" (17-prompt-claude-design-control.md
   * §5, câu hỏi mở về nút quay lại đổi Event, chốt qua AskUserQuestion 2026-07-19). */
  exitToGate: () => void;
  /** Giai đoạn 4a — wizard Bước 1/2 (thông tin cơ bản + import dữ liệu). Đều nhận `port` làm
   * tham số đầu (đúng pattern hiện có), không cache state phức tạp — caller (wizard UI) tự giữ
   * kết quả trả về trong state cục bộ của chính nó. */
  createDataSource: (dataSourcePort: DataSourcePort, doc: Omit<DataSource, 'records'>) => Promise<void>;
  importRecords: (
    dataSourcePort: DataSourcePort,
    dataSourceId: string,
    records: Array<CanonicalSubject | CanonicalGroup>,
  ) => Promise<{ imported: number }>;
  listFieldMappingProfiles: (dataSourcePort: DataSourcePort) => Promise<FieldMappingProfile[]>;
  saveFieldMappingProfile: (dataSourcePort: DataSourcePort, profile: FieldMappingProfile) => Promise<void>;
}

/**
 * Nạp `students` từ DataSource của 1 Event rồi ghi vào `useControlStore` — dùng CHUNG bởi
 * `activateEvent` (user chủ động bấm Kích hoạt) VÀ `checkGate` (mount thấy sẵn Event active).
 * Trước đây `checkGate()` chỉ `set({ activeEvent })` suông, KHÔNG gọi hàm này — khiến dashboard
 * hiện thẳng lên với `students` là bất cứ gì còn sót lại trong `useControlStore` từ luồng
 * `getMeta()` cũ (đọc `ceremony.db`/bundle pre-Event, KHÔNG liên quan DataSource của Event nào),
 * không phải data thật (bug thật phát hiện qua sử dụng thật, 2026-07-19 — user báo "thoát ra
 * danh sách rồi vào lại thì không thấy data, hình như lấy cả data cũ").
 */
async function loadStudentsForEvent(event: EventDocument, dataSourcePort: DataSourcePort | undefined): Promise<void> {
  // Giữ nguyên field VẬN HÀNH hiện có trong useControlStore (wsPort/mode/delaySeconds/
  // idleTimeout*/apiEnvironment) — chúng thuộc AppConfig chung, KHÔNG phải per-Event, đã được
  // nạp từ getMeta() TRƯỚC KHI Gate mount (xem ControlApp.tsx's useEffect). setMeta yêu cầu đủ
  // mọi field (không phải Partial) nên đọc lại state hiện tại thay vì hard-code default.
  const current = useControlStore.getState();
  const students = event.dataSourceId && dataSourcePort
    ? canonicalRecordsToStudents(await dataSourcePort.getRecords(event.dataSourceId, { excludeConsumedForEvent: event.id }))
    : [];

  useControlStore.getState().setMeta({
    ceremony: current.ceremony,
    students,
    syncedAt: new Date().toISOString(),
    wsPort: current.wsPort,
    mode: current.mode,
    delaySeconds: current.delaySeconds,
    idleTimeoutEnabled: current.idleTimeoutEnabled,
    idleTimeoutSeconds: current.idleTimeoutSeconds,
    apiEnvironment: current.apiEnvironment,
  });
}

export const useEventStore = create<EventState>((set, get) => ({
  activeEvent: null,
  events: [],
  loading: true,

  checkGate: async (eventPort, dataSourcePort) => {
    // try/finally — LUÔN thoát loading dù getCurrentActive() lỗi (mất kết nối IPC/network),
    // nếu không loading treo true vĩnh viễn và ControlApp.tsx kẹt ở màn "đang tải" không có
    // đường thoát (bug thật phát hiện qua review, 2026-07-19). Rethrow để caller tự quyết định
    // báo lỗi cho người dùng.
    set({ loading: true });
    try {
      const active = await eventPort.getCurrentActive();
      // Cờ "đã tự thoát Gate lần trước" (xem readExitedGateEventId ở trên) — CHỈ áp dụng khi
      // Event đang active trong DB VẪN LÀ đúng Event mà user đã thoát (so sánh eventId). Event
      // active đã đổi (thiết bị/phiên khác kích hoạt Event mới trong lúc app tắt) → bỏ qua cờ,
      // vào thẳng Event mới bình thường — không phải "khoá ở Gate" bất kể Event nào đang chạy.
      const exitedEventId = readExitedGateEventId();
      const matches = active !== null && exitedEventId === active.id;
      // CHỈ xoá cờ khi KHÔNG áp dụng (cờ thuộc Event khác/đã hết hạn dùng) — nếu xoá vô điều
      // kiện ngay khi đọc (bug thật phát hiện qua sử dụng thật, 2026-07-20), lần gọi checkGate()
      // THỨ HAI trong CÙNG 1 lượt khởi động (React StrictMode dev cố tình mount/unmount/mount
      // lại để bắt side-effect không an toàn — xem apps/shell-electron/src/main.tsx) sẽ đọc thấy
      // cờ đã bị lần đầu xoá mất, không còn khớp `active.id` nữa, và tự động vào lại dashboard —
      // ngược lại hoàn toàn quyết định đúng của lần gọi đầu tiên.
      if (!matches) writeExitedGateEventId(null);
      if (matches) {
        set({ activeEvent: null });
        return;
      }
      // QUAN TRỌNG: nạp students TRƯỚC KHI set({ activeEvent: active }) — cùng nguyên tắc
      // "fail trước khi hiện sai" đã áp dụng cho activateEvent (nếu getRecords() throw,
      // activeEvent KHÔNG được set, ControlApp.tsx vẫn đứng ở Gate thay vì hiện dashboard với
      // students cũ/sai mà không báo lỗi gì).
      if (active) await loadStudentsForEvent(active, dataSourcePort);
      set({ activeEvent: active });
    } finally {
      set({ loading: false });
    }
  },

  refreshList: async (eventPort) => {
    const events = await eventPort.list();
    set({ events });
  },

  activateEvent: async (eventPort, dataSourcePort, id) => {
    // Người dùng CHỦ ĐỘNG chọn vào 1 Event — huỷ cờ "đã thoát Gate" nếu còn (VD thoát ra rồi đổi
    // ý kích hoạt lại NGAY trong cùng phiên, chưa kịp tắt app) để lần checkGate() kế tiếp không
    // hiểu nhầm là "vẫn đang thoát" (kể cả trường hợp id trùng — thoát rồi kích hoạt lại CHÍNH
    // Event đó, ý định rõ ràng là muốn vào, không phải thoát).
    writeExitedGateEventId(null);
    await eventPort.setActive(id);
    const event = await eventPort.get(id);
    if (!event) {
      set({ activeEvent: null });
      return;
    }

    // QUAN TRỌNG: nạp students TRƯỚC KHI set({ activeEvent: event }) — nếu nó throw (bug thật
    // phát hiện qua review, 2026-07-19), activeEvent KHÔNG được set, ControlApp.tsx vẫn đứng ở
    // Gate thay vì hiện dashboard với students cũ/sai mà không báo lỗi gì. Exception tự
    // propagate lên caller (EventGate.tsx) để hiện toast.
    await loadStudentsForEvent(event, dataSourcePort);
    set({ activeEvent: event });
  },

  exitToGate: () => {
    const current = get().activeEvent;
    if (current) writeExitedGateEventId(current.id);
    set({ activeEvent: null });
  },

  createDataSource: async (dataSourcePort, doc) => {
    await dataSourcePort.create(doc);
  },

  importRecords: async (dataSourcePort, dataSourceId, records) => {
    return dataSourcePort.importRecords(dataSourceId, records);
  },

  listFieldMappingProfiles: async (dataSourcePort) => {
    return dataSourcePort.listFieldMappingProfiles();
  },

  saveFieldMappingProfile: async (dataSourcePort, profile) => {
    await dataSourcePort.saveFieldMappingProfile(profile);
  },
}));

// useEventStore — Giai đoạn 3 kế hoạch Event. Test với EventPort/DataSourcePort mock.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { EventPort, DataSourcePort } from '@sky-app/service-contracts';
import type { EventDocument, EventSummary, CanonicalSubject } from '@sky-app/slide-shared';
import { useEventStore } from './eventStore.js';
import { useControlStore } from './store.js';

// setMeta() ghi qua zustand/persist → cần localStorage thật (jsdom/browser) — Node test env
// (vitest.config.ts's environment:'node') không có sẵn, polyfill tối thiểu bằng Map, cùng
// pattern __tests__/store.storage-migration.test.ts.
beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mockEventPort(overrides: Partial<EventPort> = {}): EventPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    getCurrentActive: vi.fn().mockResolvedValue(null),
    setActive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockDataSourcePort(overrides: Partial<DataSourcePort> = {}): DataSourcePort {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    getRecords: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    importRecords: vi.fn().mockResolvedValue({ imported: 0 }),
    listFieldMappingProfiles: vi.fn().mockResolvedValue([]),
    saveFieldMappingProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function eventDoc(overrides: Partial<EventDocument> = {}): EventDocument {
  return {
    id: 'ev1',
    name: 'Đợt 1',
    status: 'active',
    customVariables: [],
    layoutRefs: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('useEventStore — checkGate', () => {
  it('không có event active → activeEvent null, loading false sau khi xong', async () => {
    const port = mockEventPort({ getCurrentActive: vi.fn().mockResolvedValue(null) });
    await useEventStore.getState().checkGate(port, undefined);
    expect(useEventStore.getState().activeEvent).toBeNull();
    expect(useEventStore.getState().loading).toBe(false);
  });

  it('có event active → activeEvent set đúng', async () => {
    const active = eventDoc();
    const port = mockEventPort({ getCurrentActive: vi.fn().mockResolvedValue(active) });
    await useEventStore.getState().checkGate(port, undefined);
    expect(useEventStore.getState().activeEvent?.id).toBe('ev1');
  });

  it('có event active + dataSourceId → nạp ĐÚNG students từ DataSourcePort.getRecords, KHÔNG phải data cũ còn sót trong useControlStore', async () => {
    // Bug thật phát hiện qua sử dụng thật (2026-07-19): user báo "thoát ra danh sách rồi vào
    // lại thì không thấy data, hình như lấy cả data cũ" — trước khi sửa, checkGate() chỉ
    // set({activeEvent}) suông, KHÔNG gọi getRecords()/setMeta() như activateEvent() — dashboard
    // hiện thẳng lên với students là bất cứ gì còn sót từ luồng getMeta() cũ (đọc ceremony.db,
    // không liên quan DataSource của Event), không phải data thật.
    useControlStore.setState({ students: [{ student_code: 'OLD', full_name: 'Data cũ còn sót' }] as never });
    const active = eventDoc({ dataSourceId: 'ds1' });
    const records: CanonicalSubject[] = [{ id: 'r1', full_name: 'Nguyễn Văn A', subjectType: 'student', extra: {} }];
    const eventPort = mockEventPort({ getCurrentActive: vi.fn().mockResolvedValue(active) });
    const dataSourcePort = mockDataSourcePort({ getRecords: vi.fn().mockResolvedValue(records) });

    await useEventStore.getState().checkGate(eventPort, dataSourcePort);

    expect(dataSourcePort.getRecords).toHaveBeenCalledWith('ds1', { excludeConsumedForEvent: 'ev1' });
    const students = useControlStore.getState().students as Array<{ full_name: string }>;
    expect(students).toHaveLength(1);
    expect(students[0].full_name).toBe('Nguyễn Văn A');
  });

  it('getCurrentActive() throw (mất kết nối IPC/network) → loading VẪN về false (không treo màn "đang tải" vĩnh viễn), lỗi propagate lên caller', async () => {
    const port = mockEventPort({ getCurrentActive: vi.fn().mockRejectedValue(new Error('IPC lỗi')) });

    await expect(useEventStore.getState().checkGate(port, undefined)).rejects.toThrow('IPC lỗi');

    // Bug thật phát hiện qua review (2026-07-19): trước khi sửa, thiếu try/finally khiến dòng
    // set({loading:false}) không bao giờ chạy khi getCurrentActive() throw — ControlApp.tsx kẹt
    // vĩnh viễn ở màn "đang tải" không có đường thoát.
    expect(useEventStore.getState().loading).toBe(false);
  });

  it('có cờ "đã thoát Gate" ĐÚNG eventId đang active trong DB → hiện Gate thay vì tự vào lại', async () => {
    // Bug thật phát hiện qua sử dụng thật (2026-07-19): exitToGate() không đổi status DB, Event
    // vẫn 'active' — tắt/mở lại app trước khi sửa LUÔN tự động vào lại Event đó, bỏ qua việc
    // user vừa chủ động thoát ra Gate trước khi tắt app.
    localStorage.setItem('ceremony-event-exited-gate', 'ev1');
    const active = eventDoc({ id: 'ev1' });
    const port = mockEventPort({ getCurrentActive: vi.fn().mockResolvedValue(active) });

    await useEventStore.getState().checkGate(port, undefined);

    expect(useEventStore.getState().activeEvent).toBeNull();
  });

  it('có cờ "đã thoát Gate" nhưng Event active trong DB đã ĐỔI SANG Event khác → bỏ qua cờ, vào thẳng Event mới', async () => {
    // Bug thật phát hiện qua nhắc lại của user (2026-07-19): bản đầu chỉ lưu boolean thô (không
    // kèm eventId) sẽ chặn NHẦM cả trường hợp này — thiết bị/phiên khác setActive() sang Event
    // MỚI trong lúc app đang tắt, lẽ ra phải vào thẳng Event mới bình thường, không phải Gate.
    localStorage.setItem('ceremony-event-exited-gate', 'ev1');
    const activeOther = eventDoc({ id: 'ev2' });
    const port = mockEventPort({ getCurrentActive: vi.fn().mockResolvedValue(activeOther) });

    await useEventStore.getState().checkGate(port, undefined);

    expect(useEventStore.getState().activeEvent?.id).toBe('ev2');
  });

  it('cờ "đã thoát Gate" chỉ áp dụng ĐÚNG 1 LẦN — xoá ngay sau khi đọc, lần checkGate() kế tiếp trở lại hành vi bình thường', async () => {
    localStorage.setItem('ceremony-event-exited-gate', 'ev1');
    const active = eventDoc({ id: 'ev1' });
    const port = mockEventPort({ getCurrentActive: vi.fn().mockResolvedValue(active) });

    await useEventStore.getState().checkGate(port, undefined);
    expect(useEventStore.getState().activeEvent).toBeNull();

    await useEventStore.getState().checkGate(port, undefined);
    expect(useEventStore.getState().activeEvent?.id).toBe('ev1');
  });
});

describe('useEventStore — refreshList', () => {
  it('gọi list() và set events', async () => {
    const summaries: EventSummary[] = [{ id: 'ev1', name: 'Đợt 1', status: 'draft', updatedAt: '2026-01-01' }];
    const port = mockEventPort({ list: vi.fn().mockResolvedValue(summaries) });
    await useEventStore.getState().refreshList(port);
    expect(useEventStore.getState().events).toEqual(summaries);
  });
});

describe('useEventStore — exitToGate (Giai đoạn 4b)', () => {
  it('set activeEvent về null, KHÔNG gọi bất kỳ port method nào (chỉ điều hướng UI cục bộ)', () => {
    useEventStore.setState({ activeEvent: eventDoc() });
    useEventStore.getState().exitToGate();
    expect(useEventStore.getState().activeEvent).toBeNull();
  });

  it('ghi ĐÚNG eventId đang thoát vào localStorage, để checkGate() lần khởi động sau đọc được', () => {
    useEventStore.setState({ activeEvent: eventDoc({ id: 'ev1' }) });
    useEventStore.getState().exitToGate();
    expect(localStorage.getItem('ceremony-event-exited-gate')).toBe('ev1');
  });
});

describe('useEventStore — activateEvent', () => {
  it('huỷ cờ "đã thoát Gate" nếu còn — chọn vào 1 Event là hành động ngược lại việc thoát', async () => {
    localStorage.setItem('ceremony-event-exited-gate', 'ev1');
    const doc = eventDoc({ dataSourceId: undefined });
    const port = mockEventPort({ setActive: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(doc) });

    await useEventStore.getState().activateEvent(port, undefined, 'ev1');

    expect(localStorage.getItem('ceremony-event-exited-gate')).toBeNull();
  });

  it('gọi setActive rồi get, set activeEvent đúng, gọi setMeta của useControlStore với students rỗng khi không có dataSourceId', async () => {
    const setMetaSpy = vi.spyOn(useControlStore.getState(), 'setMeta');
    const doc = eventDoc({ dataSourceId: undefined });
    const port = mockEventPort({ setActive: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(doc) });

    await useEventStore.getState().activateEvent(port, undefined, 'ev1');

    expect(port.setActive).toHaveBeenCalledWith('ev1');
    expect(useEventStore.getState().activeEvent?.id).toBe('ev1');
    expect(setMetaSpy).toHaveBeenCalledWith(expect.objectContaining({ students: [] }));
  });

  it('có dataSourceId → gọi DataSourcePort.getRecords với excludeConsumedForEvent, map Canonical→Student vào setMeta', async () => {
    const records: CanonicalSubject[] = [{ id: 'r1', full_name: 'A', subjectType: 'student', extra: {} }];
    const doc = eventDoc({ dataSourceId: 'ds1' });
    const eventPort = mockEventPort({ setActive: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(doc) });
    const dataSourcePort = mockDataSourcePort({ getRecords: vi.fn().mockResolvedValue(records) });
    const setMetaSpy = vi.spyOn(useControlStore.getState(), 'setMeta');

    await useEventStore.getState().activateEvent(eventPort, dataSourcePort, 'ev1');

    expect(dataSourcePort.getRecords).toHaveBeenCalledWith('ds1', { excludeConsumedForEvent: 'ev1' });
    expect(setMetaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ students: expect.arrayContaining([expect.objectContaining({ id: 'r1', full_name: 'A' })]) }),
    );
  });

  it('EventPort.get trả null sau setActive (dữ liệu bất thường) → activeEvent null, KHÔNG gọi setMeta', async () => {
    const setMetaSpy = vi.spyOn(useControlStore.getState(), 'setMeta');
    const port = mockEventPort({ setActive: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(null) });

    await useEventStore.getState().activateEvent(port, undefined, 'ev-mat-tich');

    expect(useEventStore.getState().activeEvent).toBeNull();
    expect(setMetaSpy).not.toHaveBeenCalled();
  });

  it('DataSourcePort.getRecords throw giữa chừng → activeEvent KHÔNG bị set (bug thật phát hiện qua review, 2026-07-19), KHÔNG gọi setMeta, lỗi propagate lên caller', async () => {
    // TRƯỚC KHI SỬA: set({activeEvent: event}) chạy TRƯỚC getRecords() → nếu getRecords throw,
    // activeEvent đã set (ControlApp.tsx hiện dashboard) nhưng setMeta chưa chạy → dashboard hiện
    // ra với students CŨ/rỗng, không có thông báo lỗi nào. Test này xác nhận activeEvent chỉ
    // được set SAU KHI mọi bước (kể cả getRecords) đã thành công.
    const setMetaSpy = vi.spyOn(useControlStore.getState(), 'setMeta');
    useEventStore.setState({ activeEvent: null });
    const doc = eventDoc({ dataSourceId: 'ds1' });
    const eventPort = mockEventPort({ setActive: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(doc) });
    const dataSourcePort = mockDataSourcePort({ getRecords: vi.fn().mockRejectedValue(new Error('DataSource lỗi')) });

    await expect(useEventStore.getState().activateEvent(eventPort, dataSourcePort, 'ev1')).rejects.toThrow('DataSource lỗi');

    expect(useEventStore.getState().activeEvent).toBeNull();
    expect(setMetaSpy).not.toHaveBeenCalled();
  });
});

describe('useEventStore — createDataSource/importRecords/FieldMappingProfile (Giai đoạn 4a)', () => {
  it('createDataSource gọi đúng DataSourcePort.create với doc truyền vào', async () => {
    const dataSourcePort = mockDataSourcePort();
    const doc = { id: 'ds1', label: 'SV khoá 2026', mode: 'consumable' as const, naturalKeyField: 'masv' };

    await useEventStore.getState().createDataSource(dataSourcePort, doc);

    expect(dataSourcePort.create).toHaveBeenCalledWith(doc);
  });

  it('importRecords gọi đúng DataSourcePort.importRecords, trả kết quả { imported }', async () => {
    const records: CanonicalSubject[] = [{ id: 'SV001', full_name: 'A', subjectType: 'student', extra: {} }];
    const dataSourcePort = mockDataSourcePort({ importRecords: vi.fn().mockResolvedValue({ imported: 1 }) });

    const result = await useEventStore.getState().importRecords(dataSourcePort, 'ds1', records);

    expect(dataSourcePort.importRecords).toHaveBeenCalledWith('ds1', records);
    expect(result).toEqual({ imported: 1 });
  });

  it('listFieldMappingProfiles gọi đúng DataSourcePort.listFieldMappingProfiles, trả đúng danh sách', async () => {
    const profiles = [{ id: 'p1', label: 'HR', subjectType: 'employee', naturalKeyField: 'manv', map: {} }];
    const dataSourcePort = mockDataSourcePort({ listFieldMappingProfiles: vi.fn().mockResolvedValue(profiles) });

    const result = await useEventStore.getState().listFieldMappingProfiles(dataSourcePort);

    expect(dataSourcePort.listFieldMappingProfiles).toHaveBeenCalled();
    expect(result).toEqual(profiles);
  });

  it('saveFieldMappingProfile gọi đúng DataSourcePort.saveFieldMappingProfile với profile truyền vào', async () => {
    const dataSourcePort = mockDataSourcePort();
    const profile = { id: 'p1', label: 'HR', subjectType: 'employee', naturalKeyField: 'manv', map: {} };

    await useEventStore.getState().saveFieldMappingProfile(dataSourcePort, profile);

    expect(dataSourcePort.saveFieldMappingProfile).toHaveBeenCalledWith(profile);
  });
});

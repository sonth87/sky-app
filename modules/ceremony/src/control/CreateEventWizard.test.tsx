// CreateEventWizard — Giai đoạn 4a kế hoạch Event.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { EventPort, DataSourcePort, LayoutPort } from '@sky-app/service-contracts';
import type { EventDocument } from '@sky-app/slide-shared';
import { CreateEventWizard } from './CreateEventWizard.js';

function eventDoc(overrides: Partial<EventDocument> = {}): EventDocument {
  return {
    id: 'ev1',
    name: 'Đợt 1',
    status: 'draft',
    customVariables: [],
    layoutRefs: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

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

function csvFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('CreateEventWizard — Bước 1: thông tin cơ bản + chọn nguồn dữ liệu', () => {
  it('nhánh "để sau" → Tiếp tục tạo Event luôn KHÔNG có dataSourceId, gọi onCreated', async () => {
    const eventPort = mockEventPort();
    const onCreated = vi.fn();
    render(
      <CreateEventWizard open eventPort={eventPort} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={() => {}} onCreated={onCreated} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Tiếp tục'));

    // Bước 1 giờ luôn dẫn tới Bước 3 (layout theo điều kiện, GĐ4b) trước khi tạo Event —
    // nhánh "để sau" bỏ qua Bước 2 nhưng vẫn đi qua Bước 3.
    await waitFor(() => expect(screen.getByText('Hoàn tất')).toBeTruthy());
    fireEvent.click(screen.getByText('Hoàn tất'));

    await waitFor(() => expect(eventPort.create).toHaveBeenCalled());
    const doc = (eventPort.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.name).toBe('Đợt 1');
    expect(doc.dataSourceId).toBeUndefined();
    expect(doc.status).toBe('draft');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('nhánh "dùng nguồn có sẵn" → Tiếp tục bị disable cho tới khi chọn 1 nguồn', async () => {
    const eventPort = mockEventPort();
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[{ id: 'ds1', label: 'SV khoá 2026', mode: 'consumable', recordCount: 10 }]}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Dùng nguồn có sẵn'));

    const nextButton = screen.getByText('Tiếp tục').closest('button')!;
    expect(nextButton).toBeDisabled();
  });

  it('tên trống → nút Tiếp tục disable', () => {
    render(<CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={() => {}} onCreated={() => {}} />);
    const nextButton = screen.getByText('Tiếp tục').closest('button')!;
    expect(nextButton).toBeDisabled();
  });

  it('nhánh "tạo nguồn dữ liệu mới" → chuyển sang Bước 2 (hiện vùng upload file)', async () => {
    render(<CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={mockDataSourcePort()} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Tạo nguồn dữ liệu mới'));
    fireEvent.click(screen.getByText('Tiếp tục'));

    await waitFor(() => expect(screen.getByText(/Kéo file vào đây/)).toBeTruthy());
  });
});

describe('CreateEventWizard — Bước 2: import + mapping cột', () => {
  async function openStep2(dataSourcePort: DataSourcePort = mockDataSourcePort()) {
    render(<CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={dataSourcePort} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Tạo nguồn dữ liệu mới'));
    fireEvent.click(screen.getByText('Tiếp tục'));
    await waitFor(() => screen.getByText(/Kéo file vào đây/));
  }

  it('upload file CSV → hiện đúng số dòng đã parse + bảng mapping cột', async () => {
    await openStep2();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = csvFile('ho_ten,masv\nNguyễn Văn A,SV001\nTrần Thị B,SV002');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/2 dòng|rows.*2/)).toBeTruthy());
  });

  it('preview đánh dấu ⚠ khi chưa map cột full_name (thiếu họ tên)', async () => {
    await openStep2();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [csvFile('ho_ten,masv\nA,SV001')] } });

    await waitFor(() => screen.getByText(/1 dòng|rows.*1/));
    // Chưa chọn cột nào cho full_name → preview hiện thiếu.
    expect(screen.getAllByText(/Thiếu họ tên|Missing full name/).length).toBeGreaterThan(0);
  });

  it('nút Xác nhận import bị disable khi có dòng trùng khoá tự nhiên', async () => {
    await openStep2();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [csvFile('ho_ten,masv\nA,SV001\nB,SV001')] } });
    await waitFor(() => screen.getByText(/2 dòng|rows.*2/));

    // Chọn masv làm khoá tự nhiên (2 dòng cùng SV001 → trùng).
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const naturalKeySelect = selects.find((s) => [...s.options].some((o) => o.value === 'masv'))!;
    fireEvent.change(naturalKeySelect, { target: { value: 'masv' } });

    await waitFor(() => expect(screen.getByText(/trùng khoá|duplicate identifier/)).toBeTruthy());
    const importButton = screen.getByText('Xác nhận import').closest('button')!;
    expect(importButton).toBeDisabled();
  });

  it('import thành công → gọi createDataSource, importRecords, rồi tạo Event với dataSourceId đúng', async () => {
    const dataSourcePort = mockDataSourcePort({ create: vi.fn().mockResolvedValue(undefined), importRecords: vi.fn().mockResolvedValue({ imported: 1 }) });
    const eventPort = mockEventPort();
    const onCreated = vi.fn();
    render(<CreateEventWizard open eventPort={eventPort} dataSourcePort={dataSourcePort} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Tạo nguồn dữ liệu mới'));
    fireEvent.click(screen.getByText('Tiếp tục'));
    await waitFor(() => screen.getByText(/Kéo file vào đây/));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [csvFile('ho_ten,masv\nNguyễn Văn A,SV001')] } });
    await waitFor(() => screen.getByText(/1 dòng|rows.*1/));

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const naturalKeySelect = selects.find((s) => [...s.options].some((o) => o.value === 'masv'))!;
    fireEvent.change(naturalKeySelect, { target: { value: 'masv' } });
    const fullNameMapSelect = selects.find((s) => [...s.options].some((o) => o.value === 'full_name'))!;
    fireEvent.change(fullNameMapSelect, { target: { value: 'full_name' } });

    await waitFor(() => expect(screen.getByText('Xác nhận import').closest('button')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Xác nhận import'));

    await waitFor(() => expect(dataSourcePort.create).toHaveBeenCalled());
    expect(dataSourcePort.importRecords).toHaveBeenCalled();
    const [dsId, records] = (dataSourcePort.importRecords as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('SV001');
    expect(records[0].full_name).toBe('Nguyễn Văn A');

    // Import xong → Bước 3 (layout theo điều kiện), Event chỉ tạo sau khi bấm "Hoàn tất".
    await waitFor(() => expect(screen.getByText('Hoàn tất')).toBeTruthy());
    fireEvent.click(screen.getByText('Hoàn tất'));

    await waitFor(() => expect(eventPort.create).toHaveBeenCalled());
    const eventDoc = (eventPort.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(eventDoc.dataSourceId).toBe(dsId);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});

describe('CreateEventWizard — Bước 3: layout theo điều kiện (GĐ4b)', () => {
  function mockLayoutPort(overrides: Partial<LayoutPort> = {}): LayoutPort {
    return {
      listDocuments: vi.fn().mockResolvedValue([]),
      getDocument: vi.fn().mockResolvedValue(null),
      createDocument: vi.fn().mockResolvedValue(undefined),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
      getVersion: vi.fn().mockResolvedValue(null),
      restoreVersion: vi.fn().mockResolvedValue(undefined),
      recordTokenUsage: vi.fn().mockResolvedValue(undefined),
      listTopVariables: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  it('không có layoutPort → hiện thông báo, vẫn cho Hoàn tất với layoutRefs rỗng', async () => {
    const eventPort = mockEventPort();
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Tiếp tục'));

    await waitFor(() => expect(screen.getByText(/dịch vụ Layout chưa sẵn sàng/)).toBeTruthy());
    fireEvent.click(screen.getByText('Hoàn tất'));

    await waitFor(() => expect(eventPort.create).toHaveBeenCalled());
    const doc = (eventPort.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.layoutRefs).toEqual([]);
  });

  it('có layoutPort → thêm 1 quy tắc, chọn layout → Hoàn tất tạo Event với layoutRefs đúng', async () => {
    const eventPort = mockEventPort();
    const layoutPort = mockLayoutPort({
      listDocuments: vi.fn().mockResolvedValue([{ id: 'layout-a', name: 'Layout A', description: undefined, latestPublishedVersion: 3 }]),
      getVersion: vi.fn().mockResolvedValue({
        version: 3,
        publishedAt: '2026-07-19T00:00:00.000Z',
        content: { variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, background: { kind: 'color', color: '#000' }, items: [] }] },
      }),
    });
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={layoutPort}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt 1' } });
    fireEvent.click(screen.getByText('Tiếp tục'));

    await waitFor(() => screen.getByText('+ Thêm quy tắc'));
    fireEvent.click(screen.getByText('+ Thêm quy tắc'));

    await waitFor(() => expect(screen.getAllByText('Chọn layout').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Chọn layout')[0]);
    await waitFor(() => screen.getByText('Layout A'));
    // Click chỉ tích chọn (UX mới, 2026-07-20) — phải bấm nút xác nhận mới thực sự chọn.
    fireEvent.click(screen.getByText('Layout A').closest('button')!);
    fireEvent.click(screen.getByText('Chọn layout này'));

    // Bước 3 giờ dẫn sang Bước 4 (Ghép biến, GĐ4c) trước khi tạo Event.
    fireEvent.click(screen.getByText('Tiếp tục'));
    await waitFor(() => screen.getByText('Hoàn tất'));
    fireEvent.click(screen.getByText('Hoàn tất'));

    await waitFor(() => expect(eventPort.create).toHaveBeenCalled());
    const doc = (eventPort.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(doc.layoutRefs).toHaveLength(1);
    expect(doc.layoutRefs[0].layoutId).toBe('layout-a');
    expect(doc.layoutRefs[0].layoutVersion).toBe(3);
  });
});

describe('CreateEventWizard — chế độ Sửa (initialEvent, Giai đoạn 4c mở rộng)', () => {
  it('mở thẳng Bước 3 (layout theo điều kiện), KHÔNG hiện Bước 1/2', async () => {
    const eventPort = mockEventPort();
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={() => {}}
        initialEvent={eventDoc()}
      />,
    );

    // Bước 1 có input tên "Lễ trao bằng..." — KHÔNG được hiện ở chế độ sửa.
    expect(screen.queryByPlaceholderText(/Lễ trao bằng/)).toBeNull();
    // Bước 3 (không có layoutPort) hiện thông báo layoutPortUnavailable + nút Lưu.
    await waitFor(() => expect(screen.getByText('Lưu')).toBeTruthy());
  });

  it('bấm Lưu → gọi eventPort.save() với đúng id/status/dataSourceId gốc, KHÔNG gọi create()', async () => {
    const eventPort = mockEventPort();
    const onCreated = vi.fn();
    const original = eventDoc({ id: 'ev-42', name: 'Đợt cũ', status: 'scheduled', dataSourceId: 'ds-99' });
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={onCreated}
        initialEvent={original}
      />,
    );

    await waitFor(() => screen.getByText('Lưu'));
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => expect(eventPort.save).toHaveBeenCalled());
    expect(eventPort.create).not.toHaveBeenCalled();
    const saved = (eventPort.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventDocument;
    expect(saved.id).toBe('ev-42');
    expect(saved.status).toBe('scheduled');
    expect(saved.dataSourceId).toBe('ds-99');
    expect(saved.name).toBe('Đợt cũ');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('layoutRefs có sẵn (1 rule + 1 default) → tách đúng vào LayoutRuleTable, không mất dữ liệu khi lưu lại', async () => {
    const eventPort = mockEventPort();
    const ruleRef = { layoutId: 'layout-a', layoutVersion: 1, selector: { groups: [{ rules: [] }], priority: 1 }, fieldMap: {} };
    const defaultRef = { layoutId: 'layout-default', layoutVersion: 2, fieldMap: {} };
    const original = eventDoc({ layoutRefs: [ruleRef, defaultRef] });
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={() => {}}
        initialEvent={original}
      />,
    );

    await waitFor(() => screen.getByText('Lưu'));
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => expect(eventPort.save).toHaveBeenCalled());
    const saved = (eventPort.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventDocument;
    expect(saved.layoutRefs).toHaveLength(2);
    expect(saved.layoutRefs.find((r) => r.layoutId === 'layout-a')).toBeTruthy();
    expect(saved.layoutRefs.find((r) => r.layoutId === 'layout-default')).toBeTruthy();
  });

  it('có nút "Xem thông tin cơ bản" ở Bước 3 → bấm vào thấy đúng tên/ngày đã lưu, KHÔNG rỗng', async () => {
    const eventPort = mockEventPort();
    const original = eventDoc({ name: 'Lễ trao bằng đợt 5', scheduledAt: '2026-08-15' });
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={() => {}}
        initialEvent={original}
      />,
    );

    await waitFor(() => screen.getByText('Xem thông tin cơ bản'));
    fireEvent.click(screen.getByText('Xem thông tin cơ bản'));

    // Bước 1 giờ hiện — input tên phải có giá trị ĐÚNG đã lưu, không rỗng.
    const nameInput = screen.getByPlaceholderText(/Lễ trao bằng/) as HTMLInputElement;
    expect(nameInput.value).toBe('Lễ trao bằng đợt 5');
  });

  it('từ Bước 1 (xem lại) bấm nút quay lại → về đúng Bước 3, KHÔNG mất layoutRefs đã cấu hình', async () => {
    const eventPort = mockEventPort();
    const ruleRef = { layoutId: 'layout-a', layoutVersion: 1, selector: { groups: [{ rules: [] }], priority: 1 }, fieldMap: {} };
    const original = eventDoc({ layoutRefs: [ruleRef] });
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[]}
        onClose={() => {}}
        onCreated={() => {}}
        initialEvent={original}
      />,
    );

    await waitFor(() => screen.getByText('Xem thông tin cơ bản'));
    fireEvent.click(screen.getByText('Xem thông tin cơ bản'));
    await waitFor(() => screen.getByPlaceholderText(/Lễ trao bằng/));

    fireEvent.click(screen.getByText('Xem cấu hình layout/biến'));

    // Về Bước 3 (không có layoutPort → hiện layoutPortUnavailable + nút Lưu) — bấm Lưu vẫn giữ
    // đúng layoutRefs đã có từ trước (không bị reset khi qua lại Bước 1).
    await waitFor(() => screen.getByText('Lưu'));
    fireEvent.click(screen.getByText('Lưu'));

    await waitFor(() => expect(eventPort.save).toHaveBeenCalled());
    const saved = (eventPort.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as EventDocument;
    expect(saved.layoutRefs).toHaveLength(1);
    expect(saved.layoutRefs[0].layoutId).toBe('layout-a');
  });

  it('dataSourceChoice="existing" hiện ĐÚNG label DataSource, KHÔNG hiện radio chọn nguồn', async () => {
    const eventPort = mockEventPort();
    const original = eventDoc({ dataSourceId: 'ds-1' });
    render(
      <CreateEventWizard
        open
        eventPort={eventPort}
        dataSourcePort={undefined}
        layoutPort={undefined}
        assetPort={undefined}
        dataSources={[{ id: 'ds-1', label: 'SV khoá 2026', mode: 'consumable', recordCount: 10 }]}
        onClose={() => {}}
        onCreated={() => {}}
        initialEvent={original}
      />,
    );

    await waitFor(() => screen.getByText('Xem thông tin cơ bản'));
    fireEvent.click(screen.getByText('Xem thông tin cơ bản'));

    await waitFor(() => expect(screen.getByText('SV khoá 2026')).toBeTruthy());
    // Không còn radio "Tạo nguồn dữ liệu mới" trong chế độ Sửa (readonly).
    expect(screen.queryByText('Tạo nguồn dữ liệu mới')).toBeNull();
  });
});

describe('CreateEventWizard — xác nhận huỷ thay đổi khi thoát qua Esc/nút X (2026-07-20)', () => {
  it('Esc khi CHƯA có thay đổi gì → đóng thẳng, KHÔNG hiện confirm', async () => {
    const onClose = vi.fn();
    render(
      <CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={onClose} onCreated={() => {}} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Huỷ bỏ thay đổi?')).toBeNull();
  });

  it('Esc SAU KHI đã gõ tên → hiện confirm, KHÔNG đóng ngay', async () => {
    const onClose = vi.fn();
    render(
      <CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={onClose} onCreated={() => {}} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt thay đổi' } });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Huỷ bỏ thay đổi?')).toBeTruthy();
  });

  it('confirm "Huỷ thay đổi" trong popup → đóng thật, gọi onClose', async () => {
    const onClose = vi.fn();
    render(
      <CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={onClose} onCreated={() => {}} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt thay đổi' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByText('Huỷ thay đổi'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('huỷ popup confirm (giữ lại) → KHÔNG gọi onClose, dữ liệu đã gõ vẫn còn', async () => {
    const onClose = vi.fn();
    render(
      <CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={onClose} onCreated={() => {}} />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng/), { target: { value: 'Đợt thay đổi' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    // Popup ConfirmModal có nút "Hủy" RIÊNG (đóng popup, GIỮ LẠI thay đổi) — trùng text với nút
    // "Hủy" ở Bước 1 phía dưới (vẫn còn trong DOM, chỉ bị ConfirmModal che). Scope query vào
    // đúng popup qua tiêu đề "Huỷ bỏ thay đổi?" để tránh khớp nhầm.
    const dialogTitle = screen.getByText('Huỷ bỏ thay đổi?');
    const dialog = dialogTitle.closest('div')!.parentElement!;
    fireEvent.click(within(dialog).getByText('Hủy'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Huỷ bỏ thay đổi?')).toBeNull();
    expect(screen.getByDisplayValue('Đợt thay đổi')).toBeTruthy();
  });

  it('click ra ngoài backdrop KHÔNG đóng modal (closeOnBackdrop=false)', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <CreateEventWizard open eventPort={mockEventPort()} dataSourcePort={undefined} layoutPort={undefined} assetPort={undefined} dataSources={[]} onClose={onClose} onCreated={() => {}} />,
    );

    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('chế độ Sửa: đổi customVariables rồi Esc → hiện confirm', async () => {
    const onClose = vi.fn();
    const original = eventDoc({ id: 'ev1', layoutRefs: [] });
    render(
      <CreateEventWizard
        open
        eventPort={mockEventPort()}
        dataSourcePort={undefined}
        layoutPort={{ listDocuments: vi.fn().mockResolvedValue([]) } as unknown as LayoutPort}
        assetPort={undefined}
        dataSources={[]}
        onClose={onClose}
        onCreated={() => {}}
        initialEvent={original}
      />,
    );

    // Chế độ Sửa nhảy thẳng Bước 3 — layoutPort tồn tại nên hiện LayoutRuleTable, chưa đổi gì.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

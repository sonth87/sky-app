// EventHubModal — PHỤ LỤC "Event Hub" (2026-07-22), thay CreateEventWizard.tsx.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DataSourcePort, EventPort, LayoutPort } from '@sky-app/service-contracts';
import type { EventDocument } from '@sky-app/slide-shared';
import './i18n.js';
import { EventHubModal } from './EventHubModal.js';

function mockEventPort(overrides: Partial<EventPort> = {}): EventPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
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

function mockLayoutPort(overrides: Partial<LayoutPort> = {}): LayoutPort {
  return {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    createDocument: vi.fn().mockResolvedValue(undefined),
    updateDocumentMeta: vi.fn().mockResolvedValue(undefined),
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

function sampleEvent(overrides: Partial<EventDocument> = {}): EventDocument {
  return {
    id: 'ev1',
    name: 'Lễ trao bằng',
    status: 'draft',
    customVariables: [],
    layoutRefs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EventHubModal — Giai đoạn A (tạo mới)', () => {
  it('chưa có initialEvent → hiện form tối giản tên+ngày, nút Tạo bị disable khi tên rỗng', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
      />,
    );
    const createButton = screen.getByText('Tạo').closest('button')!;
    expect(createButton).toBeDisabled();
  });

  it('nhập tên rồi bấm Tạo → gọi eventPort.create() với data/layout rỗng, CHUYỂN sang Giai đoạn B (Hub) mà KHÔNG đóng modal', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort({ create })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={onChanged}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Lễ trao bằng đợt/), { target: { value: 'Lễ trao bằng 2026' } });
    fireEvent.click(screen.getByText('Tạo'));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const doc = create.mock.calls[0][0] as EventDocument;
    expect(doc.name).toBe('Lễ trao bằng 2026');
    expect(doc.dataSourceId).toBeUndefined();
    expect(doc.layoutRefs).toEqual([]);

    // Giai đoạn B — Hub hiện 2 nút chức năng, KHÔNG còn form tạo mới.
    await waitFor(() => expect(screen.getByText('Import dữ liệu')).toBeTruthy());
    expect(screen.getByText('Chọn layout')).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('EventHubModal — Giai đoạn B (Hub, Event đã tồn tại)', () => {
  it('initialEvent truyền vào → mở THẲNG vào Hub, bỏ qua form tạo mới', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    expect(screen.getByText('Import dữ liệu')).toBeTruthy();
    expect(screen.getByText('Chọn layout')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Lễ trao bằng đợt/)).toBeNull();
  });

  it('initialView="info" (nút "Sửa" chính, 2026-08-03 phản hồi thật) → mở THẲNG vào màn Sửa thông tin, bỏ qua Hub menu — thấy ngay nút Xoá', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({ name: 'Lễ trao bằng' })}
        initialView="info"
      />,
    );
    expect(screen.getByText('Sửa thông tin sự kiện')).toBeTruthy();
    expect(screen.getByDisplayValue('Lễ trao bằng')).toBeTruthy();
    expect(screen.getByText('Xoá đợt lễ này')).toBeTruthy();
    expect(screen.queryByText('Import dữ liệu')).toBeNull(); // KHÔNG dừng ở Hub menu
  });

  it('Event chưa có dataSourceId/layoutRefs → cả 2 thẻ hiện trạng thái "chưa có", không có dấu tick', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
    expect(screen.getByText('Chưa có layout')).toBeTruthy();
  });

  it('Event đã có dataSourceId/layoutRefs → hiện trạng thái đã có', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({
          dataSourceId: 'ds1',
          layoutRefs: [{ layoutId: 'l1', layoutVersion: 1, fieldMap: {}, role: 'award' }],
        })}
      />,
    );
    expect(screen.getByText('Đã có dữ liệu')).toBeTruthy();
    expect(screen.getByText('1 quy tắc layout')).toBeTruthy();
  });

  it('bấm "Import dữ liệu" → chuyển sang ImportDataPanel (title đổi, KHÔNG đóng modal)', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    fireEvent.click(screen.getByText('Import dữ liệu'));
    expect(screen.getByText(/Nhập dữ liệu/)).toBeTruthy();
  });

  it('bấm "Chọn layout" → chuyển sang LayoutConfigPanel (title đổi)', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    fireEvent.click(screen.getByText('Chọn layout'));
    expect(screen.getByText(/Cấu hình layout/)).toBeTruthy();
  });
});

describe('EventHubModal — Xuất đợt lễ (Giai đoạn 5.3, Export/Import Loại 2)', () => {
  it('eventPort không có exportBundle (VD Web) → thẻ "Xuất đợt lễ này" bị disable', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    expect(screen.getByText('Xuất đợt lễ này').closest('button')).toBeDisabled();
  });

  it('eventPort có exportBundle → bấm thẻ mở màn xác nhận, checkbox "bao gồm dữ liệu" mặc định BẬT kèm cảnh báo PII', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort({ exportBundle: vi.fn() })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    fireEvent.click(screen.getByText('Xuất đợt lễ này'));

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText(/chứa thông tin cá nhân/)).toBeTruthy();
  });

  it('bỏ tích checkbox → cảnh báo PII biến mất', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort({ exportBundle: vi.fn() })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    fireEvent.click(screen.getByText('Xuất đợt lễ này'));
    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.queryByText(/chứa thông tin cá nhân/)).toBeNull();
  });

  it('bấm Xuất → gọi exportBundle đúng eventId + includeData, thành công → quay lại Hub menu', async () => {
    const exportBundle = vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/dot-le.zip' });
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort({ exportBundle })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({ id: 'ev-export-1' })}
      />,
    );
    fireEvent.click(screen.getByText('Xuất đợt lễ này'));
    fireEvent.click(screen.getByText('Xuất'));

    await waitFor(() => expect(exportBundle).toHaveBeenCalledWith('ev-export-1', { includeData: true }));
    await waitFor(() => expect(screen.getByText('Xuất đợt lễ này')).toBeTruthy()); // quay lại Hub menu
  });

  it('người dùng huỷ dialog lưu file (exportBundle trả null) → không đóng modal, không throw', async () => {
    const exportBundle = vi.fn().mockResolvedValue(null);
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort({ exportBundle })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent()}
      />,
    );
    fireEvent.click(screen.getByText('Xuất đợt lễ này'));
    fireEvent.click(screen.getByText('Xuất'));

    await waitFor(() => expect(exportBundle).toHaveBeenCalled());
  });
});

describe('EventHubModal — Xoá Event (yêu cầu Sonth 2026-08-03, kiểu "gõ tên để xác nhận" như GitHub)', () => {
  function openDeleteConfirm() {
    fireEvent.click(screen.getByTitle('Sửa tên/ngày sự kiện'));
    fireEvent.click(screen.getByText('Xoá đợt lễ này'));
  }

  it('màn Sửa (info) có nút đỏ "Xoá đợt lễ này", bấm vào mở màn xác nhận với input trống', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({ name: 'Lễ trao bằng' })}
      />,
    );
    openDeleteConfirm();

    expect(screen.getByText('Xoá đợt lễ vĩnh viễn?')).toBeTruthy();
    expect(screen.getByPlaceholderText('Lễ trao bằng')).toBeTruthy();
  });

  it('gõ SAI tên Event → nút "Xoá vĩnh viễn" vẫn disable', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({ name: 'Lễ trao bằng' })}
      />,
    );
    openDeleteConfirm();
    fireEvent.change(screen.getByPlaceholderText('Lễ trao bằng'), { target: { value: 'sai tên' } });

    expect(screen.getByText('Xoá vĩnh viễn').closest('button')).toBeDisabled();
  });

  it('gõ ĐÚNG tên Event (phân biệt hoa/thường) → nút enable, bấm vào gọi eventPort.delete(event.id), đóng modal + gọi onChanged', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(
      <EventHubModal
        open
        onClose={onClose}
        eventPort={mockEventPort({ delete: del })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={onChanged}
        initialEvent={sampleEvent({ id: 'ev-del-1', name: 'Lễ trao bằng' })}
      />,
    );
    openDeleteConfirm();
    fireEvent.change(screen.getByPlaceholderText('Lễ trao bằng'), { target: { value: 'Lễ trao bằng' } });

    const confirmButton = screen.getByText('Xoá vĩnh viễn').closest('button')!;
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() => expect(del).toHaveBeenCalledWith('ev-del-1'));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('gõ đúng tên nhưng SAI hoa/thường → vẫn disable (so khớp tuyệt đối)', () => {
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort()}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({ name: 'Lễ trao bằng' })}
      />,
    );
    openDeleteConfirm();
    fireEvent.change(screen.getByPlaceholderText('Lễ trao bằng'), { target: { value: 'lễ trao bằng' } });

    expect(screen.getByText('Xoá vĩnh viễn').closest('button')).toBeDisabled();
  });

  it('bấm Huỷ ở màn xác nhận → quay lại màn Sửa (info), KHÔNG gọi delete', () => {
    const del = vi.fn();
    render(
      <EventHubModal
        open
        onClose={() => {}}
        eventPort={mockEventPort({ delete: del })}
        dataSourcePort={mockDataSourcePort()}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        onChanged={() => {}}
        initialEvent={sampleEvent({ name: 'Lễ trao bằng' })}
      />,
    );
    openDeleteConfirm();
    fireEvent.click(screen.getByText('Hủy'));

    expect(screen.getByText('Sửa thông tin sự kiện')).toBeTruthy(); // quay lại info view
    expect(del).not.toHaveBeenCalled();
  });
});

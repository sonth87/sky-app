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

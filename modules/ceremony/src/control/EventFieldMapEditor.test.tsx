// EventFieldMapEditor — Giai đoạn 4c kế hoạch Event (wizard Bước 4: Ghép biến).

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { LayoutPort } from '@sky-app/service-contracts';
import type { CustomVariable, EventLayoutRef, LayoutContent } from '@sky-app/slide-shared';
import './i18n.js';
import { EventFieldMapEditor } from './EventFieldMapEditor.js';
import type { LayoutRuleRow } from './LayoutRuleTable.js';

const SAMPLE_CONTENT: LayoutContent = {
  variants: [
    {
      aspect: { id: '16:9', w: 16, h: 9 },
      refW: 1920,
      refH: 1080,
      background: { kind: 'color', color: '#000' },
      items: [
        { id: 't1', type: 'text', box: { x: 0, y: 0, w: 400, h: 100 }, content: 'Chúc mừng @full_name — @gpa', fontSize: 32, color: '#fff', align: 'left' },
        { id: 'i1', type: 'image', box: { x: 0, y: 100, w: 200, h: 200 }, varKey: 'avatar', shape: 'rect', fit: 'cover' },
      ],
    },
  ],
};

function mockLayoutPort(): LayoutPort {
  return {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    createDocument: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue({ version: 1, publishedAt: '2026-01-01', content: SAMPLE_CONTENT }),
    restoreVersion: vi.fn().mockResolvedValue(undefined),
    recordTokenUsage: vi.fn().mockResolvedValue(undefined),
    listTopVariables: vi.fn().mockResolvedValue([]),
  };
}

function rowWithRef(ref: Partial<EventLayoutRef> = {}): LayoutRuleRow {
  return { id: 'row1', label: 'Quy tắc A', ref: { layoutId: 'layout-a', layoutVersion: 1, fieldMap: {}, ...ref } };
}

describe('EventFieldMapEditor', () => {
  it('không có layout nào (rows+defaultRef rỗng) → hiện thông báo trống', () => {
    render(
      <EventFieldMapEditor
        rows={[]}
        onChangeRows={() => {}}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={[]}
        customVariables={[]}
        onChangeCustomVariables={() => {}}
      />,
    );
    expect(screen.getByText(/Chưa có layout nào/)).toBeTruthy();
  });

  it('trích đúng token từ layout (text content + image varKey), hiện đủ trong bảng', async () => {
    render(
      <EventFieldMapEditor
        rows={[rowWithRef()]}
        onChangeRows={() => {}}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={[]}
        customVariables={[]}
        onChangeCustomVariables={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('@full_name')).toBeTruthy());
    expect(screen.getByText('@gpa')).toBeTruthy();
    expect(screen.getByText('@avatar')).toBeTruthy();
  });

  it('chọn nguồn "Cột dữ liệu" cho 1 token → gọi onChangeRows với fieldMap đúng {kind:raw, sourceKey}', async () => {
    const onChangeRows = vi.fn();
    render(
      <EventFieldMapEditor
        rows={[rowWithRef()]}
        onChangeRows={onChangeRows}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={['gpa', 'full_name']}
        customVariables={[]}
        onChangeCustomVariables={() => {}}
      />,
    );
    await waitFor(() => screen.getByText('@full_name'));

    const rowEl = screen.getByText('@full_name').closest('tr')!;
    const sourceSelect = rowEl.querySelector('select')!;
    fireEvent.change(sourceSelect, { target: { value: 'raw' } });

    expect(onChangeRows).toHaveBeenCalled();
    const updated = onChangeRows.mock.calls[0][0] as LayoutRuleRow[];
    expect(updated[0]!.ref.fieldMap.full_name).toEqual({ kind: 'raw', sourceKey: 'gpa' });
  });

  it('chọn nguồn "Tính theo điều kiện" → fieldMap {kind:computed, variableKey} đúng biến đầu tiên', async () => {
    const onChangeRows = vi.fn();
    const variables: CustomVariable[] = [{ id: 'v1', key: 'xep_loai', label: 'Xếp loại', rules: [], default: '' }];
    render(
      <EventFieldMapEditor
        rows={[rowWithRef()]}
        onChangeRows={onChangeRows}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={[]}
        customVariables={variables}
        onChangeCustomVariables={() => {}}
      />,
    );
    await waitFor(() => screen.getByText('@gpa'));

    const rowEl = screen.getByText('@gpa').closest('tr')!;
    const sourceSelect = rowEl.querySelector('select')!;
    fireEvent.change(sourceSelect, { target: { value: 'computed' } });

    const updated = onChangeRows.mock.calls[0][0] as LayoutRuleRow[];
    expect(updated[0]!.ref.fieldMap.gpa).toEqual({ kind: 'computed', variableKey: 'xep_loai' });
  });

  it('auto-suggest hiện nút gợi ý khi tên token khớp attrSuggestions (chuẩn hoá lowercase), KHÔNG tự ghi vào fieldMap', async () => {
    const onChangeRows = vi.fn();
    render(
      <EventFieldMapEditor
        rows={[rowWithRef()]}
        onChangeRows={onChangeRows}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={['GPA']}
        customVariables={[]}
        onChangeCustomVariables={() => {}}
      />,
    );
    await waitFor(() => screen.getByText('@gpa'));

    // Chưa bấm gì → onChangeRows KHÔNG được gọi (không tự ghi đè).
    expect(onChangeRows).not.toHaveBeenCalled();

    const rowEl = screen.getByText('@gpa').closest('tr')!;
    const suggestionButton = within(rowEl).getByText('GPA');
    fireEvent.click(suggestionButton);

    const updated = onChangeRows.mock.calls[0][0] as LayoutRuleRow[];
    expect(updated[0]!.ref.fieldMap.gpa).toEqual({ kind: 'raw', sourceKey: 'GPA' });
  });

  it('không có gợi ý khớp tên → không hiện nút auto-suggest', async () => {
    render(
      <EventFieldMapEditor
        rows={[rowWithRef()]}
        onChangeRows={() => {}}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={['unrelated_column']}
        customVariables={[]}
        onChangeCustomVariables={() => {}}
      />,
    );
    await waitFor(() => screen.getByText('@gpa'));
    const rowEl = screen.getByText('@gpa').closest('tr')!;
    expect(within(rowEl).queryByText('unrelated_column')).toBeNull();
  });

  it('bấm "Quản lý biến điều kiện" → hiện CustomVariableEditor, thêm biến mới gọi onChangeCustomVariables', async () => {
    const onChangeCustomVariables = vi.fn();
    render(
      <EventFieldMapEditor
        rows={[rowWithRef()]}
        onChangeRows={() => {}}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        attrSuggestions={[]}
        customVariables={[]}
        onChangeCustomVariables={onChangeCustomVariables}
      />,
    );
    await waitFor(() => screen.getByText('@gpa'));
    fireEvent.click(screen.getByText('Quản lý biến điều kiện'));

    // "Thêm biến" xuất hiện 2 lần khi rỗng (emptyState's <b> highlight + nút thật) — lấy nút
    // thật (button), không phải đoạn text gợi ý trong emptyState.
    await waitFor(() => expect(screen.getAllByText('Thêm biến').length).toBeGreaterThan(0));
    const addButton = screen.getAllByText('Thêm biến').find((el) => el.closest('button'))!;
    fireEvent.click(addButton);

    expect(onChangeCustomVariables).toHaveBeenCalled();
    const vars = onChangeCustomVariables.mock.calls[0][0] as CustomVariable[];
    expect(vars).toHaveLength(1);
  });

  it('dòng Mặc định (defaultRef) hiện đúng tab riêng, cập nhật qua onChangeDefaultRef', async () => {
    const onChangeDefaultRef = vi.fn();
    const defaultRef: EventLayoutRef = { layoutId: 'layout-default', layoutVersion: 2, fieldMap: {} };
    render(
      <EventFieldMapEditor
        rows={[]}
        onChangeRows={() => {}}
        defaultRef={defaultRef}
        onChangeDefaultRef={onChangeDefaultRef}
        layoutPort={mockLayoutPort()}
        attrSuggestions={['gpa']}
        customVariables={[]}
        onChangeCustomVariables={() => {}}
      />,
    );
    expect(screen.getByText('Mặc định')).toBeTruthy();
    await waitFor(() => screen.getByText('@gpa'));

    const rowEl = screen.getByText('@gpa').closest('tr')!;
    const sourceSelect = rowEl.querySelector('select')!;
    fireEvent.change(sourceSelect, { target: { value: 'raw' } });

    expect(onChangeDefaultRef).toHaveBeenCalled();
    const updated = onChangeDefaultRef.mock.calls[0][0] as EventLayoutRef;
    expect(updated.fieldMap.gpa).toEqual({ kind: 'raw', sourceKey: 'gpa' });
  });
});

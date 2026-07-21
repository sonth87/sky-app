// LayoutRuleTable — Giai đoạn 4b kế hoạch Event.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AssetPort, LayoutPort } from '@sky-app/service-contracts';
import type { LayoutContent, LayoutDocument, LayoutVersion } from '@sky-app/slide-shared';
import './i18n.js';
import { LayoutRuleTable, type LayoutRuleRow } from './LayoutRuleTable.js';

const SAMPLE_CONTENT: LayoutContent = {
  variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, background: { kind: 'color', color: '#000' }, items: [] }],
};

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

function sampleRow(id: string, priority: number): LayoutRuleRow {
  return {
    id,
    label: `Rule ${id}`,
    ref: { layoutId: '', layoutVersion: 0, selector: { groups: [{ rules: [] }], priority }, fieldMap: {} },
  };
}

describe('LayoutRuleTable', () => {
  it('thêm 1 hàng mới → onChange nhận đủ số hàng, priority theo vị trí', () => {
    const onChange = vi.fn();
    render(
      <LayoutRuleTable
        rows={[]}
        onChange={onChange}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        attrSuggestions={[]}
      />,
    );

    fireEvent.click(screen.getByText('+ Thêm quy tắc'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const rows = onChange.mock.calls[0][0] as LayoutRuleRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].ref.selector?.priority).toBe(1);
  });

  it('đổi tên (label) 1 hàng cập nhật đúng, không đổi hàng khác', () => {
    const rows = [sampleRow('a', 2), sampleRow('b', 1)];
    const onChange = vi.fn();
    render(
      <LayoutRuleTable
        rows={rows}
        onChange={onChange}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        attrSuggestions={[]}
      />,
    );

    const labelInputs = screen.getAllByPlaceholderText('Tên quy tắc (VD: Sinh viên xuất sắc)');
    fireEvent.change(labelInputs[0], { target: { value: 'GPA cao' } });

    const nextRows = onChange.mock.calls[0][0] as LayoutRuleRow[];
    expect(nextRows[0].label).toBe('GPA cao');
    expect(nextRows[1].label).toBe('Rule b');
  });

  it('xoá 1 hàng → onChange còn đúng hàng còn lại, priority tính lại', () => {
    const rows = [sampleRow('a', 2), sampleRow('b', 1)];
    const onChange = vi.fn();
    render(
      <LayoutRuleTable
        rows={rows}
        onChange={onChange}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        attrSuggestions={[]}
      />,
    );

    const removeButtons = screen.getAllByLabelText('Xoá quy tắc');
    fireEvent.click(removeButtons[0]);

    const nextRows = onChange.mock.calls[0][0] as LayoutRuleRow[];
    expect(nextRows).toHaveLength(1);
    expect(nextRows[0].id).toBe('b');
    expect(nextRows[0].ref.selector?.priority).toBe(1);
  });

  it('dòng Mặc định luôn hiện, không có nút xoá/kéo', () => {
    render(
      <LayoutRuleTable
        rows={[]}
        onChange={() => {}}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={mockLayoutPort()}
        assetPort={undefined}
        attrSuggestions={[]}
      />,
    );

    expect(screen.getByText('Mặc định (áp dụng khi không quy tắc nào khớp)')).toBeTruthy();
    expect(screen.queryByLabelText('Kéo để đổi thứ tự')).toBeNull();
  });

  it('hàng đã có layoutId → hiện thumbnail+tên layout đã chọn thay vì nút "Chọn layout" (bug UX thật, 2026-07-20)', async () => {
    const row: LayoutRuleRow = {
      id: 'a',
      label: 'Rule a',
      ref: { layoutId: 'layout-a', layoutVersion: 3, selector: { groups: [{ rules: [] }], priority: 1 }, fieldMap: {} },
    };
    const layoutPort = mockLayoutPort({
      getDocument: vi.fn().mockResolvedValue({ id: 'layout-a', name: 'Layout A', currentDraft: SAMPLE_CONTENT, publishedVersions: [], createdAt: '', updatedAt: '' } satisfies LayoutDocument),
      getVersion: vi.fn().mockResolvedValue({ version: 3, content: SAMPLE_CONTENT, publishedAt: '2026-07-19T00:00:00.000Z' } satisfies LayoutVersion),
    });
    render(
      <LayoutRuleTable
        rows={[row]}
        onChange={() => {}}
        defaultRef={undefined}
        onChangeDefaultRef={() => {}}
        layoutPort={layoutPort}
        assetPort={undefined}
        attrSuggestions={[]}
      />,
    );

    await waitFor(() => expect(screen.getByText('Layout A')).toBeTruthy());
    // Không còn nút text "Chọn layout" cho hàng đã có layoutId — chỉ còn nút cho dòng Mặc định
    // (chưa chọn gì) nếu có, ở đây defaultRef=undefined nên nút "Chọn layout" vẫn còn 1 lần.
    expect(screen.getAllByText('Chọn layout')).toHaveLength(1);
  });
});

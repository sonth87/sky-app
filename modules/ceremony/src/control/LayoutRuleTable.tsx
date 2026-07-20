// LayoutRuleTable — Giai đoạn 4b kế hoạch Event (wizard Bước 3: bảng quy tắc kéo-thả). Mỗi hàng
// = 1 EventLayoutRef + tên hiển thị cục bộ (label, KHÔNG thuộc type EventLayoutRef — chỉ để UI
// dễ nhận diện quy tắc, không lưu vào Event). Kéo-thả đổi thứ tự → priority cập nhật theo vị trí
// (hàng đầu = priority cao nhất) để khớp resolveLayout's sort giảm dần. Dòng "Mặc định" render
// CỐ ĐỊNH cuối bảng, KHÔNG nằm trong SortableContext — không kéo/xoá được.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EventLayoutRef, LayoutSelector } from '@sky-app/slide-shared';
import type { AssetPort, DataSourcePort, LayoutPort } from '@sky-app/service-contracts';
import { Button } from './components/ui/Button.js';
import { RuleBuilder } from './RuleBuilder.js';
import { LayoutPickerModal } from './LayoutPickerModal.js';

export interface LayoutRuleRow {
  id: string;
  label: string;
  ref: EventLayoutRef;
}

interface LayoutRuleTableProps {
  rows: LayoutRuleRow[];
  onChange: (rows: LayoutRuleRow[]) => void;
  defaultRef: EventLayoutRef | undefined;
  onChangeDefaultRef: (ref: EventLayoutRef | undefined) => void;
  layoutPort: LayoutPort;
  assetPort: AssetPort | undefined;
  attrSuggestions: string[];
}

function newRow(): LayoutRuleRow {
  return {
    id: `rule_${Math.random().toString(36).slice(2)}`,
    label: '',
    ref: { layoutId: '', layoutVersion: 0, selector: { groups: [{ rules: [{ attr: '', op: 'equals', val: '' }] }], priority: 0 }, fieldMap: {} },
  };
}

export function LayoutRuleTable({ rows, onChange, defaultRef, onChangeDefaultRef, layoutPort, assetPort, attrSuggestions }: LayoutRuleTableProps) {
  const { t } = useTranslation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const applyPriorities = (next: LayoutRuleRow[]): LayoutRuleRow[] =>
    next.map((row, index) => ({
      ...row,
      ref: { ...row.ref, selector: { ...(row.ref.selector as LayoutSelector), priority: next.length - index } },
    }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(applyPriorities(arrayMove(rows, oldIndex, newIndex)));
  };

  const addRow = () => {
    onChange(applyPriorities([...rows, newRow()]));
  };

  const removeRow = (id: string) => {
    onChange(applyPriorities(rows.filter((r) => r.id !== id)));
  };

  const updateRow = (id: string, patch: Partial<LayoutRuleRow>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="flex flex-col gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <RuleRow
                key={row.id}
                row={row}
                onUpdate={(patch) => updateRow(row.id, patch)}
                onRemove={() => removeRow(row.id)}
                layoutPort={layoutPort}
                assetPort={assetPort}
                attrSuggestions={attrSuggestions}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button variant="secondary-outline" size="sm" icon={<Plus size={13} />} onClick={addRow}>
        {t('layoutRuleTable.addRule')}
      </Button>

      <DefaultRuleRow defaultRef={defaultRef} onChange={onChangeDefaultRef} layoutPort={layoutPort} assetPort={assetPort} />
    </div>
  );
}

interface RuleRowProps {
  row: LayoutRuleRow;
  onUpdate: (patch: Partial<LayoutRuleRow>) => void;
  onRemove: () => void;
  layoutPort: LayoutPort;
  assetPort: AssetPort | undefined;
  attrSuggestions: string[];
}

function RuleRow({ row, onUpdate, onRemove, layoutPort, assetPort, attrSuggestions }: RuleRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <button type="button" className="cursor-grab touch-none text-muted-foreground" aria-label={t('layoutRuleTable.dragHandle') as string} {...attributes} {...listeners}>
          <GripVertical size={15} />
        </button>
        <input
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={row.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={t('layoutRuleTable.labelPlaceholder') as string}
        />
        <LayoutPickerButton
          layoutId={row.ref.layoutId}
          layoutVersion={row.ref.layoutVersion}
          layoutPort={layoutPort}
          assetPort={assetPort}
          onPick={(ref) => onUpdate({ ref: { ...row.ref, ...ref } })}
        />
        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={onRemove} aria-label={t('layoutRuleTable.removeRule') as string}>
          <Trash2 size={15} />
        </button>
      </div>
      <RuleBuilder
        selector={row.ref.selector ?? { groups: [], priority: 0 }}
        onChange={(selector) => onUpdate({ ref: { ...row.ref, selector } })}
        attrSuggestions={attrSuggestions}
      />
    </div>
  );
}

function DefaultRuleRow({
  defaultRef,
  onChange,
  layoutPort,
  assetPort,
}: {
  defaultRef: EventLayoutRef | undefined;
  onChange: (ref: EventLayoutRef | undefined) => void;
  layoutPort: LayoutPort;
  assetPort: AssetPort | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <span className="flex-1 text-sm font-medium text-foreground">{t('layoutRuleTable.defaultLabel')}</span>
      <LayoutPickerButton
        layoutId={defaultRef?.layoutId ?? ''}
        layoutVersion={defaultRef?.layoutVersion ?? 0}
        layoutPort={layoutPort}
        assetPort={assetPort}
        onPick={(ref) => onChange({ layoutId: ref.layoutId, layoutVersion: ref.layoutVersion, selector: undefined, fieldMap: {} })}
      />
    </div>
  );
}

function LayoutPickerButton({
  layoutId,
  layoutVersion,
  layoutPort,
  assetPort,
  onPick,
}: {
  layoutId: string;
  layoutVersion: number;
  layoutPort: LayoutPort;
  assetPort: AssetPort | undefined;
  onPick: (ref: { layoutId: string; layoutVersion: number }) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary-outline" size="sm" onClick={() => setOpen(true)}>
        {layoutId ? t('layoutRuleTable.changeLayoutButton') : t('layoutRuleTable.chooseLayoutButton')}
      </Button>
      <LayoutPickerModal
        open={open}
        onClose={() => setOpen(false)}
        layoutPort={layoutPort}
        assetPort={assetPort}
        onPick={(ref) => {
          onPick(ref);
          setOpen(false);
        }}
      />
    </>
  );
}

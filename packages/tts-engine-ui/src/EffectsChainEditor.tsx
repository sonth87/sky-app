import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Plus, Power, Trash2 } from 'lucide-react';
import type { EffectConfig, EffectTypeInfo } from '@sky-app/service-contracts';

/** 1 effect trong chain đang sửa, kèm `localId` ổn định cho dnd-kit — `EffectConfig` (kiểu
 * gửi API) không có field id vì 1 preset có thể chứa 2 effect CÙNG type (vd 2 lần lowpass
 * bậc khác nhau), không dùng `type` làm key được. `localId` chỉ sống trong UI, luôn bị lược
 * bỏ trước khi gửi lên `EffectPresetPort`/`ttsPort` — xem `toEffectsChain()`. */
export interface WorkingEffect extends EffectConfig {
  localId: string;
}

export function toEffectsChain(chain: WorkingEffect[]): EffectConfig[] {
  return chain.map(({ localId: _localId, ...rest }) => rest);
}

let _localIdCounter = 0;
export function newLocalId(): string {
  _localIdCounter += 1;
  return `fx-${_localIdCounter}`;
}

export function fromEffectsChain(chain: EffectConfig[]): WorkingEffect[] {
  return chain.map((e) => ({ ...e, localId: newLocalId() }));
}

interface EffectCardProps {
  effect: WorkingEffect;
  info: EffectTypeInfo | undefined;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onParamChange: (name: string, value: number) => void;
}

function EffectCard({ effect, info, onToggle, onRemove, onParamChange }: EffectCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: effect.localId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-2 rounded-xl border p-2.5 transition-colors ${effect.enabled ? 'border-border bg-card' : 'border-border/60 bg-muted/20'}`}
    >
      {/* Thứ tự cụm trái: chevron gập/mở RỒI MỚI tới tay cầm kéo — khớp đúng bố cục voicebox
          (chevron đứng trước dấu `::::`), khác bản trước đảo ngược 2 cụm này. */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          title="Kéo để đổi thứ tự"
        >
          <GripVertical size={14} />
        </button>
        <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${effect.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
          {info?.label ?? effect.type}
        </span>
        <button
          type="button"
          onClick={() => onToggle(!effect.enabled)}
          title={effect.enabled ? 'Tắt hiệu ứng này' : 'Bật hiệu ứng này'}
          className={`shrink-0 rounded-full p-1.5 transition-colors ${effect.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
        >
          <Power size={13} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Xoá hiệu ứng này"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Mỗi tham số: dòng nhãn+giá trị, RỒI slider full-width NGAY BÊN DƯỚI (không nằm
          chung 1 hàng với nhãn) — khớp đúng bố cục voicebox's EffectsChainEditor. */}
      {expanded && info && effect.enabled && (
        <div className="flex flex-col gap-3 border-t border-border/70 pl-7 pt-2.5">
          {Object.entries(info.params).map(([name, def]) => {
            const value = effect.params?.[name] ?? def.default;
            return (
              <div key={name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`${effect.localId}-${name}`} className="truncate text-2xs text-muted-foreground" title={def.description}>
                    {def.description}
                  </label>
                  <span className="shrink-0 text-2xs font-semibold tabular-nums text-foreground">{value}</span>
                </div>
                <input
                  id={`${effect.localId}-${name}`}
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={value}
                  onChange={(e) => onParamChange(name, Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface EffectsChainEditorProps {
  chain: WorkingEffect[];
  onChange: (chain: WorkingEffect[]) => void;
  /** Bảng loại hiệu ứng khả dụng — nguồn cho dropdown "Thêm hiệu ứng" + định nghĩa tham số
   *  của từng effect trong chain (min/max/step/description, không hard-code phía UI). */
  types: Record<string, EffectTypeInfo>;
}

/** Chain editor kéo-thả — thêm/xoá/bật-tắt/sắp xếp lại effect, mỗi effect gập/mở xem slider
 *  tham số. Cổng vào chính của tab Effects; cũng dùng lại được ở nơi khác cần sửa 1 chuỗi
 *  effect (vd sau này thêm "hiệu ứng riêng cho voice" thì không cần viết lại). */
export function EffectsChainEditor({ chain, onChange, types }: EffectsChainEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addEffect = (type: string) => {
    const info = types[type];
    if (!info) return;
    const params: Record<string, number> = {};
    for (const [name, def] of Object.entries(info.params)) params[name] = def.default;
    onChange([...chain, { localId: newLocalId(), type, enabled: true, params }]);
  };

  const removeAt = (localId: string) => onChange(chain.filter((e) => e.localId !== localId));

  const toggleAt = (localId: string, enabled: boolean) =>
    onChange(chain.map((e) => (e.localId === localId ? { ...e, enabled } : e)));

  const setParamAt = (localId: string, name: string, value: number) =>
    onChange(chain.map((e) => (e.localId === localId ? { ...e, params: { ...e.params, [name]: value } } : e)));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = chain.findIndex((e) => e.localId === active.id);
    const newIndex = chain.findIndex((e) => e.localId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(chain, oldIndex, newIndex));
  };

  return (
    <div className="flex flex-col gap-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={chain.map((e) => e.localId)} strategy={verticalListSortingStrategy}>
          {chain.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-2xs text-muted-foreground">
              Chưa có hiệu ứng nào — thêm ở dưới.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {chain.map((effect) => (
                <EffectCard
                  key={effect.localId}
                  effect={effect}
                  info={types[effect.type]}
                  onToggle={(enabled) => toggleAt(effect.localId, enabled)}
                  onRemove={() => removeAt(effect.localId)}
                  onParamChange={(name, value) => setParamAt(effect.localId, name, value)}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </DndContext>

      {/* `<option>` chỉ nhận text thuần (không render được icon React bên trong) — icon đặt
          NGOÀI select, không phải trong option đầu tiên. */}
      <div className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 hover:border-primary/40">
        <Plus size={13} className="shrink-0 text-muted-foreground" />
        <select
          value=""
          onChange={(e) => { if (e.target.value) addEffect(e.target.value); e.target.value = ''; }}
          className="w-full min-w-0 flex-1 appearance-none bg-transparent text-xs text-muted-foreground outline-none"
        >
          <option value="" disabled>Thêm hiệu ứng…</option>
          {Object.values(types).map((info) => (
            <option key={info.type} value={info.type}>{info.label}</option>
          ))}
        </select>
        <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

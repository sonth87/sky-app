import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { LayoutComponentPort, LayoutComponentMeta } from '@sky-app/service-contracts';
import type { SpawnKind } from './useSpawnDrag.js';

export interface PersonalTemplatesPanelProps {
  layoutComponentPort?: LayoutComponentPort;
  onSpawnDown: (spawnKind: SpawnKind) => (e: React.MouseEvent) => void;
}

export function PersonalTemplatesPanel({ layoutComponentPort, onSpawnDown }: PersonalTemplatesPanelProps) {
  const [templates, setTemplates] = useState<LayoutComponentMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!layoutComponentPort) {
      setLoading(false);
      return;
    }
    layoutComponentPort.list().then(setTemplates).finally(() => setLoading(false));
  }, [layoutComponentPort]);

  const handleDelete = async (id: string) => {
    if (!layoutComponentPort) return;
    await layoutComponentPort.delete(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  if (!layoutComponentPort) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto flex flex-col flex-1">
        <div className="text-[11px] text-[#9a9bab] text-center py-6 px-2 bg-[#fcfcfd] rounded-lg border border-dashed border-[#cfd0da]">
          Chưa khả dụng
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto flex flex-col flex-1">
        <div className="text-[11px] text-[#9a9bab] text-center py-6">Đang tải...</div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto flex flex-col flex-1">
        <div className="text-[11px] text-[#9a9bab] text-center py-6 px-2 bg-[#fcfcfd] rounded-lg border border-dashed border-[#cfd0da]">
          Chưa có mẫu — tạo từ lựa chọn nhiều item trên canvas
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto flex flex-col flex-1">
      <div className="shrink-0 grid grid-cols-2 gap-3">
        {templates.map((template) => (
          <div key={template.id} className="relative group">
            <button
              onMouseDown={onSpawnDown({
                kind: 'preset',
                items: template.items,
                label: template.name,
              })}
              title={template.name}
              className="w-full flex flex-col items-center justify-center p-2 rounded-lg bg-[#fcfcfd] border border-[#e6e6ee] hover:bg-[#f4f5f9] cursor-grab transition-colors text-[11px] font-semibold text-[#5c5d6e] min-h-[90px]"
            >
              {/* Mini preview: simplified grid representation */}
              <div className="mb-2 w-full px-1">
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-16 border border-[#d4d4dd] rounded"
                  style={{ background: '#f9f9fc' }}
                >
                  {template.items.map((item, idx) => {
                    const scale = 100 / 400;
                    const x = (item.box.x ?? 0) * scale;
                    const y = (item.box.y ?? 0) * scale;
                    const w = (item.box.w ?? 100) * scale;
                    const h = (item.box.h ?? 100) * scale;
                    const colors = ['#e8ecf9', '#d4daef', '#c0cfe5', '#acb8db', '#98a1d1'];
                    return (
                      <rect
                        key={idx}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={colors[idx % colors.length]}
                        stroke="#9a9bab"
                        strokeWidth="0.5"
                      />
                    );
                  })}
                </svg>
              </div>
              <span className="text-center text-[10px] line-clamp-2">{template.name}</span>
            </button>

            {/* Delete button — appear on hover */}
            <button
              onClick={() => handleDelete(template.id)}
              className="absolute top-1 left-1 p-1.5 rounded-md bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              title="Xoá mẫu"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Rail — 6 icon nhóm bên trái, theo prototype "Backdrop Editor 2a - keo tha.dc.html" §RAIL.

import { PanelLeftClose } from 'lucide-react';

export type RailGroup = 'comp' | 'tpl' | 'coll' | 'var' | 'img' | 'layers';

const GROUPS: { key: RailGroup; icon: string; label: string }[] = [
  { key: 'comp', icon: '▦', label: 'Thành phần' },
  { key: 'tpl', icon: '▤', label: 'Mẫu' },
  { key: 'coll', icon: '❖', label: 'Bộ sưu tập' },
  { key: 'var', icon: '{ }', label: 'Biến' },
  { key: 'img', icon: '▧', label: 'Ảnh' },
  { key: 'layers', icon: '≣', label: 'Lớp' },
];

export interface RailProps {
  active: RailGroup;
  onChange: (group: RailGroup) => void;
  /** Bỏ trống = ẩn nút toggle (VD dùng Rail ở nơi khác không cần ẩn/hiện). Review 2026-07-18:
   * "palette trái cũng có nút để toggle". */
  onToggleVisible?: () => void;
}

export function Rail({ active, onChange, onToggleVisible }: RailProps) {
  return (
    <div style={{ width: 78, flex: 'none', borderRight: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', padding: '9px 0' }}>
      {onToggleVisible && (
        <button
          onClick={onToggleVisible}
          aria-label="Ẩn palette"
          style={{
            alignSelf: 'center',
            marginBottom: 6,
            width: 26,
            height: 26,
            borderRadius: 7,
            border: '1px solid #e6e6ee',
            background: 'transparent',
            color: '#9a9bab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <PanelLeftClose size={13} />
        </button>
      )}
      {GROUPS.map((g) => {
        const on = g.key === active;
        return (
          <div
            key={g.key}
            onClick={() => onChange(g.key)}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '9px 0',
              color: on ? 'var(--accent-color, #4b57e6)' : '#9a9bab',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 9.5,
              textAlign: 'center',
              borderLeft: on ? '3px solid var(--accent-color, #4b57e6)' : '3px solid transparent',
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: g.icon === '{ }' ? 13 : 17,
                fontFamily: g.icon === '{ }' ? "'JetBrains Mono', monospace" : 'inherit',
                fontWeight: g.icon === '{ }' ? 700 : 400,
                background: on ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 10%, transparent)' : 'transparent',
              }}
            >
              {g.icon}
            </span>
            {g.label}
          </div>
        );
      })}
    </div>
  );
}

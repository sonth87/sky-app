// Versioning UI — nút Publish + danh sách version + khôi phục, theo docs/roadmap/plans/
// layout-designer/21-layout-versioning.md §2/§4. Undo/redo (history.ts) ≠ version (đây) — undo
// chỉ lùi thao tác TRONG draft hiện tại, KHÔNG "lùi version" (§5 file 23). Panel này thao tác
// version (mốc đã publish, bất biến), tách biệt hoàn toàn khỏi History panel của editor-core.

import { useState } from 'react';
import type { LayoutVersion } from '@sky-app/slide-shared';

export interface VersioningPanelProps {
  latestPublishedVersion: number | null;
  versions: LayoutVersion[];
  onPublish: (note?: string) => void;
  onRestore: (version: number) => void;
  isPublishing?: boolean;
}

export function VersioningPanel({ latestPublishedVersion, versions, onPublish, onRestore, isPublishing }: VersioningPanelProps) {
  const [open, setOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  function handlePublish() {
    onPublish(noteInput.trim() || undefined);
    setNoteInput('');
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 34,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 15px',
          background: 'var(--accent-color, #4b57e6)',
          color: '#fff',
          border: 'none',
          borderRadius: 9,
          fontWeight: 700,
          fontSize: 12.5,
          cursor: 'pointer',
        }}
      >
        {latestPublishedVersion == null ? 'Chưa publish' : `v${latestPublishedVersion}`} ▾
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 6,
            width: 320,
            background: '#fff',
            border: '1px solid #e6e6ee',
            borderRadius: 11,
            boxShadow: '0 14px 34px rgba(20,20,40,.18)',
            zIndex: 50,
          }}
        >
          <div style={{ padding: 14, borderBottom: '1px solid #f0f0f5' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Publish bản draft hiện tại</div>
            <input
              type="text"
              placeholder="Ghi chú thay đổi (tuỳ chọn)"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 8, padding: '7px 9px', fontSize: 12, marginBottom: 8 }}
            />
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              style={{
                width: '100%',
                padding: '8px 0',
                background: isPublishing ? '#c9c9d3' : 'var(--accent-color, #4b57e6)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                cursor: isPublishing ? 'default' : 'pointer',
              }}
            >
              {isPublishing ? 'Đang publish…' : `Publish → v${(latestPublishedVersion ?? 0) + 1}`}
            </button>
          </div>

          <div style={{ padding: '10px 14px', maxHeight: 260, overflowY: 'auto' }}>
            <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9a9bab', marginBottom: 6 }}>
              Lịch sử version
            </div>
            {versions.length === 0 ? (
              <div style={{ fontSize: 11.5, color: '#c9c9d3' }}>Chưa publish lần nào.</div>
            ) : (
              [...versions].reverse().map((v) => (
                <div key={v.version} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #f7f7fa' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 11.5, color: 'var(--accent-color, #4b57e6)' }}>v{v.version}</span>
                  <span style={{ flex: 1, fontSize: 11, color: '#5c5d6e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.note || new Date(v.publishedAt).toLocaleString('vi-VN')}
                  </span>
                  <button
                    onClick={() => onRestore(v.version)}
                    style={{ fontSize: 10.5, color: 'var(--accent-color, #4b57e6)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Khôi phục
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

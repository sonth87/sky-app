// CopyVariantPopover — mở khi bấm icon "Copy" trên 1 tab (VariantTabs.tsx), cho phép copy nội
// dung từ 1 variant khác trong CÙNG layout theo 3 chế độ (12-thu-vien-layout.md mở rộng
// 2026-07-18 — auto-sync liên kết cha-con, xem Giai đoạn 2.6 trong plan gốc):
//   (a) Ghi đè toàn bộ — thay hết items của variant ĐÍCH bằng bản copy từ NGUỒN.
//   (b) Chỉ thêm cái thiếu — thêm item nguồn CHƯA có ở đích (so theo syncKey/syncRef).
//   (c) Cập nhật nội dung cái đã có — patch item đích đã khớp key, giữ nguyên vị trí/field đã khoá.
// Chế độ (a) cần XÁC NHẬN 2 LỚP: lớp 1 luôn hỏi (hành động phá huỷ), lớp 2 CHỈ hỏi khi variant
// đích có item đang khoá (syncLocked) — cho chọn "ghi đè cả khoá" hay "chỉ ghi đè cái chưa khoá".

import { useState } from 'react';
import type { LayoutVariant } from '@sky-app/slide-shared';
import type { OverwriteAllLockStrategy } from '@sky-app/layout-editor-core';

export type CopyVariantMode = 'overwrite-all' | 'add-missing' | 'overwrite-existing';

const MODE_OPTIONS: { mode: CopyVariantMode; label: string; description: string }[] = [
  { mode: 'overwrite-all', label: 'Ghi đè toàn bộ', description: 'Thay hết nội dung hiện tại bằng bản copy từ nguồn (cần kéo lại vị trí cho phù hợp).' },
  { mode: 'add-missing', label: 'Chỉ thêm cái chưa có', description: 'Chỉ thêm phần tử nguồn có mà đích chưa có, giữ nguyên mọi thứ đang có.' },
  { mode: 'overwrite-existing', label: 'Cập nhật nội dung cái đã có', description: 'Chỉ cập nhật nội dung/thuộc tính cho phần tử đã khớp, giữ nguyên vị trí.' },
];

export interface CopyVariantPopoverProps {
  /** MỌI variant trong layout hiện tại — component tự loại trừ `targetVariantId` khỏi danh sách nguồn. */
  variants: LayoutVariant[];
  targetVariantId: string;
  onClose: () => void;
  onConfirm: (sourceVariantId: string, mode: CopyVariantMode, lockStrategy?: OverwriteAllLockStrategy) => void;
}

function formatAspectLabel(aspect: LayoutVariant['aspect']): string {
  return aspect.label ?? `${aspect.w}:${aspect.h}`;
}

export function CopyVariantPopover({ variants, targetVariantId, onClose, onConfirm }: CopyVariantPopoverProps) {
  const sources = variants.filter((v) => v.aspect.id !== targetVariantId);
  const target = variants.find((v) => v.aspect.id === targetVariantId);
  const targetHasLocked = target?.items.some((i) => i.syncLocked) ?? false;

  const [sourceId, setSourceId] = useState<string>(sources[0]?.aspect.id ?? '');
  const [mode, setMode] = useState<CopyVariantMode>('add-missing');
  // Luồng xác nhận 2 lớp CHỈ cho chế độ (a): 'idle' → bấm Copy → 'confirm1' (luôn hỏi) → bấm
  // tiếp → nếu targetHasLocked thì 'confirm2' (hỏi chiến lược khoá), ngược lại thực thi luôn.
  const [confirmStep, setConfirmStep] = useState<'idle' | 'confirm1' | 'confirm2'>('idle');

  function handleCopyClick() {
    if (!sourceId) return;
    if (mode !== 'overwrite-all') {
      onConfirm(sourceId, mode);
      return;
    }
    setConfirmStep('confirm1');
  }

  function handleConfirm1() {
    if (targetHasLocked) {
      setConfirmStep('confirm2');
    } else {
      onConfirm(sourceId, 'overwrite-all', 'skip-locked'); // không có item khoá, giá trị này không ảnh hưởng
    }
  }

  function handleConfirm2(lockStrategy: OverwriteAllLockStrategy) {
    onConfirm(sourceId, 'overwrite-all', lockStrategy);
  }

  return (
    <>
      {/* Backdrop — click ra ngoài để đóng, KHÔNG dùng position:fixed (containing-block bug đã
         gặp ở Flyout.tsx ghost label — root app device-layout giữ transform inline thường trực).
         stopPropagation() BẮT BUỘC — backdrop nằm bên trong div tab (VariantTabs.tsx), div tab
         CŨNG có onClick riêng (mở lại popover) — không chặn bubble thì click ra ngoài sẽ đóng rồi
         MỞ LẠI NGAY do event nổi lên onClick của tab cha (bug thật, báo 2026-07-18). */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ position: 'absolute', inset: '-1000px', zIndex: 9 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 6,
          width: 300,
          background: '#fff',
          border: '1px solid #e6e6ee',
          borderRadius: 11,
          boxShadow: '0 14px 34px rgba(20,20,40,.18)',
          zIndex: 10,
          overflow: 'hidden',
        }}
      >
        {confirmStep === 'idle' && (
          <div style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#5c5d6e', marginBottom: 8 }}>Copy từ tỷ lệ khác</div>

            {sources.length === 0 ? (
              <div style={{ fontSize: 11.5, color: '#9a9bab' }}>Chưa có tỷ lệ nào khác để copy.</div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 10.5, color: '#9a9bab', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Nguồn</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 12, marginBottom: 10 }}
                >
                  {sources.map((v) => (
                    <option key={v.aspect.id} value={v.aspect.id}>
                      {formatAspectLabel(v.aspect)}
                    </option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: 10.5, color: '#9a9bab', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Cách copy</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {MODE_OPTIONS.map((opt) => (
                    <label
                      key={opt.mode}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        padding: 8,
                        borderRadius: 8,
                        border: `1px solid ${mode === opt.mode ? 'var(--accent-color, #4b57e6)' : '#e6e6ee'}`,
                        background: mode === opt.mode ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 8%, transparent)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <input type="radio" name="copy-mode" checked={mode === opt.mode} onChange={() => setMode(opt.mode)} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{opt.label}</div>
                        <div style={{ fontSize: 10.5, color: '#9a9bab', marginTop: 2 }}>{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleCopyClick}
                  style={{ width: '100%', padding: '8px 0', background: 'var(--accent-color, #4b57e6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Copy
                </button>
              </>
            )}
          </div>
        )}

        {confirmStep === 'confirm1' && (
          <div style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Ghi đè toàn bộ tỷ lệ này?</div>
            <div style={{ fontSize: 11.5, color: '#5c5d6e', marginBottom: 14 }}>
              Toàn bộ nội dung hiện tại của tỷ lệ này sẽ bị thay thế bằng bản copy từ nguồn. Hành động này có thể hoàn tác bằng Ctrl/Cmd+Z.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmStep('idle')} style={{ flex: 1, padding: '8px 0', background: '#f4f5f9', color: '#5c5d6e', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Huỷ
              </button>
              <button onClick={handleConfirm1} style={{ flex: 1, padding: '8px 0', background: '#e05656', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Ghi đè
              </button>
            </div>
          </div>
        )}

        {confirmStep === 'confirm2' && (
          <div style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Có phần tử đang khoá</div>
            <div style={{ fontSize: 11.5, color: '#5c5d6e', marginBottom: 14 }}>Tỷ lệ này có phần tử đã khoá (không nhận đồng bộ tự động). Bạn muốn xử lý thế nào?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => handleConfirm2('skip-locked')}
                style={{ padding: '8px 0', background: '#f4f5f9', color: '#26262e', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
              >
                Chỉ ghi đè phần tử CHƯA khoá
              </button>
              <button
                onClick={() => handleConfirm2('overwrite-locked')}
                style={{ padding: '8px 0', background: '#e05656', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Ghi đè cả phần tử đã khoá
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Breadcrumb nổi góc trên-trái báo hiệu đang ở chế độ sửa mẫu LoopItem (Bước 10) — nút "Xong"
 * thoát về variant.items bình thường. */
export function LoopEditBreadcrumb({ label, onDone }: { label: string; onDone: () => void }) {
  return (
    <div
      data-testid="loop-edit-breadcrumb"
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 8px 7px 14px',
        background: '#fff',
        border: '1px solid #e6e6ee',
        borderRadius: 9,
        boxShadow: '0 6px 20px -8px rgba(20,10,50,.35)',
        fontSize: 12,
        fontWeight: 600,
        color: '#5c5d6e',
        zIndex: 1001,
      }}
    >
      <span>Đang sửa mẫu của {label}</span>
      <button
        onClick={onDone}
        style={{
          padding: '5px 12px',
          background: 'var(--accent-color, #4b57e6)',
          color: '#fff',
          border: 'none',
          borderRadius: 7,
          fontWeight: 700,
          fontSize: 11.5,
          cursor: 'pointer',
        }}
      >
        Xong
      </button>
    </div>
  );
}

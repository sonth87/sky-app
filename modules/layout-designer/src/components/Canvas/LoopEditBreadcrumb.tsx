export function LoopEditBreadcrumb({ label, onDone }: { label: string; onDone: () => void }) {
  return (
    <div
      data-testid="loop-edit-breadcrumb"
      className="absolute top-4 left-4 flex items-center gap-[10px] p-[7px_8px_7px_14px] bg-white border border-[#e6e6ee] rounded-[9px] shadow-[0_6px_20px_-8px_rgba(20,10,50,0.35)] text-xs font-semibold text-[#5c5d6e] z-[1001]"
    >
      <span>Đang sửa mẫu của {label}</span>
      <button
        onClick={onDone}
        className="p-[5px_12px] bg-[#4b57e6] text-white border-none rounded-[7px] font-bold text-[11.5px] cursor-pointer hover:bg-[#3b47d6]"
      >
        Xong
      </button>
    </div>
  );
}

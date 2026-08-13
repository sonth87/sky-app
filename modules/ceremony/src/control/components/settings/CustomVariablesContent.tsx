import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { useSocketRef } from '../../SocketContext';
import { type CustomVariable } from '@sky-app/slide-shared';
import { CustomVariableEditor } from './CustomVariableEditor';

/** Nội dung quản lý biến câu đọc (@variable) — nhúng làm 1 tab trong SettingsModal. Wrapper mỏng
 * quanh CustomVariableEditor (UI/CRUD thuần, tách khỏi nguồn dữ liệu ở Giai đoạn 4c mở rộng,
 * 2026-07-20) — nối vào socket/useControlStore đúng hành vi cũ, KHÔNG đổi. */
export function CustomVariablesContent() {
  const { t } = useTranslation();
  const storeVariables = useControlStore((s) => s.customVariables || []) as CustomVariable[];
  const records = useControlStore((s) => s.records);
  const socket = useSocketRef();

  // Local state (optimistic) — UI phản hồi ngay, không chờ round-trip server.
  const [customVariables, setLocalVariables] = useState<CustomVariable[]>(storeVariables);

  // Đồng bộ từ store khi tab được mount (nạp giá trị mới nhất từ server/persist).
  useEffect(() => {
    setLocalVariables(storeVariables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewRecord = records[0] ?? null;

  // Cập nhật UI ngay + phát tới server để persist & đồng bộ client khác
  const save = (vars: CustomVariable[]) => {
    setLocalVariables(vars);
    socket.current?.emit('cmd:setCustomVariables', { variables: vars });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 bg-success/10 border border-success/30 rounded-full px-2.5 py-0.5 text-success self-start">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
        </span>
        <span className="text-[11px] font-semibold">{t('customVariables.autoSave')}</span>
      </div>
      <CustomVariableEditor variables={customVariables} onChange={save} previewRecord={previewRecord} records={records} attrSuggestions={[]} />
    </div>
  );
}

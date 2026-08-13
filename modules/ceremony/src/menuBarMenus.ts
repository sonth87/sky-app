// menuBarMenus — tách khỏi index.ts (2026-07-30) để tránh circular import: index.ts export lại
// ControlApp.js, nên ControlApp.tsx KHÔNG thể import ngược từ index.ts để lấy hàm build menu khi
// cần patch lại field 'checked' của mục "Dùng dữ liệu mẫu" theo state runtime (xem
// ControlApp.tsx's handleToggleSampleData — gọi device-layout's updateAppConfig(appId, {
// menuBarMenus: buildCeremonyMenuBarMenus(sampleDataEnabled) }) mỗi khi bật/tắt). File riêng này
// là nguồn DUY NHẤT cho cấu trúc menu, dùng chung cho cả khai báo tĩnh lúc registerApps() (index.ts)
// lẫn cập nhật runtime (ControlApp.tsx) — không lặp lại cấu trúc 2 nơi.

import type { AppMenuBarMenu } from '@sky-app/kernel';

export function buildCeremonyMenuBarMenus(sampleDataEnabled: boolean): AppMenuBarMenu[] {
  return [
    {
      label: 'Cài đặt',
      items: [
        { key: 'settings-general', label: 'Tổng quát…', action: 'settings:general' },
        { key: 'settings-tts', label: 'TTS…', action: 'settings:tts' },
        { key: 'settings-variable', label: 'Biến tùy chỉnh…', action: 'settings:variable' },
        { key: 'settings-layout', label: 'Layout…', action: 'settings:layout' },
        { key: 'settings-api', label: 'API…', action: 'settings:api' },
        { key: 'settings-backup', label: 'Import/Export Setting…', action: 'settings:backup' },
      ],
    },
    {
      label: 'Dữ liệu',
      items: [
        { key: 'data-import', label: 'Import', action: 'data:import' },
        { key: 'data-export', label: 'Export', action: 'data:export' },
        { key: 'sep1', label: '', separator: true },
        { key: 'data-reset', label: 'Đặt lại', children: [
          { key: 'data-reset-qr', label: 'Danh sách quét QR', action: 'data:reset:qr' },
          { key: 'data-reset-students', label: 'Danh sách sinh viên', action: 'data:reset:students' },
          { key: 'data-reset-cache', label: 'Cache', action: 'data:reset:cache' },
        ]},
      ],
    },
    {
      label: 'Develop',
      items: [
        // checked (2026-07-30, device-layout ≥0.6.0) — bật/tắt qua menu Develop, phản hồi thật:
        // "khi dữ liệu mẫu được bật thì trên menu có nút checked để user biết là đã bật". KHÔNG
        // xoá Event/DataSource mẫu khi tắt (kiểm tra kỹ: EventPort/DataSourcePort chưa có delete()
        // nào, không có sẵn ở ceremony-db/Electron IPC/data-service web) — tắt chỉ ẩn khỏi UI (xem
        // eventStore.ts's sampleDataEnabled), dữ liệu vẫn còn trong DB để bật lại xem ngay, không
        // phải tạo lại từ đầu.
        { key: 'develop-sample-data', label: 'Dùng dữ liệu mẫu', action: 'develop:sampleData', checked: sampleDataEnabled },
        { key: 'develop-api-test', label: 'Giao diện thử nghiệm API', action: 'develop:apiTest' },
      ],
    },
    {
      label: 'Trợ giúp',
      items: [
        { key: 'about', label: 'Về ứng dụng', action: 'about' },
      ],
    },
  ];
}

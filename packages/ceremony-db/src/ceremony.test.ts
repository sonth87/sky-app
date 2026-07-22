import { describe, it, expect, beforeEach } from 'vitest';
import type { AppConfig, Ceremony } from '@sky-app/slide-shared';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { MIGRATIONS } from './migrations/index.js';
import { getCeremonyWithConfig, saveCeremonyWithConfig } from './queries/ceremony.js';

function sampleCeremony(): Ceremony {
  return {
    id: 1,
    name: 'Lễ Trao Bằng Tốt Nghiệp',
    graduation_year: '2025-2026',
    date: '2026-07-16',
    venue: 'Hội trường A',
    university_name: 'TRƯỜNG ĐẠI HỌC ĐẠI NAM',
    ministry_name: 'BỘ GIÁO DỤC VÀ ĐÀO TẠO',
    title_line1: 'LỄ TRAO BẰNG',
    title_line2: 'TỐT NGHIỆP',
    logo: 'logo.png',
    backdrops_config: 'assets/2026/backdrops_layouts.json',
    idle_image: 'assets/2026/idle.jpg',
    idle_image_variants: { '16:9': 'idle_16_9.jpg' },
  };
}

function sampleConfig(): AppConfig {
  return {
    ws_port: 8081,
    http_port: 8080,
    mode: 'auto',
    delay_seconds: 2,
    auto_open_browser: true,
    kiosk_mode: true,
    auto_load_first: true,
    slide_display_seconds: 20,
    layout_overrides: { a: { image: 'foo.png' } },
  };
}

describe('ceremony-db round-trip (ceremony+config, giai đoạn bỏ Student)', () => {
  let executor: BetterSqlite3Executor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  it('ghi và đọc lại ceremony+config đúng nguyên trạng, bao gồm field nested JSON', () => {
    saveCeremonyWithConfig(executor, {
      roomId: 'default',
      roomName: 'Phòng chính',
      ceremony: sampleCeremony(),
      config: sampleConfig(),
      syncedAt: '2026-07-16T00:00:00Z',
      bundleVersion: '1',
    });

    const loaded = getCeremonyWithConfig(executor, 'default');
    expect(loaded).not.toBeNull();
    expect(loaded!.ceremony.name).toBe('Lễ Trao Bằng Tốt Nghiệp');
    expect(loaded!.ceremony.idle_image_variants).toEqual({ '16:9': 'idle_16_9.jpg' });
    expect(loaded!.config.layout_overrides).toEqual({ a: { image: 'foo.png' } });
  });

  it('saveCeremonyWithConfig gọi lại lần 2 (update) không tạo ceremony trùng', () => {
    saveCeremonyWithConfig(executor, {
      roomId: 'default',
      roomName: 'Phòng chính',
      ceremony: sampleCeremony(),
      config: sampleConfig(),
    });
    saveCeremonyWithConfig(executor, {
      roomId: 'default',
      roomName: 'Phòng chính',
      ceremony: { ...sampleCeremony(), name: 'Đổi tên' },
      config: sampleConfig(),
    });

    const rows = executor.query('SELECT * FROM ceremony');
    expect(rows).toHaveLength(1);
    const loaded = getCeremonyWithConfig(executor, 'default');
    expect(loaded!.ceremony.name).toBe('Đổi tên');
  });

  it('getCeremonyWithConfig không truyền roomId đọc được ceremony đã lưu với room_id bất kỳ (bug restart Electron)', () => {
    saveCeremonyWithConfig(executor, {
      roomId: 'H1', // seed thật của Electron dùng room nghiệp vụ, không phải 'default'
      roomName: 'Hội trường 1',
      ceremony: sampleCeremony(),
      config: sampleConfig(),
    });

    // Đường restart: loadFromDisk đọc không lọc room — phải thấy dữ liệu
    const loaded = getCeremonyWithConfig(executor);
    expect(loaded).not.toBeNull();
    expect(loaded!.ceremony.name).toBe('Lễ Trao Bằng Tốt Nghiệp');

    // Đọc đích danh room sai vẫn phải trả null (hành vi lọc giữ nguyên khi có tham số)
    expect(getCeremonyWithConfig(executor, 'default')).toBeNull();
  });

  it('runMigrations gọi lại nhiều lần là no-op an toàn', () => {
    runMigrations(executor);
    runMigrations(executor);
    const versions = executor.query('SELECT version FROM schema_version');
    // Không hardcode "1" — số dòng schema_version phải khớp đúng số migration đã đăng ký
    // (MIGRATIONS.length), không phụ thuộc migration nào được thêm sau này.
    expect(versions).toHaveLength(MIGRATIONS.length);
  });
});

import { describe, it, expect } from 'vitest';
import { SqlJsExecutor } from './drivers/sql-js-executor.js';
import { runMigrations } from './migrate.js';

describe('SqlJsExecutor (WASM driver dùng cho SqliteWasmAdapter)', () => {
  it('chạy migration và CRUD cơ bản giống BetterSqlite3Executor', async () => {
    const executor = await SqlJsExecutor.create();
    runMigrations(executor);

    executor.run('INSERT INTO ceremony (room_id, room_name, name, graduation_year, date, venue, university_name, ministry_name, title_line1, title_line2, logo, backdrops_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      'default', 'Phòng A', 'Test Ceremony', '2026', '2026-07-16', 'V', 'U', 'M', 'T1', 'T2', 'l.png', 'c.json',
    ]);

    const rows = executor.query<{ name: string }>('SELECT name FROM ceremony WHERE room_id = ?', ['default']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Test Ceremony');
  });

  it('transaction rollback đúng khi throw', async () => {
    const executor = await SqlJsExecutor.create();
    runMigrations(executor);

    expect(() =>
      executor.transaction(() => {
        executor.run('INSERT INTO ceremony (room_id, room_name, name, graduation_year, date, venue, university_name, ministry_name, title_line1, title_line2, logo, backdrops_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          'default', 'X', 'Y', '2026', '2026-07-16', 'V', 'U', 'M', 'T1', 'T2', 'l.png', 'c.json',
        ]);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    const rows = executor.query('SELECT * FROM ceremony');
    expect(rows).toHaveLength(0);
  });

  it('export()/create(bytes) round-trip đúng (mô phỏng IndexedDB persist)', async () => {
    const executor = await SqlJsExecutor.create();
    runMigrations(executor);
    executor.run('INSERT INTO ceremony (room_id, room_name, name, graduation_year, date, venue, university_name, ministry_name, title_line1, title_line2, logo, backdrops_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      'default', 'X', 'Persisted', '2026', '2026-07-16', 'V', 'U', 'M', 'T1', 'T2', 'l.png', 'c.json',
    ]);
    const bytes = executor.export();

    const restored = await SqlJsExecutor.create(bytes);
    const rows = restored.query<{ name: string }>('SELECT name FROM ceremony');
    expect(rows[0]!.name).toBe('Persisted');
  });
});

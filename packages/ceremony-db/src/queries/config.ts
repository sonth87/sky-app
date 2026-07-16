import type { SqlExecutor } from '../sql-executor.js';
import type { AppConfig } from '@sky-app/slide-shared';

interface AppConfigRow {
  ceremony_id: number;
  ws_port: number;
  http_port: number;
  mode: string;
  delay_seconds: number;
  auto_open_browser: number;
  kiosk_mode: number;
  auto_load_first: number;
  slide_display_seconds: number;
  idle_timeout_enabled: number | null;
  idle_timeout_seconds: number | null;
  tts_model: string | null;
  tts_speed: number | null;
  tts_sentence_prefix: string | null;
  tts_conditions: string | null;
  tts_voice_pool: string | null;
  layout_overrides: string | null;
}

export function rowToAppConfig(row: AppConfigRow): AppConfig {
  return {
    ws_port: row.ws_port,
    http_port: row.http_port,
    mode: row.mode as AppConfig['mode'],
    delay_seconds: row.delay_seconds,
    auto_open_browser: !!row.auto_open_browser,
    kiosk_mode: !!row.kiosk_mode,
    auto_load_first: !!row.auto_load_first,
    slide_display_seconds: row.slide_display_seconds,
    idle_timeout_enabled: row.idle_timeout_enabled == null ? undefined : !!row.idle_timeout_enabled,
    idle_timeout_seconds: row.idle_timeout_seconds ?? undefined,
    tts_model: row.tts_model ?? undefined,
    tts_speed: row.tts_speed ?? undefined,
    tts_sentence_prefix: row.tts_sentence_prefix ?? undefined,
    tts_conditions: row.tts_conditions ? JSON.parse(row.tts_conditions) : undefined,
    tts_voice_pool: row.tts_voice_pool ? JSON.parse(row.tts_voice_pool) : undefined,
    layout_overrides: row.layout_overrides ? JSON.parse(row.layout_overrides) : undefined,
  };
}

export function getAppConfig(executor: SqlExecutor, ceremonyId: number): AppConfig | null {
  const rows = executor.query<AppConfigRow>('SELECT * FROM app_config WHERE ceremony_id = ?', [ceremonyId]);
  return rows[0] ? rowToAppConfig(rows[0]) : null;
}

export function upsertAppConfig(executor: SqlExecutor, ceremonyId: number, config: AppConfig): void {
  executor.run(
    `INSERT INTO app_config (
      ceremony_id, ws_port, http_port, mode, delay_seconds, auto_open_browser, kiosk_mode,
      auto_load_first, slide_display_seconds, idle_timeout_enabled, idle_timeout_seconds,
      tts_model, tts_speed, tts_sentence_prefix, tts_conditions, tts_voice_pool, layout_overrides
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ceremony_id) DO UPDATE SET
      ws_port=excluded.ws_port, http_port=excluded.http_port, mode=excluded.mode,
      delay_seconds=excluded.delay_seconds, auto_open_browser=excluded.auto_open_browser,
      kiosk_mode=excluded.kiosk_mode, auto_load_first=excluded.auto_load_first,
      slide_display_seconds=excluded.slide_display_seconds,
      idle_timeout_enabled=excluded.idle_timeout_enabled,
      idle_timeout_seconds=excluded.idle_timeout_seconds, tts_model=excluded.tts_model,
      tts_speed=excluded.tts_speed, tts_sentence_prefix=excluded.tts_sentence_prefix,
      tts_conditions=excluded.tts_conditions, tts_voice_pool=excluded.tts_voice_pool,
      layout_overrides=excluded.layout_overrides`,
    [
      ceremonyId,
      config.ws_port,
      config.http_port,
      config.mode,
      config.delay_seconds,
      config.auto_open_browser ? 1 : 0,
      config.kiosk_mode ? 1 : 0,
      config.auto_load_first ? 1 : 0,
      config.slide_display_seconds,
      config.idle_timeout_enabled == null ? null : config.idle_timeout_enabled ? 1 : 0,
      config.idle_timeout_seconds ?? null,
      config.tts_model ?? null,
      config.tts_speed ?? null,
      config.tts_sentence_prefix ?? null,
      config.tts_conditions ? JSON.stringify(config.tts_conditions) : null,
      config.tts_voice_pool ? JSON.stringify(config.tts_voice_pool) : null,
      config.layout_overrides ? JSON.stringify(config.layout_overrides) : null,
    ],
  );
}

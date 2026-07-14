/**
 * device-layout's built-in demo apps (APPS_CONFIG) — Finder, Terminal,
 * Settings, Browser, TextEdit, Clock, Notes, Photos, Music, Calendar,
 * Messages. Ids kept in sync manually with device-layout's
 * src/config/apps.config.ts (no runtime coupling — this is just a literal
 * list for the `exclude` option's type safety / editor autocomplete).
 */
export const BUILT_IN_APP_IDS = [
  'finder',
  'terminal',
  'settings',
  'browser',
  'textedit',
  'clock',
  'notes',
  'photos',
  'music',
  'calendar',
  'messages',
] as const;

export type BuiltInAppId = (typeof BUILT_IN_APP_IDS)[number];

import type { ApiIntegration, CustomVariable, TtsCondition } from '@sky-app/slide-shared';

export type SettingsGroupKey = 'apiConfig' | 'customVariables' | 'layoutOverrides' | 'tts' | 'appearance';

export const SETTINGS_GROUP_KEYS: SettingsGroupKey[] = [
  'apiConfig',
  'customVariables',
  'layoutOverrides',
  'tts',
  'appearance',
];

const BACKUP_SCHEMA = 'trao-bang-slide-settings';
const BACKUP_VERSION = 1;

export interface TtsBackupGroup {
  ttsDelay?: number;
  ttsTemplate?: string;
  ttsPlayMode?: 'realtime' | 'pregen' | 'pregen-fallback';
  ttsConditions?: TtsCondition[];
  ttsVoicePool?: string[];
}

export interface AppearanceBackupGroup {
  themeMode?: 'light' | 'dark' | 'system';
  themePalette?: 'green' | 'violet-bloom' | 'yellow' | 'tangerine' | 'summer' | 'starry-night';
  appFont?: string;
  letterSpacing?: number;
  appSpacing?: number;
  shadowLevel?: 'none' | 'soft' | 'medium' | 'bold';
}

export interface SettingsBackupFile {
  $schema: string;
  version: number;
  exportedAt: string;
  apiConfig?: ApiIntegration[];
  customVariables?: CustomVariable[];
  layoutOverrides?: Record<string, unknown>;
  tts?: TtsBackupGroup;
  appearance?: AppearanceBackupGroup;
}

export function buildBackupFile(groups: Partial<Record<SettingsGroupKey, unknown>>): SettingsBackupFile {
  return {
    $schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...groups,
  } as SettingsBackupFile;
}

const VALID_API_ACTIONS = ['qr_scan', 'play_student', 'welcome_screen', 'backdrop_toggle', 'submit_log'];
const VALID_API_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const VALID_TTS_PLAY_MODES = ['realtime', 'pregen', 'pregen-fallback'];
const VALID_THEME_MODES = ['light', 'dark', 'system'];
const VALID_THEME_PALETTES = [
  'green', 'violet-bloom', 'yellow', 'tangerine', 'summer', 'starry-night',
  'blue', 'red', 'orange', 'rose',
  'modern-minimal', 'clean-slate', 'amber-minimal', 'graphite', 'mono',
  'cosmic-night', 'midnight-bloom', 'caffeine',
  'bubblegum', 'catppuccin',
  'ocean-breeze',
];
const VALID_SHADOW_LEVELS = ['none', 'soft', 'medium', 'bold'];
const VALID_APP_FONTS = [
  'system-ui', 'Inter', 'Montserrat', 'Roboto', 'Be Vietnam Pro', 'SF Pro Vietnamese',
  'Playfair Display', 'EB Garamond', 'Lora', 'Crimson Pro', 'Source Serif Pro',
];

function validateApiConfig(data: unknown): string[] {
  if (!Array.isArray(data)) return ['apiConfig phải là một mảng'];
  const errors: string[] = [];
  const seenActions = new Set<string>();
  data.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      errors.push(`Phần tử ${idx}: không phải object`);
      return;
    }
    const o = item as Record<string, unknown>;
    if (!o.id) errors.push(`Phần tử ${idx}: thiếu id`);
    if (!o.url) errors.push(`Phần tử ${idx}: thiếu url`);
    if (!VALID_API_ACTIONS.includes(o.action as string)) errors.push(`Phần tử ${idx}: action không hợp lệ`);
    if (!VALID_API_METHODS.includes(o.method as string)) errors.push(`Phần tử ${idx}: method không hợp lệ`);
    if (!Array.isArray(o.headers)) errors.push(`Phần tử ${idx}: headers phải là mảng`);
    if (typeof o.action === 'string') {
      if (seenActions.has(o.action)) errors.push(`Trùng action "${o.action}" giữa nhiều phần tử`);
      seenActions.add(o.action);
    }
  });
  return errors;
}

function validateCustomVariables(data: unknown): string[] {
  if (!Array.isArray(data)) return ['customVariables phải là một mảng'];
  const errors: string[] = [];
  data.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      errors.push(`Phần tử ${idx}: không phải object`);
      return;
    }
    const o = item as Record<string, unknown>;
    if (typeof o.key !== 'string' || o.key.length === 0) errors.push(`Phần tử ${idx}: thiếu key`);
    if (o.rules !== undefined && !Array.isArray(o.rules)) errors.push(`Phần tử ${idx}: rules phải là mảng`);
  });
  return errors;
}

function validateLayoutOverrides(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['layoutOverrides phải là một object'];
  const errors: string[] = [];
  Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`layoutOverrides["${key}"] phải là một object`);
    }
  });
  return errors;
}

function validateTts(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['tts phải là một object'];
  const o = data as Record<string, unknown>;
  const errors: string[] = [];
  if (o.ttsDelay !== undefined && typeof o.ttsDelay !== 'number') errors.push('ttsDelay phải là số');
  if (o.ttsTemplate !== undefined && typeof o.ttsTemplate !== 'string') errors.push('ttsTemplate phải là chuỗi');
  if (o.ttsPlayMode !== undefined && !VALID_TTS_PLAY_MODES.includes(o.ttsPlayMode as string)) {
    errors.push('ttsPlayMode không hợp lệ');
  }
  if (o.ttsConditions !== undefined && !Array.isArray(o.ttsConditions)) errors.push('ttsConditions phải là mảng');
  if (o.ttsVoicePool !== undefined && !Array.isArray(o.ttsVoicePool)) errors.push('ttsVoicePool phải là mảng');
  return errors;
}

function validateAppearance(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['appearance phải là một object'];
  const o = data as Record<string, unknown>;
  const errors: string[] = [];
  if (o.themeMode !== undefined && !VALID_THEME_MODES.includes(o.themeMode as string)) errors.push('themeMode không hợp lệ');
  if (o.themePalette !== undefined && !VALID_THEME_PALETTES.includes(o.themePalette as string)) errors.push('themePalette không hợp lệ');
  if (o.appFont !== undefined && !VALID_APP_FONTS.includes(o.appFont as string)) errors.push('appFont không hợp lệ');
  if (o.letterSpacing !== undefined && typeof o.letterSpacing !== 'number') errors.push('letterSpacing phải là số');
  if (o.appSpacing !== undefined && typeof o.appSpacing !== 'number') errors.push('appSpacing phải là số');
  if (o.shadowLevel !== undefined && !VALID_SHADOW_LEVELS.includes(o.shadowLevel as string)) errors.push('shadowLevel không hợp lệ');
  return errors;
}

export const GROUP_VALIDATORS: Record<SettingsGroupKey, (data: unknown) => string[]> = {
  apiConfig: validateApiConfig,
  customVariables: validateCustomVariables,
  layoutOverrides: validateLayoutOverrides,
  tts: validateTts,
  appearance: validateAppearance,
};

export interface ParsedSettingsGroup {
  key: SettingsGroupKey;
  present: boolean;
  valid: boolean;
  errors: string[];
}

export interface ParsedSettingsBackup {
  data: SettingsBackupFile;
  groups: ParsedSettingsGroup[];
}

export function parseSettingsBackupFile(raw: string): ParsedSettingsBackup {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File không đúng định dạng backup setting');
  }
  const data = parsed as SettingsBackupFile;
  if (data.$schema !== BACKUP_SCHEMA) {
    throw new Error('File không phải backup setting hợp lệ (thiếu $schema)');
  }

  const groups: ParsedSettingsGroup[] = SETTINGS_GROUP_KEYS.map((key) => {
    const present = data[key] !== undefined;
    if (!present) return { key, present: false, valid: false, errors: [] };
    const errors = GROUP_VALIDATORS[key](data[key]);
    return { key, present: true, valid: errors.length === 0, errors };
  });

  return { data, groups };
}

export function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * EffectPresetPort — preset hiệu ứng hậu kỳ cho audio TTS (reverb, delay, pitch shift...).
 * Electron: IPC → ceremony-db. Web: HTTP → data-service.
 *
 * Chỉ quản lý PRESET (lưu ở ceremony-db). Việc áp hiệu ứng do tiến trình Python của
 * tts-service làm: renderer tra preset qua port này rồi gửi `effectsChain` kèm request
 * synthesize. Python cách ly với ceremony-db nên không thể tự tra preset — xem
 * packages/ceremony-db/src/migrations/015_effect_preset.ts.
 */

/** Một hiệu ứng trong chuỗi. `params` khớp bảng hiệu ứng server trả qua `GET /effects`. */
export interface EffectConfig {
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface EffectPreset {
  id: string;
  name: string;
  description: string | null;
  effectsChain: EffectConfig[];
  /** Preset dựng sẵn (Giọng robot / radio / Phòng vang / Giọng trầm) — không sửa/xoá được. */
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string;
}

/** Định nghĩa 1 tham số của hiệu ứng — UI dựng slider từ đây, không hard-code. */
export interface EffectParamDef {
  default: number;
  min: number;
  max: number;
  step: number;
  description: string;
}

/** 1 loại hiệu ứng khả dụng, do server TTS khai báo (`GET /effects`). */
export interface EffectTypeInfo {
  type: string;
  label: string;
  description: string;
  params: Record<string, EffectParamDef>;
}

export interface EffectPresetPort {
  list(): Promise<EffectPreset[]>;
  create(name: string, effectsChain: EffectConfig[], description?: string): Promise<EffectPreset>;
  /** Sửa preset người dùng. Ném lỗi nếu là preset dựng sẵn. */
  update(
    id: string,
    patch: { name?: string; description?: string; effectsChain?: EffectConfig[] },
  ): Promise<EffectPreset | null>;
  /** Xoá preset người dùng. Ném lỗi nếu là preset dựng sẵn. */
  delete(id: string): Promise<boolean>;
}

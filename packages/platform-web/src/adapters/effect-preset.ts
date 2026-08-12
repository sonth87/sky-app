import type { EffectPresetPort, EffectPreset } from '@sky-app/service-contracts';

/**
 * Web EffectPresetPort — routes to data-service REST API
 * (apps/data-service/src/routes/effect-preset.ts). Preset hiệu ứng hậu kỳ audio TTS.
 */
export function createWebEffectPresetPort(baseUrl = ''): EffectPresetPort {
  const url = `${baseUrl}/api/effect-presets`;

  /** Server trả `{error}` cho vi phạm quy tắc (trùng tên, sửa preset dựng sẵn) — thông
   *  báo đó viết cho người dùng đọc, ưu tiên nó hơn statusText ("Bad Request"). */
  async function failure(res: Response, fallback: string): Promise<Error> {
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) return new Error(body.error);
    } catch {
      /* body không phải JSON */
    }
    return new Error(`${fallback}: ${res.statusText}`);
  }

  return {
    async list() {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw await failure(res, 'Không tải được danh sách preset');
      return res.json() as Promise<EffectPreset[]>;
    },
    async create(name, effectsChain, description) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, effectsChain, description }),
      });
      if (!res.ok) throw await failure(res, 'Không lưu được preset');
      return res.json() as Promise<EffectPreset>;
    },
    async update(id, patch) {
      const res = await fetch(`${url}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await failure(res, 'Không sửa được preset');
      return res.json() as Promise<EffectPreset>;
    },
    async delete(id) {
      const res = await fetch(`${url}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 404) return false;
      if (!res.ok) throw await failure(res, 'Không xoá được preset');
      return true;
    },
  };
}

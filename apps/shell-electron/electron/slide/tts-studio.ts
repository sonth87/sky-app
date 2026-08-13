import { getPythonPort } from './python-server';

function pythonUrl() {
  return `http://127.0.0.1:${getPythonPort()}`;
}

/**
 * Gọi /synthesize cho app tts-studio — KHÔNG cache, KHÔNG pregen, KHÔNG quality
 * header parsing (khác runVieneu dùng bởi Ceremony). voiceId dùng thẳng id từ
 * GET /voices (vd "NF"), không có prefix "vieneu-" như model name của Ceremony.
 */
export async function synthesizeTtsStudio(
  text: string,
  voiceId: string,
  speed: number,
  // Chuỗi hiệu ứng ĐÃ RESOLVE từ preset (renderer tra ceremony-db rồi gửi xuống —
  // tiến trình Python không với tới DB đó, xem migration 015_effect_preset.ts).
  effectsChain?: unknown[],
  // Tham số sampling theo engine. Bug thật: preload GỬI field này từ lâu nhưng cả handler
  // IPC lẫn hàm này đều không nhận, nên mọi chỉnh sửa nâng cao ở TTS Studio đều rơi vào
  // hư không. Đáng sửa hẳn bây giờ vì sau khi lọc khối `infer` global theo `sampling_params`
  // (xem main.py's _run_synthesis), đây là đường DUY NHẤT chỉnh được sampling của Qwen.
  engineOverrides?: Record<string, Record<string, unknown>>,
): Promise<{ ok: boolean; buffer?: Buffer; sampleRate?: number; error?: string }> {
  const url = `${pythonUrl()}/synthesize`;
  try {
    const normalizedText = text.trim();
    const timeoutMs = Math.min(180_000, 60_000 + normalizedText.length * 200);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: normalizedText, speaker_id: voiceId, speed,
        ...(effectsChain?.length ? { effects_chain: effectsChain } : {}),
        ...(engineOverrides ? { engine_overrides: engineOverrides } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        error: `TTS Studio synthesize failed: HTTP ${response.status} ${response.statusText}: ${errText || 'empty body'}`,
      };
    }

    const sampleRate = parseInt(response.headers.get('X-Sample-Rate') ?? '48000', 10);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { ok: true, buffer, sampleRate };
  } catch (err) {
    const e = err as Error;
    return { ok: false, error: e?.message ?? String(err) };
  }
}

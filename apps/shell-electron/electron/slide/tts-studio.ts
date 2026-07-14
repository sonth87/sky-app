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
): Promise<{ ok: boolean; buffer?: Buffer; sampleRate?: number; error?: string }> {
  const url = `${pythonUrl()}/synthesize`;
  try {
    const normalizedText = text.trim();
    const timeoutMs = Math.min(180_000, 60_000 + normalizedText.length * 200);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalizedText, speaker_id: voiceId, speed }),
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

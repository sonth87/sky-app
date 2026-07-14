import { getPythonPort } from './python-server';
import { parseQualityHeaders } from './pregen-queue';

function pythonUrl() {
  return `http://127.0.0.1:${getPythonPort()}`;
}

export async function runVieneu(
  text: string,
  speakerId: string, // 'NF' | 'SF' | 'NM1' | 'NM2' | 'SM'
  speed: number,
): Promise<{ ok: boolean; buffer?: Buffer; sampleRate?: number; error?: string; quality_score?: number; quality_flags?: string[] }> {
  const url = `${pythonUrl()}/synthesize`;
  try {
    const normalizedText = text.trim();
    console.log(
      `[VieNeu client] Requesting TTS url=${url} speaker=${speakerId} speed=${speed} ` +
      `textLen=${normalizedText.length} text=${JSON.stringify(normalizedText)}`
    );
    // Timeout scale theo độ dài text (base 60s + 200ms/char, cap 180s). Trước đây
    // realtime KHÔNG có timeout → server treo là speak treo vĩnh viễn giữa buổi lễ.
    const timeoutMs = Math.min(180_000, 60_000 + normalizedText.length * 200);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalizedText, speaker_id: speakerId, speed }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[VieNeu client] HTTP ${response.status} ${response.statusText} url=${url} ` +
        `speaker=${speakerId} speed=${speed} textLen=${normalizedText.length} body=${errText}`
      );
      return {
        ok: false,
        error: `VieNeu TTS Error: HTTP ${response.status} ${response.statusText}: ${errText || 'empty body'}`
      };
    }

    const sampleRate = parseInt(response.headers.get('X-Sample-Rate') ?? '48000', 10);
    const quality = parseQualityHeaders(response.headers);
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(
      `[VieNeu client] OK speaker=${speakerId} bytes=${buffer.length} sampleRate=${sampleRate} ` +
      `qScore=${quality.quality_score ?? '-'} qFlags=${quality.quality_flags?.join('|') ?? '-'}`
    );
    return { ok: true, buffer, sampleRate, ...quality };
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    const msg = e?.message ?? String(err);
    console.error(
      `[VieNeu client] fetch failed url=${url} speaker=${speakerId} speed=${speed} ` +
      `textLen=${text.trim().length} text=${JSON.stringify(text.trim())}`
    );
    console.error(`[VieNeu client] error name=${e?.name ?? 'Unknown'} message=${msg}`);
    if (e?.cause) console.error('[VieNeu client] cause:', e.cause);
    if (e?.stack) console.error('[VieNeu client] stack:', e.stack);
    return { ok: false, error: msg };
  }
}

export async function warmupVieneu(_speakerId: string): Promise<void> {
  try {
    const response = await fetch(`${pythonUrl()}/health`);
    if (response.ok) {
      console.log('[VieNeu client] Warmup (health check) OK');
    } else {
      console.warn('[VieNeu client] Warmup health check status:', response.status);
    }
  } catch (err) {
    console.warn('[VieNeu client] Warmup failed:', err);
  }
}

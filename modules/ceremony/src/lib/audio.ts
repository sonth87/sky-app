let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    console.log('[Audio] create AudioContext state=', audioCtx.state);
  }
  return audioCtx;
}

export async function playPcm(arrayBuffer: ArrayBuffer, sampleRate = 24000): Promise<void> {
  console.log('[Audio] playPcm start bytes=', arrayBuffer.byteLength, 'sampleRate=', sampleRate);
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }

  const ctx = getAudioCtx();
  console.log('[Audio] ctx state before resume=', ctx.state);
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (err) {
      console.error('[Audio] ctx resume failed:', err);
      throw err;
    }
  }
  console.log('[Audio] ctx state after resume=', ctx.state);

  const sampleCount = Math.floor(arrayBuffer.byteLength / 2);
  if (sampleCount <= 0) {
    throw new Error('Empty PCM buffer');
  }
  const int16View = new Int16Array(arrayBuffer, 0, sampleCount);
  const float32Data = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32Data[i] = int16View[i] / 32768;
  }

  const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
  audioBuffer.copyToChannel(float32Data, 0);
  console.log('[Audio] audioBuffer duration=', audioBuffer.duration, 'length=', audioBuffer.length);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  currentSource = source;
  source.onended = () => { if (currentSource === source) currentSource = null; };
  try {
    source.start(0);
  } catch (err) {
    console.error('[Audio] source.start failed:', err);
    throw err;
  }
  console.log('[Audio] playback started');
}

export function stopPcm(): void {
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }
}

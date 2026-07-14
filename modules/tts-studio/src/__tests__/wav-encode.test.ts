import { describe, expect, it } from 'vitest';
import { pcmToWavBlob } from '../lib/wav-encode';

describe('pcmToWavBlob', () => {
  it('tạo Blob với header WAV 44 byte + đúng dataSize', async () => {
    const pcm = new Int16Array([1, 2, 3, -1]).buffer;
    const blob = pcmToWavBlob(pcm, 48000);

    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + pcm.byteLength);

    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    const readStr = (offset: number, len: number) =>
      Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

    expect(readStr(0, 4)).toBe('RIFF');
    expect(readStr(8, 4)).toBe('WAVE');
    expect(readStr(12, 4)).toBe('fmt ');
    expect(view.getUint16(22, true)).toBe(1); // numChannels = mono
    expect(view.getUint32(24, true)).toBe(48000); // sampleRate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readStr(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(pcm.byteLength);
  });
});

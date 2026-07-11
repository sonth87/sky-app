import { describe, expect, it } from 'vitest';
import { createCapabilitySet } from '../capability.js';

describe('CapabilitySet', () => {
  it('has trả đúng theo danh sách granted', () => {
    const caps = createCapabilitySet(['network', 'tts']);
    expect(caps.has('network')).toBe(true);
    expect(caps.has('secondary-display')).toBe(false);
  });

  it('list trả về mảng capability đã cấp', () => {
    const caps = createCapabilitySet(['fs']);
    expect(caps.list()).toEqual(['fs']);
  });
});

import { describe, expect, it } from 'vitest';
import { createServiceRegistry } from '../service-registry.js';

interface FakeTts {
  speak(text: string): string;
}

describe('ServiceRegistry', () => {
  it('register rồi get trả về đúng instance, typed', () => {
    const registry = createServiceRegistry();
    const fakeTts: FakeTts = { speak: (t) => `said:${t}` };
    registry.register('tts', fakeTts);

    const resolved = registry.get<FakeTts>('tts');
    expect(resolved).toBe(fakeTts);
    expect(resolved?.speak('hi')).toBe('said:hi');
  });

  it('get trả về undefined nếu chưa register', () => {
    const registry = createServiceRegistry();
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
  });

  it('unregister gỡ service', () => {
    const registry = createServiceRegistry();
    registry.register('x', {});
    registry.unregister('x');
    expect(registry.has('x')).toBe(false);
  });
});

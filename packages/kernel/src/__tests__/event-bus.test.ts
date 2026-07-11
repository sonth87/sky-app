import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../event-bus.js';

describe('EventBus', () => {
  it('emit gọi handler đã đăng ký', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('app:action', handler);
    bus.emit('app:action', { value: 1 });
    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('unsubscribe ngừng nhận event', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('app:action', handler);
    unsubscribe();
    bus.emit('app:action', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('sticky + replayLatest: subscriber mount muộn nhận được giá trị cũ', () => {
    const bus = createEventBus();
    bus.emit('platform:ready', { ok: true }, { persistMs: 1000 });

    const handler = vi.fn();
    bus.on('platform:ready', handler, { replayLatest: true });

    expect(handler).toHaveBeenCalledWith({ ok: true });
  });

  it('không replay nếu không truyền replayLatest', () => {
    const bus = createEventBus();
    bus.emit('platform:ready', { ok: true }, { persistMs: 1000 });

    const handler = vi.fn();
    bus.on('platform:ready', handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it('sticky hết hạn thì không replay', async () => {
    const bus = createEventBus();
    bus.emit('platform:ready', { ok: true }, { persistMs: 5 });
    await new Promise((r) => setTimeout(r, 20));

    const handler = vi.fn();
    bus.on('platform:ready', handler, { replayLatest: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('once chỉ gọi 1 lần', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once('x', handler);
    bus.emit('x', 1);
    bus.emit('x', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });
});

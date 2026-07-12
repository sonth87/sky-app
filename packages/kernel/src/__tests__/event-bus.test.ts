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

  it('off() gỡ đúng handler, không ảnh hưởng handler khác trên cùng event', () => {
    const bus = createEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on('app:action', handlerA);
    bus.on('app:action', handlerB);

    bus.off('app:action', handlerA);
    bus.emit('app:action', 'payload');

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledWith('payload');
  });

  it('off() trên event chưa từng đăng ký không throw', () => {
    const bus = createEventBus();
    expect(() => bus.off('never-registered', vi.fn())).not.toThrow();
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

  it('once() trả về unsubscribe dùng được để huỷ đăng ký TRƯỚC khi event bắn (cách gọi hiện tại bus.once(...) — luôn giữ nguyên `this` vì gọi qua object, an toàn)', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.once('y', handler);
    unsubscribe();
    bus.emit('y', 'should-not-fire');
    expect(handler).not.toHaveBeenCalled();
  });

  // GHI CHÚ KIẾN TRÚC (audit GĐ7.5, E3): event-bus.ts:75-81's `once()` implementation
  // gọi `this.on(event, wrapped)` bên trong 1 object literal (không phải class) —
  // `this` chỉ đúng khi `once` được gọi QUA object (bus.once(...), như toàn bộ
  // codebase hiện tại đang làm — xem grep `\.once(` chỉ có dạng gọi qua biến bus).
  // Nếu ai đó destructure `const { once } = someBus` rồi gọi `once(...)` tách rời
  // khỏi object, `this` sẽ mất ngữ cảnh (undefined trong strict mode/ESM) và ném
  // lỗi ngay khi emit — thực nghiệm dưới đây xác nhận bằng code thật, không suy đoán.
  it('THỰC NGHIỆM: destructure `{ once } = bus` rồi gọi rời — xác nhận lỗi thật xảy ra (rủi ro fragile của event-bus.ts:75-81)', () => {
    const bus = createEventBus();
    const { once } = bus; // phá vỡ binding `this` — đúng kịch bản lo ngại trong plan audit
    const handler = vi.fn();

    // Gọi once() đã destructure, tách khỏi `bus` — this bên trong once() sẽ undefined.
    expect(() => once('z', handler)).toThrowError(TypeError);

    // Xác nhận thêm: bus.once (gọi đúng cách, KHÔNG destructure) trên cùng instance
    // vẫn hoạt động bình thường — chứng minh lỗi chỉ xảy ra khi destructure, không
    // phải lỗi logic once() nói chung.
    const handlerOk = vi.fn();
    bus.once('z', handlerOk);
    bus.emit('z', 42);
    expect(handlerOk).toHaveBeenCalledWith(42);
  });
});

import { describe, expect, it, vi } from 'vitest';

/**
 * BUG-006 (GĐ7.5 Sóng 2, đã fix) — `handleStartPregen` trong TtsSettingsContent.tsx
 * thiếu try/catch/finally quanh `await window.slide.pregenStart()`. Nếu IPC call reject
 * (crash Python engine, timeout...), `setPregenRunning(false)` (nằm sau `await`, không có
 * `finally`) không chạy -> nút "Tạo giọng đọc" kẹt ở trạng thái loading vĩnh viễn cho tới
 * khi user reload toàn bộ Control app.
 *
 * `handleStartPregen` là closure bên trong component React (phụ thuộc nhiều state/props/
 * `window.slide` — không tách được thành pure function để import trực tiếp không mount
 * React). Test này gồm 2 phần:
 *  1. Test hành vi tương đương (cùng cấu trúc try/catch/finally, cùng cách gọi setState)
 *     bằng 1 hàm mô phỏng NGẮN đúng logic đã fix, xác nhận setPregenRunning(false) LUÔN
 *     được gọi kể cả khi promise reject.
 *  2. Test đọc source thật của TtsSettingsContent.tsx, xác nhận `handleStartPregen` có
 *     try/catch/finally bọc quanh `window.slide.pregenStart` (không chỉ tin vào mô phỏng).
 */

describe('BUG-006 (đã fix) — handleStartPregen reset pregenRunning kể cả khi IPC reject', () => {
  it('mô phỏng đúng cấu trúc try/catch/finally đã fix: setPregenRunning(false) luôn chạy dù pregenStart() reject', async () => {
    const setPregenRunning = vi.fn();
    const alertFn = vi.fn();
    const pregenStart = vi.fn().mockRejectedValue(new Error('IPC timeout'));

    // Bản sao chính xác cấu trúc handleStartPregen sau fix (try/catch/finally).
    async function handleStartPregen() {
      setPregenRunning(true);
      try {
        const result = await pregenStart();
        if (!result.ok) {
          alertFn(result.error ?? 'Không thể bắt đầu pre-generate');
        }
      } catch (err) {
        alertFn('Không thể bắt đầu pre-generate (lỗi kết nối)');
      } finally {
        setPregenRunning(false);
      }
    }

    await handleStartPregen();

    expect(setPregenRunning).toHaveBeenNthCalledWith(1, true);
    expect(setPregenRunning).toHaveBeenNthCalledWith(2, false);
    expect(setPregenRunning).toHaveBeenCalledTimes(2);
    expect(alertFn).toHaveBeenCalledWith('Không thể bắt đầu pre-generate (lỗi kết nối)');
  });

  it('setPregenRunning(false) vẫn chạy khi pregenStart() resolve OK (không regression đường thành công)', async () => {
    const setPregenRunning = vi.fn();
    const alertFn = vi.fn();
    const pregenStart = vi.fn().mockResolvedValue({ ok: true });

    async function handleStartPregen() {
      setPregenRunning(true);
      try {
        const result = await pregenStart();
        if (!result.ok) {
          alertFn(result.error ?? 'Không thể bắt đầu pre-generate');
        }
      } catch (err) {
        alertFn('Không thể bắt đầu pre-generate (lỗi kết nối)');
      } finally {
        setPregenRunning(false);
      }
    }

    await handleStartPregen();

    expect(setPregenRunning).toHaveBeenNthCalledWith(1, true);
    expect(setPregenRunning).toHaveBeenNthCalledWith(2, false);
    expect(alertFn).not.toHaveBeenCalled();
  });

  it('xác nhận source thật TtsSettingsContent.tsx có try/catch/finally quanh window.slide.pregenStart', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const sourcePath = fileURLToPath(
      new URL('../components/settings/TtsSettingsContent.tsx', import.meta.url)
    );
    const source = readFileSync(sourcePath, 'utf-8');

    const fnMatch = source.match(/const handleStartPregen = async[\s\S]*?\n  \};/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];

    expect(fnBody).toMatch(/try\s*\{/);
    expect(fnBody).toMatch(/catch\s*\(/);
    expect(fnBody).toMatch(/finally\s*\{/);
    // setPregenRunning(false) phải nằm trong finally, không phải cuối try (mới đảm bảo luôn chạy).
    const financeBlockMatch = fnBody.match(/finally\s*\{([\s\S]*?)\}/);
    expect(financeBlockMatch).not.toBeNull();
    expect(financeBlockMatch![1]).toMatch(/setPregenRunning\(false\)/);
  });
});

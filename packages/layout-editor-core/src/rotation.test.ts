// Test hàm thuần rotation.ts — Bước 4 kế hoạch resize/rotate (2026-07-18).

import { describe, expect, it } from 'vitest';
import { accumulateRotation, angleFromCenter, normalizeRotation } from './rotation.js';

describe('angleFromCenter — 0°=lên (12 giờ), tăng theo chiều kim đồng hồ', () => {
  it('điểm thẳng LÊN từ tâm → 0°', () => {
    expect(angleFromCenter(0, 0, 0, -10)).toBeCloseTo(0, 5);
  });

  it('điểm thẳng PHẢI từ tâm → 90°', () => {
    expect(angleFromCenter(0, 0, 10, 0)).toBeCloseTo(90, 5);
  });

  it('điểm thẳng XUỐNG từ tâm → 180°', () => {
    expect(angleFromCenter(0, 0, 0, 10)).toBeCloseTo(180, 5);
  });

  it('điểm thẳng TRÁI từ tâm → 270°', () => {
    expect(angleFromCenter(0, 0, -10, 0)).toBeCloseTo(270, 5);
  });

  it('tâm khác gốc toạ độ (cx,cy≠0) → tính đúng theo offset tương đối', () => {
    expect(angleFromCenter(100, 100, 100, 50)).toBeCloseTo(0, 5);
    expect(angleFromCenter(100, 100, 150, 100)).toBeCloseTo(90, 5);
  });
});

describe('normalizeRotation — chuẩn hoá về [0,360)', () => {
  it('giá trị đã trong khoảng → giữ nguyên', () => {
    expect(normalizeRotation(45)).toBe(45);
    expect(normalizeRotation(0)).toBe(0);
  });

  it('giá trị âm → cộng 360', () => {
    expect(normalizeRotation(-10)).toBe(350);
    expect(normalizeRotation(-370)).toBe(350);
  });

  it('giá trị ≥360 → trừ về trong khoảng', () => {
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(720)).toBe(0);
  });
});

describe('accumulateRotation — cộng dồn delta, KHÔNG giật khi qua biên 180°/-180°', () => {
  it('delta nhỏ bình thường → cộng dồn đúng', () => {
    expect(accumulateRotation(10, 0, 15)).toBe(25);
  });

  it('qua biên atan2 (359° → 1°, thực ra chỉ di chuyển +2°) → KHÔNG nhảy giật ngược 358°', () => {
    // prevAngle=359, currentAngle=1 — atan2 nhảy cực, nhưng hướng di chuyển THẬT chỉ +2° (359→360→1).
    const result = accumulateRotation(100, 359, 1);
    expect(result).toBe(102);
  });

  it('qua biên theo chiều ngược (1° → 359°, thực ra chỉ di chuyển -2°) → KHÔNG nhảy +358°', () => {
    const result = accumulateRotation(100, 1, 359);
    expect(result).toBe(98);
  });

  it('kết quả cộng dồn vượt 360 → tự chuẩn hoá lại [0,360)', () => {
    expect(accumulateRotation(350, 0, 20)).toBe(10);
  });

  it('kết quả cộng dồn âm → tự chuẩn hoá lại [0,360)', () => {
    expect(accumulateRotation(5, 20, 0)).toBe(345);
  });
});

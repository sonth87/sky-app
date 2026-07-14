import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  BackdropView,
  type BackdropAspectRatio,
  type BackdropTemplateMap,
  type Ceremony,
  type Student,
} from '@sky-app/slide-shared';
import { createSocket, type SlideSocket } from '../lib/socket';
import { resolveAsset } from '../lib/assets';
import { playPcm, stopPcm } from './lib/tts';
import { renderTemplate } from '../lib/renderTemplate';

function getVoiceForStudent(
  student: Student,
  conditions: Array<{ attr: string; val: string; voice: string }>,
  fallbackVoice: string,
): string {
  for (const cond of conditions) {
    let studentVal = '';
    const attr = cond.attr;
    if (attr === 'Giới tính') {
      studentVal = student.gender || '';
    } else if (attr === 'Xếp loại') {
      studentVal = student.classification || '';
    } else if (attr === 'Ngành') {
      studentVal = student.major_name || '';
    } else if (attr === 'Khoa') {
      studentVal = student.faculty_name || '';
    } else if (attr === 'Lớp') {
      studentVal = student.class_code || '';
    } else if (attr === 'Khóa') {
      studentVal = student.course_code || '';
    } else if (attr === 'Họ tên') {
      studentVal = student.full_name || '';
    }

    if (studentVal.trim().toLowerCase() === cond.val.trim().toLowerCase()) {
      return cond.voice;
    }
  }
  return fallbackVoice;
}

const star = (confetti as any).shapeFromPath({
  path: 'M 10 0 L 13 7 L 20 10 L 13 13 L 10 20 L 7 13 L 0 10 L 7 7 Z',
});

// ─── Color presets ────────────────────────────────────────────────────────────

const COLOR_PRESETS: Record<string, string[]> = {
  colorful: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#6C5CE7', '#00B894', '#FF7675'],
  gold:     ['#FFDF00', '#FFE5A3', '#FFF871', '#F1EFAC', '#FFFFFF', '#D4AF37', '#FFC107'],
  silver:   ['#C0C0C0', '#E8E8E8', '#A8A9AD', '#D3D3D3', '#B8B8B8', '#F5F5F5', '#FFFFFF'],
  pink:     ['#FF69B4', '#FFB6C1', '#FF1493', '#FFC0CB', '#FF85C8', '#FFD1DC', '#FFFFFF'],
  green:    ['#00C851', '#ADFF2F', '#00E676', '#69F0AE', '#00BFA5', '#B9F6CA', '#FFFFFF'],
  blue:     ['#2196F3', '#87CEEB', '#1565C0', '#64B5F6', '#0288D1', '#B3E5FC', '#FFFFFF'],
  red:      ['#FF1744', '#FF6B6B', '#D50000', '#FF5252', '#F44336', '#FFCDD2', '#FFFFFF'],
  purple:   ['#9C27B0', '#E040FB', '#7B1FA2', '#CE93D8', '#BA68C8', '#F3E5F5', '#FFFFFF'],
};

/** Trả về shape array dùng cho canvas-confetti dựa trên confettiShape string */
function resolveShapes(shape: string): any[] {
  if (shape === 'star') return [star];
  if (shape === 'circle') return ['circle'];
  if (shape === 'square') return ['square'];
  // 'default': hỗn hợp circle + square
  return ['circle', 'square'];
}

// ─── Vector & Physics Helpers for Classic Ribbon ──────────────────────────────

interface Vector2D {
  x: number;
  y: number;
}
function addVec(v1: Vector2D, v2: Vector2D) {
  v1.x += v2.x;
  v1.y += v2.y;
}
function subVec(v1: Vector2D, v2: Vector2D) {
  v1.x -= v2.x;
  v1.y -= v2.y;
}
function multVec(v: Vector2D, n: number) {
  v.x *= n;
  v.y *= n;
}
function lenVec(v: Vector2D) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}
function normVec(v: Vector2D) {
  const len = lenVec(v);
  if (len !== 0) {
    v.x /= len;
    v.y /= len;
  }
}
function subtractNew(v1: Vector2D, v2: Vector2D): Vector2D {
  return { x: v1.x - v2.x, y: v1.y - v2.y };
}

interface EulerMass {
  position: Vector2D;
  mass: number;
  drag: number;
  force: Vector2D;
  velocity: Vector2D;
}
function createEulerMass(x: number, y: number, mass: number, drag: number): EulerMass {
  return {
    position: { x, y },
    mass,
    drag,
    force: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
  };
}
function addForce(em: EulerMass, f: Vector2D) {
  em.force.x += f.x;
  em.force.y += f.y;
}
function integrateEuler(em: EulerMass, duration: number) {
  const acc = { x: em.force.x, y: em.force.y };
  const speed = lenVec(em.velocity);
  const dragX = em.velocity.x * em.drag * em.mass * speed;
  const dragY = em.velocity.y * em.drag * em.mass * speed;
  acc.x -= dragX;
  acc.y -= dragY;
  acc.x /= em.mass;
  acc.y /= em.mass;
  em.position.x += em.velocity.x * duration;
  em.position.y += em.velocity.y * duration;
  em.velocity.x += acc.x * duration;
  em.velocity.y += acc.y * duration;
  em.force.x = 0;
  em.force.y = 0;
}

// Bắn batch mới khi batch cũ còn 25% tuổi thọ (gối đầu nhau nhẹ)
const REPEAT_OVERLAP = 0.75;

// Trần tổng số ribbon vẽ đồng thời — tránh tích luỹ vô hạn khi confettiRepeat
// bật lâu trên cùng 1 sinh viên (mỗi đợt lặp overlap với đợt trước, không tự dọn hết).
const MAX_CONCURRENT_RIBBONS = 120;

const TICKS_MAP: Record<string, number> = {
  short: 150,
  normal: 320,
  long: 480,
  very_long: 700,
};

const AMOUNT_MULTIPLIER: Record<string, number> = {
  very_low: 0.2,
  low: 0.4,
  medium: 0.65,
  high: 1.0,
  very_high: 1.6,
};

// gravity thấp = rơi chậm, lơ lửng lâu. Default canvas-confetti = 1.0
const SPEED_GRAVITY: Record<string, number> = {
  very_slow: 0.4,
  slow: 0.65,
  normal: 0.85,
  fast: 1.05,
  very_fast: 1.25,
};

function p(count: number, mult: number) {
  return Math.max(1, Math.round(count * mult));
}

type ConfettiOpts = {
  colors: string[];
  shapes: any[];
  ribbonRef: React.MutableRefObject<string>;
  ticks: number;
  scale: number;
  ratios: { small: number; medium: number; large: number };
};


function fireMixedSizesHelper(
  mult: number,
  base: any,
  count: number,
  baseScalar: number,
  opts: ConfettiOpts
) {
  const { scale, ratios } = opts;
  const sum = Math.max(1, ratios.small + ratios.medium + ratios.large);
  const pSmall = ratios.small / sum;
  const pMedium = ratios.medium / sum;
  const pLarge = ratios.large / sum;

  // Hạt vừa
  if (pMedium > 0) {
    confetti({
      ...base,
      particleCount: p(count * pMedium, mult),
      scalar: baseScalar * 1.05 * scale
    });
  }
  // Hạt nhỏ
  if (pSmall > 0) {
    confetti({
      ...base,
      particleCount: p(count * pSmall, mult),
      scalar: baseScalar * 0.6 * scale
    });
  }
  // Hạt to
  if (pLarge > 0) {
    confetti({
      ...base,
      particleCount: p(count * pLarge * 0.75, mult),
      scalar: baseScalar * 1.65 * scale
    });
    // Hạt rất to
    confetti({
      ...base,
      particleCount: p(count * pLarge * 0.25, mult),
      scalar: baseScalar * 2.2 * scale
    });
  }
}


function fireConfettiStandard(mult: number, gravity: number, opts: ConfettiOpts) {
  const { colors, shapes, ticks } = opts;
  const base = { spread: 100, startVelocity: 180, ticks, zIndex: 9999, shapes, colors, gravity };

  const fireMixedSizes = (o: any, count: number, baseScalar: number) => {
    fireMixedSizesHelper(mult, o, count, baseScalar, opts);
  };

  const base2 = { ...base, startVelocity: 170, spread: 90 };
  const base3 = { ...base, startVelocity: 150, spread: 80 };

  fireMixedSizes({ ...base,  angle: 60,  origin: { x: 0,   y: 0.95 } }, 300, 1.2);
  fireMixedSizes({ ...base,  angle: 120, origin: { x: 1,   y: 0.95 } }, 300, 1.2);
  fireMixedSizes({ ...base,  spread: 130, startVelocity: 160, angle: 90, origin: { x: 0.5, y: 1 } }, 200, 1.2);
  setTimeout(() => {
    fireMixedSizes({ ...base2, angle: 65,  origin: { x: 0, y: 0.95 } }, 200, 0.9);
    fireMixedSizes({ ...base2, angle: 115, origin: { x: 1, y: 0.95 } }, 200, 0.9);
  }, 400);
  setTimeout(() => {
    fireMixedSizes({ ...base3, angle: 70,  origin: { x: 0, y: 0.95 } }, 150, 0.7);
    fireMixedSizes({ ...base3, angle: 110, origin: { x: 1, y: 0.95 } }, 150, 0.7);
  }, 850);
  setTimeout(() => {
    fireMixedSizes({ ...base3, spread: 110, startVelocity: 150, angle: 90, origin: { x: 0.5, y: 1 } }, 150, 0.7);
  }, 1300);
}

/** Bắn 2 bên giống bắt pháo (không có batch giữa) */
function fireConfettiSides(mult: number, gravity: number, opts: ConfettiOpts) {
  const { colors, shapes, ticks } = opts;
  const base = { spread: 110, startVelocity: 185, ticks, zIndex: 9999, shapes, colors, gravity };
  const fms = (o: any, count: number, s: number) => {
    fireMixedSizesHelper(mult, o, count, s, opts);
  };
  fms({ ...base, angle: 60, origin: { x: 0, y: 0.95 } }, 350, 1.2);
  fms({ ...base, angle: 120, origin: { x: 1, y: 0.95 } }, 350, 1.2);
  setTimeout(() => {
    fms({ ...base, angle: 65, startVelocity: 160, origin: { x: 0, y: 0.95 } }, 250, 0.9);
    fms({ ...base, angle: 115, startVelocity: 160, origin: { x: 1, y: 0.95 } }, 250, 0.9);
  }, 350);
  setTimeout(() => {
    fms({ ...base, angle: 70, startVelocity: 140, origin: { x: 0, y: 0.95 } }, 180, 0.7);
    fms({ ...base, angle: 110, startVelocity: 140, origin: { x: 1, y: 0.95 } }, 180, 0.7);
  }, 750);
}

/** Đổ từ trên xuống như mưa confetti */
function fireConfettiRain(mult: number, gravity: number, opts: ConfettiOpts) {
  const { colors, shapes, ticks, scale, ratios } = opts;
  // Giữ gravity tỷ lệ thuận với config tốc độ của người dùng để thay đổi theo lựa chọn, decay = 0.94 cho rơi tự nhiên hơn
  const base = { spread: 360, startVelocity: 8, ticks, zIndex: 9999, shapes, colors, gravity: gravity * 0.85, decay: 0.94 };
  
  const sum = Math.max(1, ratios.small + ratios.medium + ratios.large);
  const pSmall = ratios.small / sum;
  const pMedium = ratios.medium / sum;
  const pLarge = ratios.large / sum;

  // Bắn từ nhiều điểm trên đỉnh màn hình
  const origins = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];
  origins.forEach((x, i) => {
    setTimeout(() => {
      if (pMedium > 0) {
        confetti({ ...base, origin: { x, y: 0 }, particleCount: p(50 * pMedium, mult), scalar: 1.05 * scale });
      }
      if (pSmall > 0) {
        confetti({ ...base, origin: { x, y: 0 }, particleCount: p(50 * pSmall, mult), scalar: 0.6 * scale });
      }
      if (pLarge > 0) {
        confetti({ ...base, origin: { x, y: 0 }, particleCount: p(50 * pLarge, mult), scalar: 1.65 * scale });
      }
    }, i * 120);
  });
  setTimeout(() => {
    origins.forEach((x, i) => {
      setTimeout(() => {
        if (pMedium > 0) {
          confetti({ ...base, origin: { x, y: 0 }, particleCount: p(35 * pMedium, mult), scalar: 1.05 * scale });
        }
        if (pSmall > 0) {
          confetti({ ...base, origin: { x, y: 0 }, particleCount: p(35 * pSmall, mult), scalar: 0.6 * scale });
        }
      }, i * 100);
    });
  }, 900);
}

/** Bắn từ 2 góc dưới lên giống pháo hoa */
function fireConfettiCannon(mult: number, gravity: number, opts: ConfettiOpts) {
  const { colors, shapes, ticks } = opts;
  const base = { spread: 70, startVelocity: 200, ticks, zIndex: 9999, shapes, colors, gravity };
  const fms = (o: any, count: number, s: number) => {
    fireMixedSizesHelper(mult, o, count, s, opts);
  };
  fms({ ...base, angle: 75,  origin: { x: 0.05, y: 1 } }, 300, 1.3);
  fms({ ...base, angle: 105, origin: { x: 0.95, y: 1 } }, 300, 1.3);
  setTimeout(() => {
    fms({ ...base, angle: 80,  origin: { x: 0.05, y: 1 }, startVelocity: 170 }, 220, 1.0);
    fms({ ...base, angle: 100, origin: { x: 0.95, y: 1 }, startVelocity: 170 }, 220, 1.0);
  }, 400);
  setTimeout(() => {
    fms({ ...base, angle: 85,  origin: { x: 0.1,  y: 1 }, startVelocity: 150, spread: 50 }, 150, 0.8);
    fms({ ...base, angle: 95,  origin: { x: 0.9,  y: 1 }, startVelocity: 150, spread: 50 }, 150, 0.8);
  }, 900);
}

/** Bắn từ giữa dưới lên như fountain */
function fireConfettiCenterUp(mult: number, gravity: number, opts: ConfettiOpts) {
  const { colors, shapes, ticks } = opts;
  const base = { spread: 120, startVelocity: 200, ticks, zIndex: 9999, shapes, colors, gravity };
  const fms = (o: any, count: number, s: number) => {
    fireMixedSizesHelper(mult, o, count, s, opts);
  };
  fms({ ...base, angle: 90, origin: { x: 0.5, y: 1 } }, 400, 1.3);
  setTimeout(() => {
    fms({ ...base, angle: 85,  origin: { x: 0.35, y: 1 }, startVelocity: 170, spread: 90 }, 250, 1.0);
    fms({ ...base, angle: 95,  origin: { x: 0.65, y: 1 }, startVelocity: 170, spread: 90 }, 250, 1.0);
  }, 350);
  setTimeout(() => {
    fms({ ...base, angle: 90, origin: { x: 0.5, y: 1 }, startVelocity: 150, spread: 140 }, 200, 0.8);
  }, 800);
}

/** Bắn pháo hoa nổ ngẫu nhiên nhiều điểm trên màn hình */
function fireConfettiFireworks(mult: number, gravity: number, opts: ConfettiOpts) {
  const { colors, shapes, ticks, scale, ratios } = opts;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const count = 3 + Math.floor(Math.random() * 3); // 3 đến 5 quả pháo hoa nổ

  const sum = Math.max(1, ratios.small + ratios.medium + ratios.large);
  const pSmall = ratios.small / sum;
  const pMedium = ratios.medium / sum;
  const pLarge = ratios.large / sum;

  for (let i = 0; i < count; i++) {
    const delay = i * (100 + Math.random() * 150); // nổ so le từ 100ms - 250ms
    setTimeout(() => {
      const originX = W * (0.15 + Math.random() * 0.7);
      const originY = H * (0.15 + Math.random() * 0.45);
      
      const particleCount = Math.floor(p(80, mult));
      const base = {
        spread: 360,
        startVelocity: 25 + Math.random() * 15,
        ticks: Math.min(ticks, 280), // Pháo hoa nổ tan nhanh hơn chút
        zIndex: 9999,
        shapes,
        colors,
        gravity: gravity * 0.8,
        decay: 0.93,
        origin: { x: originX / W, y: originY / H }
      };
      
      if (pMedium > 0) {
        confetti({ ...base, particleCount: Math.floor(particleCount * pMedium), scalar: 1.05 * scale });
      }
      if (pSmall > 0) {
        confetti({ ...base, particleCount: Math.floor(particleCount * pSmall), scalar: 0.6 * scale });
      }
      if (pLarge > 0) {
        confetti({ ...base, particleCount: Math.floor(particleCount * pLarge), scalar: 1.65 * scale });
      }
    }, delay);
  }
}

/** Điều phối kiểu bắn confetti theo confettiType */
function dispatchConfetti(
  confettiType: string,
  mult: number,
  gravity: number,
  opts: ConfettiOpts,
  ribbonRef: React.MutableRefObject<string>,
  spawnWaveRibbons: () => void,
  spawnClassicRibbons: () => void,
  spawnSpiralRibbons: () => void,
) {
  // Spawn ribbons theo lựa chọn
  const ribbon = ribbonRef.current;
  if (ribbon === 'wave') spawnWaveRibbons();
  else if (ribbon === 'classic') spawnClassicRibbons();
  else if (ribbon === 'spiral') spawnSpiralRibbons();

  switch (confettiType) {
    case 'sides':     return fireConfettiSides(mult, gravity, opts);
    case 'rain':      return fireConfettiRain(mult, gravity, opts);
    case 'cannon':    return fireConfettiCannon(mult, gravity, opts);
    case 'center_up': return fireConfettiCenterUp(mult, gravity, opts);
    case 'fireworks': return fireConfettiFireworks(mult, gravity, opts);
    default:          return fireConfettiStandard(mult, gravity, opts);
  }
}


export function BackdropApp() {
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [layouts, setLayouts] = useState<BackdropTemplateMap | null>(null);
  const [layoutOverrides, setLayoutOverrides] = useState<Record<string, any>>({});
  const [backdropAspectRatio, setBackdropAspectRatio] = useState<BackdropAspectRatio>('16:9');
  const [onStage, setOnStage] = useState<Student | null>(null);
  const socketRef = useRef<SlideSocket | null>(null);
  const confettiEnabledRef = useRef(true);
  const confettiRepeatRef = useRef(true);
  const confettiBurstRef = useRef(false);
  const confettiAmountRef = useRef<string>('high');
  const confettiSpeedRef = useRef<string>('normal');
  const confettiTypeRef = useRef<string>('standard');
  const confettiRibbonRef = useRef<string>('wave');
  const confettiColorStyleRef = useRef<string>('gold');
  const confettiShapeRef = useRef<string>('star');
  const confettiTicksRef = useRef<string>('normal');
  const ribbonConfigRef = useRef({
    waveCount: 6,
    waveLength: 65,
    waveWidth: 2.5,
    waveDistance: 5,
    classicCount: 10,
    classicMin: 28,
    classicMax: 87,
    spiralCount: 10,
  });
  const confettiSizeConfigRef = useRef({
    scale: 1.0,
    small: 25,
    medium: 60,
    large: 15,
  });
  const ttsEnabledRef = useRef(true);
  const ttsModelRef = useRef('vieneu-NF');
  const ttsSpeedRef = useRef(1.0);
  const ttsSentencePrefixRef = useRef<string>('');
  const ttsTemplateRef = useRef<string>('');
  const ttsPlayModeRef = useRef<'realtime' | 'pregen' | 'pregen-fallback'>('pregen-fallback');
  const ttsDelayRef = useRef<number>(1.5);
  const ttsConditionsRef = useRef<any[]>([]);
  const customVariablesRef = useRef<any[]>([]);
  const lastConfettiCode = useRef<string | null>(null);
  const lastTtsTargetCodeRef = useRef<string | null>(null);
  // RAF-based timer cho confetti repeat
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FPS đo được để tính interval thích nghi
  const fpsRef = useRef(60);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ribbonsRef = useRef<any[]>([]);

  // Vòng lặp vẽ ruy băng (Canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;
    let lastFrameTime = performance.now();

    const update = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // duration = thời gian THỰC đã trôi qua từ frame trước (giây), không phải hằng số cố
      // định 0.02 (giả định 50fps đúng tuyệt đối). Máy chậm/nhiều hiệu ứng cùng lúc khiến FPS
      // tụt xuống 20-30 → nếu vẫn dùng 0.02 cố định, mô phỏng "chạy chậm hơn thời gian thực"
      // và animation trông giật cục. Clamp về [0, 0.05] để tránh bước nhảy quá lớn khi tab bị
      // treo/chuyển tab quay lại (delta có thể vọt lên vài giây).
      const now = performance.now();
      const rawDelta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      const frameDuration = Math.min(0.05, Math.max(0, rawDelta));

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeRibbons = ribbonsRef.current;
      if (activeRibbons.length > 0) {
        for (let i = activeRibbons.length - 1; i >= 0; i--) {
          const r = activeRibbons[i];

          if (r.isClassic) {
            const duration = frameDuration;

            if (r.isSpiral) {
              // Ribbon xoắn lò xo: Dùng history-trace cải tiến hữu cơ tự nhiên
              r.time += duration * r.spiralSpeed;

              // Trục tâm của lò xo tịnh tiến ngang theo vận tốc drift gió thổi
              r.centerX += (r.driftX || 0) * duration;

              // Nhịp rơi dọc nhấp nhô nhè nhẹ (tạo hiệu ứng đàn hồi co giãn lò xo dọc)
              const currentYSpeed = r.ySpeed * (1 + Math.sin(r.time * 0.6) * 0.22);
              r.position.y += currentYSpeed * duration;

              // Trục tâm của dải lò xo đung đưa qua lại (sway) theo gió ngang nhẹ
              const swayX = Math.sin(r.time * 0.35) * 24;

              // Bán kính lò xo co thắt "thở" tự nhiên (radius breathing) tạo chuyển động xoay 3D sinh động
              const currentRadius = r.spiralRadius * (0.8 + Math.cos(r.time * 1.1) * 0.2);
              r.position.x = r.centerX + swayX + Math.sin(r.time) * currentRadius;

              // Đưa toạ độ hiện tại vào đầu lịch sử
              r.history.unshift({ x: r.position.x, y: r.position.y });

              const historyLength = r.particles.length * r.step;
              if (r.history.length > historyLength) {
                r.history.pop();
              }

              // Áp đặt vị trí các hạt trôi theo lịch sử di chuyển của đầu ruy băng
              for (let j = 0; j < r.particles.length; j++) {
                const idx = Math.min(r.history.length - 1, j * r.step);
                r.particles[j].position = { x: r.history[idx].x, y: r.history[idx].y };
              }
            } else {
              // Ribbon classic: Dùng Euler Physics và Constraint khoảng cách
              r.time += duration * r.oscillationSpeed;
              r.position.y += r.ySpeed * duration;
              // Tịnh tiến ngang theo gió (driftX) kết hợp uốn lượn
              r.position.x += ((r.driftX || 0) + Math.cos(r.time) * r.oscillationDistance) * duration;
              r.particles[0].position = { x: r.position.x, y: r.position.y };

              const dX = r.prevPosition.x - r.position.x;
              const dY = r.prevPosition.y - r.position.y;
              const delta = Math.sqrt(dX * dX + dY * dY);
              r.prevPosition = { x: r.position.x, y: r.position.y };

              for (let j = 1; j < r.particles.length; j++) {
                const dirP = subtractNew(r.particles[j - 1].position, r.particles[j].position);
                normVec(dirP);
                multVec(dirP, (delta / duration) * r.velocityInherit);
                addForce(r.particles[j], dirP);
              }

              for (let j = 1; j < r.particles.length; j++) {
                integrateEuler(r.particles[j], duration);
              }

              const dist = r.particleDist;
              for (let j = 1; j < r.particles.length; j++) {
                const rp2 = { x: r.particles[j].position.x, y: r.particles[j].position.y };
                subVec(rp2, r.particles[j - 1].position);
                normVec(rp2);
                multVec(rp2, dist);
                addVec(rp2, r.particles[j - 1].position);
                r.particles[j].position = rp2;
              }
            }

            r.age += 1;
            if (r.age > r.maxAge) {
              activeRibbons.splice(i, 1);
              continue;
            }

            ctx.save();
            const fadeStart = r.maxAge * 0.7;
            ctx.globalAlpha = r.age > fadeStart ? (r.maxAge - r.age) / (r.maxAge - fadeStart) : 1;

            ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 2;

            for (let j = 0; j < r.particles.length - 1; j++) {
              const pCurr = r.particles[j].position;
              const pNext = r.particles[j + 1].position;
              const pCurrOffset = { x: pCurr.x + r.xOffset, y: pCurr.y + r.yOffset };
              const pNextOffset = { x: pNext.x + r.xOffset, y: pNext.y + r.yOffset };

              // Xác định mặt xoắn để đổi màu giữa frontColor và backColor
              const sideVal = (pCurr.x - pNext.x) * (pNextOffset.y - pNext.y) - (pCurr.y - pNext.y) * (pNextOffset.x - pNext.x);
              if (sideVal < 0) {
                ctx.fillStyle = r.frontColor;
                ctx.strokeStyle = r.frontColor;
              } else {
                ctx.fillStyle = r.backColor;
                ctx.strokeStyle = r.backColor;
              }

              ctx.lineWidth = 1;
              ctx.lineJoin = 'round';

              if (j === 0) {
                // Tip
                ctx.beginPath();
                ctx.moveTo(pCurr.x, pCurr.y);
                ctx.lineTo(pNext.x, pNext.y);
                ctx.lineTo((pNext.x + pNextOffset.x) * 0.5, (pNext.y + pNextOffset.y) * 0.5);
                ctx.closePath();
                ctx.fill(); ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(pNextOffset.x, pNextOffset.y);
                ctx.lineTo(pCurrOffset.x, pCurrOffset.y);
                ctx.lineTo((pNext.x + pNextOffset.x) * 0.5, (pNext.y + pNextOffset.y) * 0.5);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
              } else if (j === r.particles.length - 2) {
                // Tail
                ctx.beginPath();
                ctx.moveTo(pCurr.x, pCurr.y);
                ctx.lineTo(pNext.x, pNext.y);
                ctx.lineTo((pCurr.x + pCurrOffset.x) * 0.5, (pCurr.y + pCurrOffset.y) * 0.5);
                ctx.closePath();
                ctx.fill(); ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(pNextOffset.x, pNextOffset.y);
                ctx.lineTo(pCurrOffset.x, pCurrOffset.y);
                ctx.lineTo((pCurr.x + pCurrOffset.x) * 0.5, (pCurr.y + pCurrOffset.y) * 0.5);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
              } else {
                // Body
                ctx.beginPath();
                ctx.moveTo(pCurr.x, pCurr.y);
                ctx.lineTo(pNext.x, pNext.y);
                ctx.lineTo(pNextOffset.x, pNextOffset.y);
                ctx.lineTo(pCurrOffset.x, pCurrOffset.y);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
              }
            }
            ctx.restore();
            continue;
          }

          r.time += 1;
          r.speed *= r.friction;

          // Xoắn lượn ngẫu nhiên tạo đường cong tự nhiên
          if (Math.random() < 0.03) {
            r.targetAngularVelocity = (Math.random() - 0.5) * 0.25;
          }
          r.angularVelocity += (r.targetAngularVelocity - r.angularVelocity) * 0.05;
          r.angle += r.angularVelocity + Math.sin(r.time * r.waveSpeed) * r.waveAmp;

          r.vx = Math.cos(r.angle) * r.speed;
          r.vy = Math.sin(r.angle) * r.speed + r.gravity;

          r.x += r.vx;
          r.y += r.vy;

          r.points.push({ x: r.x, y: r.y });
          if (r.points.length > r.maxLength) {
            r.points.shift();
          }

          r.age += 1;
          if (r.age > r.maxAge) {
            activeRibbons.splice(i, 1);
            continue;
          }

          if (r.points.length < 2) continue;

          ctx.save();
          // Fade out dần dần qua toàn bộ nửa sau vòng đời (từ 50% tuổi thọ trở đi)
          const fadeStart = r.maxAge * 0.5;
          ctx.globalAlpha = r.age > fadeStart ? (r.maxAge - r.age) / (r.maxAge - fadeStart) : 1;

          // Đổ bóng mảnh hơn cho ruy băng nổi bật 3D
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;

          // Vẽ thân ruy băng màu vàng/ánh kim
          ctx.beginPath();
          ctx.moveTo(r.points[0].x, r.points[0].y);
          for (let p = 1; p < r.points.length; p++) {
            ctx.lineTo(r.points[p].x, r.points[p].y);
          }

          ctx.strokeStyle = r.color;
          ctx.lineWidth = r.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Vẽ một dải sáng màu trắng mảnh đè lên tạo độ bóng óng ánh
          ctx.shadowColor = 'transparent';
          ctx.beginPath();
          ctx.moveTo(r.points[0].x, r.points[0].y);
          for (let p = 1; p < r.points.length; p++) {
            ctx.lineTo(r.points[p].x, r.points[p].y);
          }
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = r.width * 0.25;
          ctx.globalAlpha = ctx.globalAlpha * 0.4;
          ctx.stroke();

          ctx.restore();
        }
      }
      animationFrameId = requestAnimationFrame(update);
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [ceremony]);

  // Setup hàm spawn ribbons toàn cục để gọi từ ngoài
  useEffect(() => {
    // Wave ribbon (hiện tại): bay lượn theo đường cong
    (window as any).__spawnRibbons = () => {
      if (ribbonsRef.current.length >= MAX_CONCURRENT_RIBBONS) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      // Dùng màu từ colorStyle hiện tại
      const colors = COLOR_PRESETS[confettiColorStyleRef.current] ?? COLOR_PRESETS.gold;
      const newRibbons: any[] = [];

      // Tính tỷ lệ tốc độ từ config (normal = 0.75 gravity)
      const speedMultiplier = (SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.75) / 0.75;

      const conf = ribbonConfigRef.current;
      const baseTicks = TICKS_MAP[confettiTicksRef.current] ?? 320;
      const gravBase = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.85;
      const ticksCount = Math.floor(baseTicks * (0.85 / gravBase));
      console.log('[Backdrop] spawnWaveRibbons config:', conf);
      const waveCount = typeof conf?.waveCount === 'number' ? conf.waveCount : 6;
      const leftCount = Math.ceil(waveCount / 2);
      const rightCount = Math.floor(waveCount / 2);
      const waveWidth = typeof conf?.waveWidth === 'number' ? conf.waveWidth : 2.5;
      const waveLength = typeof conf?.waveLength === 'number' ? conf.waveLength : 65;
      const waveDistance = typeof conf?.waveDistance === 'number' ? conf.waveDistance : 5;

      const friction = 0.985 + (waveDistance * 0.001);
      const baseSpeed = (3.0 + waveDistance * 1.5) * speedMultiplier;

      // Góc phóng nông hơn một chút (-Math.PI/5 tức khoảng -36 độ) để ruy băng bay lướt ngang đẹp mắt hơn
      for (let i = 0; i < leftCount; i++) {
        const angle = -Math.PI / 5 + (Math.random() - 0.5) * 0.25;
        const speed = baseSpeed * (0.8 + Math.random() * 0.4);
        const maxLength = Math.floor(waveLength * (0.85 + Math.random() * 0.3));
        newRibbons.push({
          points: [{ x: 0, y: H * 0.95 }],
          x: 0, y: H * 0.95,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          width: waveWidth * (0.8 + Math.random() * 0.4),
          color: colors[Math.floor(Math.random() * colors.length)],
          maxLength,
          age: 0,
          // Tuổi thọ động tỉ lệ với chiều dài dải và ticks cấu hình
          maxAge: Math.max(ticksCount, Math.floor(maxLength * 2.0)) + Math.floor(Math.random() * (ticksCount * 0.3)),
          angle, angularVelocity: 0, targetAngularVelocity: 0, speed,
          friction, // Sử dụng friction động
          gravity: (0.03 + Math.random() * 0.015) * speedMultiplier, // Tăng nhẹ trọng lực
          time: 0,
          waveSpeed: (0.03 + Math.random() * 0.0375) * speedMultiplier, // Tần số vẫy sóng
          waveAmp: 0.012 + Math.random() * 0.015,
        });
      }

      // Bắn từ bên phải
      for (let i = 0; i < rightCount; i++) {
        const angle = (-Math.PI * 4) / 5 + (Math.random() - 0.5) * 0.25;
        const speed = baseSpeed * (0.8 + Math.random() * 0.4);
        const maxLength = Math.floor(waveLength * (0.85 + Math.random() * 0.3));
        newRibbons.push({
          points: [{ x: W, y: H * 0.95 }],
          x: W, y: H * 0.95,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          width: waveWidth * (0.8 + Math.random() * 0.4),
          color: colors[Math.floor(Math.random() * colors.length)],
          maxLength,
          age: 0,
          maxAge: Math.max(ticksCount, Math.floor(maxLength * 2.0)) + Math.floor(Math.random() * (ticksCount * 0.3)),
          angle, angularVelocity: 0, targetAngularVelocity: 0, speed,
          friction, // Sử dụng friction động
          gravity: (0.03 + Math.random() * 0.015) * speedMultiplier,
          time: 0,
          waveSpeed: (0.03 + Math.random() * 0.0375) * speedMultiplier,
          waveAmp: 0.012 + Math.random() * 0.015,
        });
      }

      ribbonsRef.current = [...ribbonsRef.current, ...newRibbons];
    };

    // Classic ribbon: dải xoắn gập khúc rơi từ trên xuống
    (window as any).__spawnClassicRibbons = () => {
      if (ribbonsRef.current.length >= MAX_CONCURRENT_RIBBONS) return;
      const W = window.innerWidth;
      const colors = COLOR_PRESETS[confettiColorStyleRef.current] ?? COLOR_PRESETS.gold;
      const newRibbons: any[] = [];
      const conf = ribbonConfigRef.current;
      const baseTicks = TICKS_MAP[confettiTicksRef.current] ?? 320;
      const gravBase = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.85;
      const ticksCount = Math.floor(baseTicks * (0.85 / gravBase));
      console.log('[Backdrop] spawnClassicRibbons config:', conf);
      const classicCount = typeof conf?.classicCount === 'number' ? conf.classicCount : 8;
      const minL = typeof conf?.classicMin === 'number' ? conf.classicMin : 28;
      const maxL = typeof conf?.classicMax === 'number' ? conf.classicMax : 87;
      
      const speedMultiplier = (SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.75) / 0.75;

      for (let i = 0; i < classicCount; i++) {
        const x = W * (0.05 + Math.random() * 0.9);
        const y = -50 - Math.random() * 850;
        
        // Tính toán số hạt ngẫu nhiên phân bố đều trong khoảng [minL, maxL]
        // Đơn vị ở đây là "số khớp nối/số đoạn" của ruy băng.
        const range = Math.max(1, maxL - minL);
        const particleCount = Math.floor(minL + Math.random() * (range + 1));
        
        const particles: EulerMass[] = [];
        const drag = 0.05;
        const mass = 1.0;
        const dist = 7.5 + Math.random() * 1.5;
        
        for (let j = 0; j < particleCount; j++) {
          particles.push(createEulerMass(x, y - j * dist, mass, drag));
        }

        const c1 = colors[Math.floor(Math.random() * colors.length)];
        let c2 = colors[Math.floor(Math.random() * colors.length)];
        if (c1 === c2 && colors.length > 1) {
          c2 = colors[(colors.indexOf(c1) + 1) % colors.length];
        }

        const width = 7.0 + Math.random() * 3.0;
        const angleRad = 45 * Math.PI / 180;
        const driftX = (Math.random() - 0.5) * 50 * speedMultiplier; // Drift ngang ngẫu nhiên

        newRibbons.push({
          isClassic: true,
          position: { x, y },
          prevPosition: { x, y },
          xOffset: Math.cos(angleRad) * width,
          yOffset: Math.sin(angleRad) * width,
          velocityInherit: (2.4 + Math.random() * 1.2) * speedMultiplier,
          time: Math.random() * 100,
          oscillationSpeed: (2.0 + Math.random() * 1.5) * speedMultiplier,
          oscillationDistance: 22 + Math.random() * 12,
          ySpeed: (80 + Math.random() * 40) * speedMultiplier,
          driftX,
          frontColor: c1,
          backColor: c2,
          particles,
          particleDist: dist,
          age: 0,
          maxAge: ticksCount + Math.floor(Math.random() * (ticksCount * 0.4)),
          width,
        });
      }
      ribbonsRef.current = [...ribbonsRef.current, ...newRibbons];
    };

    // Spiral ribbon: dải xoắn lò xo 3D tròn đều rơi thẳng đứng
    (window as any).__spawnSpiralRibbons = () => {
      if (ribbonsRef.current.length >= MAX_CONCURRENT_RIBBONS) return;
      const W = window.innerWidth;
      const colors = COLOR_PRESETS[confettiColorStyleRef.current] ?? COLOR_PRESETS.gold;
      const newRibbons: any[] = [];
      const conf = ribbonConfigRef.current;
      const count = typeof conf?.spiralCount === 'number' ? conf.spiralCount : (7 + Math.floor(Math.random() * 4));
      const baseTicks = TICKS_MAP[confettiTicksRef.current] ?? 320;
      const gravBase = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.85;
      const ticksCount = Math.floor(baseTicks * (0.85 / gravBase));

      const speedMultiplier = (SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.75) / 0.75;

      for (let i = 0; i < count; i++) {
        const centerX = W * (0.05 + Math.random() * 0.9);
        const y = -50 - Math.random() * 850;

        const particleCount = 35 + Math.floor(Math.random() * 15);
        const particles: EulerMass[] = [];
        const drag = 0.05;
        const mass = 1.0;
        const dist = 7.0 + Math.random() * 1.5;

        for (let j = 0; j < particleCount; j++) {
          particles.push(createEulerMass(centerX, y - j * dist, mass, drag));
        }

        const c1 = colors[Math.floor(Math.random() * colors.length)];
        let c2 = colors[Math.floor(Math.random() * colors.length)];
        if (c1 === c2 && colors.length > 1) {
          c2 = colors[(colors.indexOf(c1) + 1) % colors.length];
        }

        const width = 8.0 + Math.random() * 3.0;
        const angleRad = 45 * Math.PI / 180;

        const time = Math.random() * 100;
        const spiralSpeed = (16.25 + Math.random() * 6.25) * speedMultiplier;
        const spiralRadius = 15 + Math.random() * 10;
        const ySpeed = (187.5 + Math.random() * 50) * speedMultiplier;
        const driftX = (Math.random() - 0.5) * 90 * speedMultiplier; // Drift ngang ngẫu nhiên

        const step = 4;
        const history: { x: number; y: number }[] = [];
        const historyLength = particleCount * step;

        for (let k = 0; k < historyLength; k++) {
          const tDelay = k * 0.02;
          const timeK = time - tDelay * spiralSpeed;
          const yK = y - (k / step) * dist;
          const xK = centerX + Math.sin(timeK) * spiralRadius;
          history.push({ x: xK, y: yK });
        }

        newRibbons.push({
          isClassic: true,
          isSpiral: true,
          centerX,
          position: { x: centerX, y },
          prevPosition: { x: centerX, y },
          xOffset: Math.cos(angleRad) * width,
          yOffset: Math.sin(angleRad) * width,
          velocityInherit: 0,
          time,
          spiralSpeed,
          spiralRadius,
          ySpeed,
          driftX,
          frontColor: c1,
          backColor: c2,
          particles,
          particleDist: dist,
          age: 0,
          maxAge: ticksCount + Math.floor(Math.random() * (ticksCount * 0.4)),
          width,
          history,
          step,
        });
      }
      ribbonsRef.current = [...ribbonsRef.current, ...newRibbons];
    };

    return () => {
      delete (window as any).__spawnRibbons;
      delete (window as any).__spawnClassicRibbons;
      delete (window as any).__spawnSpiralRibbons;
    };
  }, []);

  // Đo FPS thực tế liên tục để tính interval confetti thích nghi theo tốc độ máy
  useEffect(() => {
    let frames = 0;
    let lastTime = performance.now();
    let rafId: number;
    const measure = () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fpsRef.current = Math.max(5, frames);
        frames = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
      confetti.reset();
    };
  }, []);

  useEffect(() => {
    let socket: SlideSocket | null = null;
    window.slide.getMeta().then((meta) => {
      setCeremony(meta.ceremony);

      if (meta.ceremony?.backdrops_config) {
        fetch(resolveAsset(meta.ceremony.backdrops_config))
          .then((r) => r.json())
          .then((data: BackdropTemplateMap) => setLayouts(data))
          .catch(() => setLayouts(null));
      }

      // Khởi động warmup TTS để nạp model vào RAM
      window.slide
        .warmupTts()
        .then(() => console.log('[Backdrop] Warmup TTS thành công.'))
        .catch((err) => console.error('[Backdrop] Lỗi warmup TTS:', err));

      const port = meta.config?.ws_port ?? 8765;
      socket = createSocket(port);
      socketRef.current = socket;

      // Lên lịch bắn confetti lặp lại, interval thích nghi theo FPS đo được.
      // Mỗi lần gọi scheduleNextConfetti sẽ set 1 timeout mới; khi timeout kích hoạt
      // sẽ bắn batch tiếp và gọi lại scheduleNextConfetti — tự dừng khi repeat tắt.
      const scheduleNextConfetti = () => {
        if (!confettiRepeatRef.current || !confettiEnabledRef.current) return;
        const baseTicks = TICKS_MAP[confettiTicksRef.current] ?? 320;
        const gravBase = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.85;
        const ticksCount = Math.floor(baseTicks * (0.85 / gravBase));
        const intervalMs = Math.max(
          4000,
          ((ticksCount * REPEAT_OVERLAP) / fpsRef.current) * 1000,
        );
        confettiTimerRef.current = setTimeout(() => {
          confettiTimerRef.current = null;
          if (!confettiRepeatRef.current || !confettiEnabledRef.current) return;
          const mult = AMOUNT_MULTIPLIER[confettiAmountRef.current] ?? 1.0;
          const gravity = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.75;
          const opts: ConfettiOpts = {
            colors: COLOR_PRESETS[confettiColorStyleRef.current] ?? COLOR_PRESETS.gold,
            shapes: resolveShapes(confettiShapeRef.current),
            ribbonRef: confettiRibbonRef,
            ticks: ticksCount,
            scale: confettiSizeConfigRef.current.scale,
            ratios: {
              small: confettiSizeConfigRef.current.small,
              medium: confettiSizeConfigRef.current.medium,
              large: confettiSizeConfigRef.current.large,
            },
          };
          if (confettiBurstRef.current) {
            // Khi bắn bổ sung (burst = true): Bắn với số lượng nhẹ hơn (mult * 0.45)
            // nhưng cùng kiểu bắn nâng cao (Type) đã chọn, và không spawn thêm ribbon.
            dispatchConfetti(
              confettiTypeRef.current, mult * 0.45, gravity, opts,
              confettiRibbonRef,
              () => {}, // Bỏ qua spawn wave ribbon trên burst lặp lại
              () => {}, // Bỏ qua spawn classic ribbon trên burst lặp lại
              () => {}, // Bỏ qua spawn spiral ribbon trên burst lặp lại
            );
          } else {
            dispatchConfetti(
              confettiTypeRef.current, mult, gravity, opts,
              confettiRibbonRef,
              () => (window as any).__spawnRibbons?.(),
              () => (window as any).__spawnClassicRibbons?.(),
              () => (window as any).__spawnSpiralRibbons?.(),
            );
          }
          scheduleNextConfetti();
        }, intervalMs);
      };

      const handleStudent = (student: Student | null, withConfetti: boolean) => {
        setOnStage(student);

        const isNewStudent = student?.student_code !== lastConfettiCode.current;
        console.log(
          '[Backdrop] handleStudent:',
          student?.student_code,
          'withConfetti:',
          withConfetti,
          'isNewStudent:',
          isNewStudent,
        );

        if (isNewStudent) {
          // Dọn dẹp timer confetti của sinh viên cũ
          if (confettiTimerRef.current) {
            clearTimeout(confettiTimerRef.current);
            confettiTimerRef.current = null;
          }
          confetti.reset();
          ribbonsRef.current = [];
        }

        if (!student) {
          stopPcm();
          lastTtsTargetCodeRef.current = null;
        }

        if (student && isNewStudent) {
          if (confettiEnabledRef.current) {
            // Bắn ngay đợt đầu tiên sau 300ms
            setTimeout(() => {
              const mult = AMOUNT_MULTIPLIER[confettiAmountRef.current] ?? 1.0;
              const gravity = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.75;
              const baseTicks = TICKS_MAP[confettiTicksRef.current] ?? 320;
              const gravBase = SPEED_GRAVITY[confettiSpeedRef.current] ?? 0.85;
              const ticksCount = Math.floor(baseTicks * (0.85 / gravBase));
              const opts: ConfettiOpts = {
                colors: COLOR_PRESETS[confettiColorStyleRef.current] ?? COLOR_PRESETS.gold,
                shapes: resolveShapes(confettiShapeRef.current),
                ribbonRef: confettiRibbonRef,
                ticks: ticksCount,
                scale: confettiSizeConfigRef.current.scale,
                ratios: {
                  small: confettiSizeConfigRef.current.small,
                  medium: confettiSizeConfigRef.current.medium,
                  large: confettiSizeConfigRef.current.large,
                },
              };
              dispatchConfetti(
                confettiTypeRef.current, mult, gravity, opts,
                confettiRibbonRef,
                () => (window as any).__spawnRibbons?.(),
                () => (window as any).__spawnClassicRibbons?.(),
                () => (window as any).__spawnSpiralRibbons?.(),
              );
              // Sau khi bắn xong, lên lịch các lần tiếp theo (nếu repeat bật)
              scheduleNextConfetti();
            }, 300);
          }

          if (ttsEnabledRef.current) {
            const code = student.student_code;
            lastTtsTargetCodeRef.current = code;

            const speed = ttsSpeedRef.current ?? 1.0;
            const fallbackModel = ttsModelRef.current || 'vieneu-NF';
            const model = getVoiceForStudent(student, ttsConditionsRef.current, fallbackModel);
            const playMode = ttsPlayModeRef.current;

            // Build text từ template hoặc fallback sang prefix + tên
            const template = ttsTemplateRef.current;
            let textToSpeak: string;
            if (template) {
              textToSpeak = renderTemplate(template, student, customVariablesRef.current);
            } else {
              const prefix = (ttsSentencePrefixRef.current || '').trim();
              const fullName = student.full_name?.trim() || '';
              if (prefix) {
                const separator = /[.,!?;]$/.test(prefix) ? ' ' : ', ';
                textToSpeak = `${prefix}${separator}${fullName}`;
              } else {
                textToSpeak = fullName;
              }
            }

            const delayMs = (ttsDelayRef.current ?? 1.5) * 1000;

            const playTts = async () => {
              // Pregen path: thử phát từ file WAV đã tạo trước
              if (playMode !== 'realtime') {
                try {
                  console.log('[Backdrop] pregenGetAudio request code=', code);
                  const res = await window.slide.pregenGetAudio(code);
                  console.log('[Backdrop] pregenGetAudio response code=', code, 'ok=', res.ok, 'hasBuffer=', !!res.buffer, 'error=', res.error);
                  if (res.ok && res.buffer) {
                    if (lastTtsTargetCodeRef.current !== code) return;
                    // Skip WAV header 44 bytes, phát PCM 48kHz
                    console.log('[Backdrop] playPcm from pregen code=', code, 'pcmBytes=', res.buffer.slice(44).byteLength);
                    playPcm(res.buffer.slice(44), 48000);
                    return;
                  }
                } catch (err) {
                  console.warn('[Backdrop] pregenGetAudio error:', err);
                }
                // Nếu playMode === 'pregen' strict: không fallback
                if (playMode === 'pregen') {
                  console.log(
                    '[Backdrop] Pregen strict mode: bỏ qua vì chưa có file WAV cho',
                    code,
                  );
                  return;
                }
              }

              // Realtime synthesis (fallback hoặc playMode === 'realtime')
              if (playMode === 'realtime') {
                // Pre-synthesize để cache, giảm latency khi speak()
                console.log('[Backdrop] preSynthesizeTts request code=', code, 'textLen=', textToSpeak.length, 'model=', model, 'speed=', speed);
                window.slide.preSynthesizeTts([textToSpeak], model, [speed]);
              }

              try {
                console.log('[Backdrop] speak request code=', code, 'textLen=', textToSpeak.length, 'model=', model, 'speed=', speed, 'playMode=', playMode);
                const res = await window.slide.speak(textToSpeak, model, speed, code);
                console.log('[Backdrop] speak response code=', code, 'ok=', res.ok, 'hasBuffer=', !!res.buffer, 'sampleRate=', res.sampleRate, 'error=', res.error);
                if (!res.ok || !res.buffer) {
                  console.error('[Backdrop] Lỗi sinh giọng đọc:', res.error);
                  return;
                }
                if (lastTtsTargetCodeRef.current !== code) {
                  console.log('[Backdrop] Bỏ qua phát TTS do đã chuyển sinh viên khác');
                  return;
                }
                console.log('[Backdrop] playPcm from speak code=', code, 'bytes=', res.buffer.byteLength, 'sampleRate=', res.sampleRate ?? 48000);
                playPcm(res.buffer, res.sampleRate ?? 48000);
              } catch (err) {
                console.error('[Backdrop] Lỗi gọi speak API:', err);
              }
            };

            if (delayMs === 0) {
              playTts();
            } else {
              setTimeout(playTts, delayMs);
            }
          }
        }
        lastConfettiCode.current = student?.student_code ?? null;
      };

      socket.on('state:full', ({ onStage }) => handleStudent(onStage, false));
      socket.on('state:onStage', ({ student }) => handleStudent(student, true));
      socket.on('event:confetti', ({ enabled }) => {
        confettiEnabledRef.current = enabled;
      });
      socket.on('event:confettiRepeat', ({ repeat }) => {
        confettiRepeatRef.current = repeat;
        if (!repeat && confettiTimerRef.current) {
          clearTimeout(confettiTimerRef.current);
          confettiTimerRef.current = null;
        }
      });
      socket.on('event:confettiBurst', ({ burst }) => {
        confettiBurstRef.current = burst;
      });
      socket.on('event:confettiAmount', ({ amount }) => {
        confettiAmountRef.current = amount;
      });
      socket.on('event:confettiSpeed', ({ speed }) => {
        confettiSpeedRef.current = speed;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:confettiType', ({ confettiType }: { confettiType: string }) => {
        confettiTypeRef.current = confettiType;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:confettiRibbon', ({ ribbon }: { ribbon: string }) => {
        confettiRibbonRef.current = ribbon;
        // Cho ruy băng cũ biến mất nhanh
        ribbonsRef.current.forEach((r) => {
          if (r.age < r.maxAge - 30) r.maxAge = r.age + 30;
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:confettiColorStyle', ({ colorStyle }: { colorStyle: string }) => {
        confettiColorStyleRef.current = colorStyle;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:confettiShape', ({ shape }: { shape: string }) => {
        confettiShapeRef.current = shape;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:confettiTicks', ({ ticks }: { ticks: string }) => {
        confettiTicksRef.current = ticks;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:ribbonConfig', ({ config }: { config: any }) => {
        console.log('[Backdrop] Nhận event:ribbonConfig:', config);
        if (config) {
          ribbonConfigRef.current = { ...ribbonConfigRef.current, ...config };
          // Cho ruy băng cũ biến mất nhanh
          ribbonsRef.current.forEach((r) => {
            if (r.age < r.maxAge - 30) r.maxAge = r.age + 30;
          });
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:confettiSizeConfig', ({ config }: { config: any }) => {
        if (config) confettiSizeConfigRef.current = { ...confettiSizeConfigRef.current, ...config };
      });
      socket.on('event:tts', ({ enabled }) => {
        ttsEnabledRef.current = enabled;
      });
      socket.on('event:ttsModel', ({ model }) => {
        ttsModelRef.current = model;
      });
      socket.on('event:ttsSpeed', ({ speed }) => {
        ttsSpeedRef.current = speed;
      });
      socket.on('event:ttsSentencePrefix', ({ prefix }) => {
        ttsSentencePrefixRef.current = prefix;
      });
      socket.on('event:ttsTemplate', ({ template }) => {
        ttsTemplateRef.current = template;
      });
      socket.on('event:ttsPlayMode', ({ playMode }) => {
        ttsPlayModeRef.current = playMode;
      });
      socket.on('event:ttsConditions', ({ conditions }) => {
        ttsConditionsRef.current = conditions;
      });
      socket.on('event:customVariables', ({ variables }) => {
        customVariablesRef.current = variables;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on('event:ttsDelay', ({ delay }: { delay: number }) => {
        ttsDelayRef.current = delay;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).on(
        'event:layoutOverrides',
        ({ overrides }: { overrides: Record<string, any> }) => {
          setLayoutOverrides(overrides || {});
        },
      );
      socket.on('event:backdropAspectRatio', ({ aspectRatio }) => {
        setBackdropAspectRatio(aspectRatio);
      });
      socket.on('connect', () => socket?.emit('state:request'));
    });
    return () => {
      socket?.disconnect();
    };
  }, []);

  const key = useMemo(() => onStage?.student_code ?? 'idle', [onStage]);

  if (!ceremony) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        Đang tải…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 99999,
        }}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full w-full"
        >
          <BackdropView
            student={onStage}
            ceremony={ceremony}
            layouts={layouts}
            layoutOverrides={layoutOverrides}
            resolveAsset={resolveAsset}
            idle={!onStage}
            aspectRatio={backdropAspectRatio}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

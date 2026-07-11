import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';

// ─── Types / Constants ────────────────────────────────────────────────────────

const CONFETTI_TYPES = [
  { value: 'standard',  icon: '🎉', labelKey: 'confettiModal.type.standard' },
  { value: 'sides',     icon: '↔️', labelKey: 'confettiModal.type.sides' },
  { value: 'rain',      icon: '🌧️', labelKey: 'confettiModal.type.rain' },
  { value: 'cannon',    icon: '💥', labelKey: 'confettiModal.type.cannon' },
  { value: 'center_up', icon: '⛲', labelKey: 'confettiModal.type.centerUp' },
  { value: 'fireworks', icon: '🎆', labelKey: 'confettiModal.type.fireworks' },
] as const;

const RIBBON_TYPES = [
  { value: 'none',    icon: '🚫', labelKey: 'confettiModal.ribbon.none' },
  { value: 'wave',    icon: '〰️', labelKey: 'confettiModal.ribbon.wave' },
  { value: 'classic', icon: '🎀', labelKey: 'confettiModal.ribbon.classic' },
  { value: 'spiral',  icon: '🌀', labelKey: 'confettiModal.ribbon.spiral' },
] as const;

type ColorPreset = {
  value: string;
  labelKey: string;
  colors: string[];
  icon: string;
};

const COLOR_PRESETS: ColorPreset[] = [
  { value: 'colorful', labelKey: 'confettiModal.color.colorful', icon: '🌈', colors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94'] },
  { value: 'gold',     labelKey: 'confettiModal.color.gold',     icon: '✨', colors: ['#FFDF00', '#FFE5A3', '#FFF871', '#D4AF37', '#FFC107'] },
  { value: 'silver',   labelKey: 'confettiModal.color.silver',   icon: '🤍', colors: ['#C0C0C0', '#E8E8E8', '#A8A9AD', '#D3D3D3', '#B8B8B8'] },
  { value: 'pink',     labelKey: 'confettiModal.color.pink',     icon: '🩷', colors: ['#FF69B4', '#FFB6C1', '#FF1493', '#FFC0CB', '#FF85C8'] },
  { value: 'green',    labelKey: 'confettiModal.color.green',    icon: '💚', colors: ['#00C851', '#ADFF2F', '#00E676', '#69F0AE', '#00BFA5'] },
  { value: 'blue',     labelKey: 'confettiModal.color.blue',     icon: '💙', colors: ['#2196F3', '#87CEEB', '#1565C0', '#64B5F6', '#0288D1'] },
  { value: 'red',      labelKey: 'confettiModal.color.red',      icon: '❤️', colors: ['#FF1744', '#FF6B6B', '#D50000', '#FF5252', '#F44336'] },
  { value: 'purple',   labelKey: 'confettiModal.color.purple',   icon: '💜', colors: ['#9C27B0', '#E040FB', '#7B1FA2', '#CE93D8', '#BA68C8'] },
];

const SHAPES = [
  { value: 'star',    icon: '⭐', labelKey: 'confettiModal.shape.star' },
  { value: 'default', icon: '🎊', labelKey: 'confettiModal.shape.mixed' },
  { value: 'circle',  icon: '⚪', labelKey: 'confettiModal.shape.circle' },
  { value: 'square',  icon: '⬜', labelKey: 'confettiModal.shape.square' },
] as const;

const AMOUNT_OPTIONS = [
  { value: 'very_low',  labelKey: 'confettiModal.amount.veryLow' },
  { value: 'low',       labelKey: 'confettiModal.amount.low' },
  { value: 'medium',    labelKey: 'confettiModal.amount.medium' },
  { value: 'high',      labelKey: 'confettiModal.amount.high' },
  { value: 'very_high', labelKey: 'confettiModal.amount.veryHigh' },
];

const SPEED_OPTIONS = [
  { value: 'very_slow', labelKey: 'confettiModal.speed.verySlow' },
  { value: 'slow',      labelKey: 'confettiModal.speed.slow' },
  { value: 'normal',    labelKey: 'confettiModal.speed.normal' },
  { value: 'fast',      labelKey: 'confettiModal.speed.fast' },
  { value: 'very_fast', labelKey: 'confettiModal.speed.veryFast' },
];

const TICKS_OPTIONS = [
  { value: 'short',     labelKey: 'confettiModal.ticks.short' },
  { value: 'normal',    labelKey: 'confettiModal.ticks.normal' },
  { value: 'long',      labelKey: 'confettiModal.ticks.long' },
  { value: 'very_long', labelKey: 'confettiModal.ticks.veryLong' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompactSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function ColorSwatchMini({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-0.5 overflow-hidden rounded-[3px] h-2.5 w-full mt-1">
      {colors.slice(0, 4).map((c, i) => (
        <div key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ConfettiModal() {
  const { t } = useTranslation();
  const socket = useSocketRef();
  const open = useControlStore((s) => s.confettiModalOpen);
  const setOpen = useControlStore((s) => s.setConfettiModalOpen);

  const enabled = useControlStore((s) => s.confettiEnabled);
  const repeat = useControlStore((s) => s.confettiRepeat);
  const burst = useControlStore((s) => s.confettiBurst);
  const amount = useControlStore((s) => s.confettiAmount);
  const speed = useControlStore((s) => s.confettiSpeed);
  const confettiTicks = useControlStore((s) => s.confettiTicks);

  const confettiType = useControlStore((s) => s.confettiType);
  const confettiRibbon = useControlStore((s) => s.confettiRibbon);
  const confettiColorStyle = useControlStore((s) => s.confettiColorStyle);
  const confettiShape = useControlStore((s) => s.confettiShape);
  const ribbonConfig = useControlStore((s) => s.ribbonConfig);
  const confettiSizeConfig = useControlStore((s) => s.confettiSizeConfig);

  const {
    setConfettiEnabled,
    setConfettiRepeat,
    setConfettiBurst,
    setConfettiAmount,
    setConfettiSpeed,
    setConfettiTicks,
    setRibbonConfig,
    setConfettiSizeConfig,
    setConfettiType,
    setConfettiRibbon,
    setConfettiColorStyle,
    setConfettiShape,
  } = useControlStore();

  const overlayRef = useRef<HTMLDivElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Đóng khi bấm ra ngoài modal
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current === e.target) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  // Đóng khi bấm Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  const emit = <K extends string>(ev: K, payload: object) =>
    (socket.current as any)?.emit(ev, payload);

  const toggle = (next: boolean) => {
    setConfettiEnabled(next);
    emit('cmd:setConfetti', { enabled: next });
  };
  const toggleRepeat = (next: boolean) => {
    setConfettiRepeat(next);
    emit('cmd:setConfettiRepeat', { repeat: next });
  };
  const toggleBurst = (next: boolean) => {
    setConfettiBurst(next);
    emit('cmd:setConfettiBurst', { burst: next });
  };
  const changeAmount = (next: string) => {
    setConfettiAmount(next);
    emit('cmd:setConfettiAmount', { amount: next });
  };
  const changeSpeed = (next: string) => {
    setConfettiSpeed(next);
    emit('cmd:setConfettiSpeed', { speed: next });
  };
  const changeTicks = (next: string) => {
    setConfettiTicks(next);
    emit('cmd:setConfettiTicks', { ticks: next });
  };

  const changeType = (v: string) => {
    setConfettiType(v);
    emit('cmd:setConfettiType', { confettiType: v });
  };
  const changeRibbon = (v: string) => {
    setConfettiRibbon(v);
    emit('cmd:setConfettiRibbon', { ribbon: v });
  };
  const changeColorStyle = (v: string) => {
    setConfettiColorStyle(v);
    emit('cmd:setConfettiColorStyle', { colorStyle: v });
  };
  const changeShape = (v: string) => {
    setConfettiShape(v);
    emit('cmd:setConfettiShape', { shape: v });
  };

  const updateRibbonConfig = (config: Partial<typeof ribbonConfig>) => {
    setRibbonConfig(config);
    emit('cmd:setRibbonConfig', { config });
  };

  const updateSizeConfig = (config: Partial<typeof confettiSizeConfig>) => {
    setConfettiSizeConfig(config);
    emit('cmd:setConfettiSizeConfig', { config });
  };

  const handleReset = () => {
    setConfettiEnabled(true);
    emit('cmd:setConfetti', { enabled: true });

    setConfettiRepeat(true);
    emit('cmd:setConfettiRepeat', { repeat: true });

    setConfettiBurst(false);
    emit('cmd:setConfettiBurst', { burst: false });

    setConfettiAmount('high');
    emit('cmd:setConfettiAmount', { amount: 'high' });

    setConfettiSpeed('normal');
    emit('cmd:setConfettiSpeed', { speed: 'normal' });

    setConfettiTicks('normal');
    emit('cmd:setConfettiTicks', { ticks: 'normal' });

    setConfettiType('standard');
    emit('cmd:setConfettiType', { confettiType: 'standard' });

    setConfettiRibbon('wave');
    emit('cmd:setConfettiRibbon', { ribbon: 'wave' });

    const defaultRibbon = {
      waveCount: 6,
      waveLength: 65,
      waveWidth: 2.5,
      waveDistance: 5,
      classicCount: 10,
      classicMin: 28,
      classicMax: 87,
    };
    setRibbonConfig(defaultRibbon);
    emit('cmd:setRibbonConfig', { config: defaultRibbon });

    setConfettiColorStyle('gold');
    emit('cmd:setConfettiColorStyle', { colorStyle: 'gold' });

    setConfettiShape('star');
    emit('cmd:setConfettiShape', { shape: 'star' });

    const defaultSize = {
      scale: 1.0,
      small: 25,
      medium: 60,
      large: 15,
    };
    setConfettiSizeConfig(defaultSize);
    emit('cmd:setConfettiSizeConfig', { config: defaultSize });
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
    >
      {/* w-full max-w-[640px] rộng rãi thoáng đãng — đủ chỗ cho grid 3-4 cột ở phần nâng cao */}
      <div className="relative flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        
        {/* Header rút gọn */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-sm font-bold text-foreground">{t('confettiModal.title')}</h2>
              <p className="text-[10px] text-muted-foreground">{t('confettiModal.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body thu gọn khoảng cách, dùng gap nhỏ */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          <div className="flex flex-col gap-4">

            {/* Bật/tắt — luôn hiện đầu tiên */}
            <section className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-foreground">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggle(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-indigo-600 cursor-pointer"
                />
                <span>{t('confettiModal.enableEffect')} 🎉</span>
              </label>
            </section>

            {/* ── CƠ BẢN: Kiểu bắn + Màu sắc — luôn hiện ──────────────── */}
            <section className={!enabled ? 'opacity-30 pointer-events-none' : ''}>
              <CompactSectionTitle>🚀 {t('confettiModal.section.shootType')}</CompactSectionTitle>
              <div className="grid grid-cols-3 gap-1.5">
                {CONFETTI_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => changeType(ct.value)}
                    className={[
                      'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-center transition-all',
                      confettiType === ct.value
                        ? 'border-primary bg-primary/70 font-semibold text-primary text-xs shadow-sm shadow-primary/20'
                        : 'border-border bg-muted hover:bg-card text-foreground text-xs',
                    ].join(' ')}
                  >
                    <span>{ct.icon}</span>
                    <span>{t(ct.labelKey)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className={!enabled ? 'opacity-30 pointer-events-none' : ''}>
              <CompactSectionTitle>🎨 {t('confettiModal.section.colors')}</CompactSectionTitle>
              <div className="grid grid-cols-4 gap-1.5">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => changeColorStyle(p.value)}
                    className={[
                      'flex flex-col items-center rounded-lg border p-1.5 transition-all text-left',
                      confettiColorStyle === p.value
                        ? 'border-primary bg-primary/70 shadow-sm'
                        : 'border-border bg-muted hover:bg-card',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-center text-[11px] font-semibold text-foreground leading-none w-full">
                      <span className="truncate">{t(p.labelKey)}</span>
                    </div>
                    <ColorSwatchMini colors={p.colors} />
                  </button>
                ))}
              </div>
            </section>

            {/* ── Ngăn kéo Nâng cao ────────────────────────────────────── */}
            <section className={!enabled ? 'opacity-30 pointer-events-none' : ''}>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
              >
                <span>⚙️ {t('confettiModal.advanced.toggle')}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {t('confettiModal.advanced.toggleHint')}
                </span>
                <ChevronDown
                  size={14}
                  className={`ml-auto transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
              </button>
            </section>

            {showAdvanced && (
              <div className={`flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3 ${!enabled ? 'opacity-30 pointer-events-none' : ''}`}>

                {/* Lặp lại / Bắn bổ sung */}
                <section>
                  <CompactSectionTitle>🔁 {t('confettiModal.section.repeat')}</CompactSectionTitle>
                  <div className="flex items-center gap-4">
                    <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={repeat}
                        onChange={(e) => toggleRepeat(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border accent-indigo-600 cursor-pointer"
                      />
                      <span>{t('confettiModal.repeat.auto')}</span>
                    </label>

                    {repeat && (
                      <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={burst}
                          onChange={(e) => toggleBurst(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border accent-indigo-600 cursor-pointer"
                        />
                        <span>{t('confettiModal.repeat.burstHint')}</span>
                      </label>
                    )}
                  </div>
                </section>

                {/* Cường độ / Tốc độ / Thời gian tồn tại */}
                <section>
                  <CompactSectionTitle>🎚️ {t('confettiModal.section.amountSpeed')}</CompactSectionTitle>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.field.amount')}</span>
                        <span className="text-primary">
                          {t(AMOUNT_OPTIONS.find((o) => o.value === amount)?.labelKey ?? 'confettiModal.amount.medium')}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={1}
                        value={AMOUNT_OPTIONS.findIndex((o) => o.value === amount)}
                        onChange={(e) => changeAmount(AMOUNT_OPTIONS[+e.target.value].value)}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>

                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.field.speed')}</span>
                        <span className="text-primary">
                          {t(SPEED_OPTIONS.find((o) => o.value === speed)?.labelKey ?? 'confettiModal.speed.normal')}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={1}
                        value={SPEED_OPTIONS.findIndex((o) => o.value === speed)}
                        onChange={(e) => changeSpeed(SPEED_OPTIONS[+e.target.value].value)}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>

                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.field.ticks')}</span>
                        <span className="text-primary">
                          {t(TICKS_OPTIONS.find((o) => o.value === confettiTicks)?.labelKey ?? 'confettiModal.ticks.normal')}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={1}
                        value={TICKS_OPTIONS.findIndex((o) => o.value === confettiTicks)}
                        onChange={(e) => changeTicks(TICKS_OPTIONS[+e.target.value].value)}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>
                  </div>
                </section>

                {/* Ribbon */}
                <section>
                  <CompactSectionTitle>🎀 {t('confettiModal.section.ribbon')}</CompactSectionTitle>
                  <div className="grid grid-cols-4 gap-1.5">
                    {RIBBON_TYPES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => changeRibbon(r.value)}
                        className={[
                          'flex items-center justify-center gap-1 rounded-lg border py-1.5 text-center transition-all',
                          confettiRibbon === r.value
                            ? 'border-primary bg-primary/70 font-semibold text-primary text-[11px] shadow-sm'
                            : 'border-border bg-muted hover:bg-card text-foreground text-[11px]',
                        ].join(' ')}
                      >
                        <span>{r.icon}</span>
                        <span>{t(r.labelKey)}</span>
                      </button>
                    ))}
                  </div>

                  {/* Cấu hình chi tiết riêng cho từng kiểu Ribbon */}
                  {confettiRibbon === 'wave' && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/60 p-2.5 grid grid-cols-4 gap-2.5">
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.wave.count')}</span>
                          <span className="text-primary font-semibold">{t('confettiModal.wave.countValue', { count: ribbonConfig.waveCount })}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          step={1}
                          value={ribbonConfig.waveCount}
                          onChange={(e) => updateRibbonConfig({ waveCount: +e.target.value })}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.wave.length')}</span>
                          <span className="text-primary font-semibold">{ribbonConfig.waveLength}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={350}
                          step={1}
                          value={ribbonConfig.waveLength}
                          onChange={(e) => updateRibbonConfig({ waveLength: +e.target.value })}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.wave.width')}</span>
                          <span className="text-primary font-semibold">{ribbonConfig.waveWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min={1.0}
                          max={6.0}
                          step={0.5}
                          value={ribbonConfig.waveWidth}
                          onChange={(e) => updateRibbonConfig({ waveWidth: +e.target.value })}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.wave.range')}</span>
                          <span className="text-primary font-semibold">{t('confettiModal.wave.rangeValue', { level: ribbonConfig.waveDistance ?? 5 })}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={ribbonConfig.waveDistance ?? 5}
                          onChange={(e) => updateRibbonConfig({ waveDistance: +e.target.value })}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                    </div>
                  )}

                  {confettiRibbon === 'classic' && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/60 p-2.5 grid grid-cols-3 gap-2.5">
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.classic.count')}</span>
                          <span className="text-primary font-semibold">{t('confettiModal.classic.countValue', { count: ribbonConfig.classicCount })}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={18}
                          step={1}
                          value={ribbonConfig.classicCount}
                          onChange={(e) => updateRibbonConfig({ classicCount: +e.target.value })}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.classic.min')}</span>
                          <span className="text-primary font-semibold">{ribbonConfig.classicMin}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={120}
                          step={1}
                          value={ribbonConfig.classicMin}
                          onChange={(e) => {
                            const minVal = +e.target.value;
                            const maxVal = Math.max(minVal, ribbonConfig.classicMax);
                            updateRibbonConfig({ classicMin: minVal, classicMax: maxVal });
                          }}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.classic.max')}</span>
                          <span className="text-primary font-semibold">{ribbonConfig.classicMax}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={200}
                          step={1}
                          value={ribbonConfig.classicMax}
                          onChange={(e) => {
                            const maxVal = +e.target.value;
                            const minVal = Math.min(maxVal, ribbonConfig.classicMin);
                            updateRibbonConfig({ classicMin: minVal, classicMax: maxVal });
                          }}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                    </div>
                  )}

                  {confettiRibbon === 'spiral' && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/60 p-2.5 grid grid-cols-1 gap-2.5">
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                          <span>{t('confettiModal.spiral.count')}</span>
                          <span className="text-primary font-semibold">{t('confettiModal.spiral.countValue', { count: ribbonConfig.spiralCount ?? 10 })}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          step={1}
                          value={ribbonConfig.spiralCount ?? 10}
                          onChange={(e) => updateRibbonConfig({ spiralCount: +e.target.value })}
                          className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                        />
                      </div>
                    </div>
                  )}

                </section>

                {/* Hình dạng hạt */}
                <section>
                  <CompactSectionTitle>✦ {t('confettiModal.section.shape')}</CompactSectionTitle>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SHAPES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => changeShape(s.value)}
                        className={[
                          'flex items-center justify-center gap-1 rounded-lg border py-1.5 text-center transition-all',
                          confettiShape === s.value
                            ? 'border-primary bg-primary/70 font-semibold text-primary text-[11px] shadow-sm'
                            : 'border-border bg-muted hover:bg-card text-foreground text-[11px]',
                        ].join(' ')}
                      >
                        <span>{s.icon}</span>
                        <span>{t(s.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Kích cỡ & Tỷ lệ hạt */}
                <section>
                  <CompactSectionTitle>📐 {t('confettiModal.section.size')}</CompactSectionTitle>
                  <div className="grid grid-cols-4 gap-3 bg-card border border-border/80 rounded-lg p-2.5">
                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.size.scale')}</span>
                        <span className="text-primary font-semibold">{confettiSizeConfig.scale}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.4}
                        max={2.0}
                        step={0.1}
                        value={confettiSizeConfig.scale}
                        onChange={(e) => updateSizeConfig({ scale: +e.target.value })}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>
                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.size.small')}</span>
                        <span className="text-primary font-semibold">{confettiSizeConfig.small}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={confettiSizeConfig.small}
                        onChange={(e) => updateSizeConfig({ small: +e.target.value })}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>
                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.size.medium')}</span>
                        <span className="text-primary font-semibold">{confettiSizeConfig.medium}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={confettiSizeConfig.medium}
                        onChange={(e) => updateSizeConfig({ medium: +e.target.value })}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>
                    <div>
                      <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase">
                        <span>{t('confettiModal.size.large')}</span>
                        <span className="text-primary font-semibold">{confettiSizeConfig.large}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={confettiSizeConfig.large}
                        onChange={(e) => updateSizeConfig({ large: +e.target.value })}
                        className="w-full accent-indigo-600 h-1 cursor-pointer bg-muted rounded-lg appearance-none"
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Footer nhỏ gọn */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-border px-4 py-2.5 bg-muted">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ⚙️ {t('confettiModal.resetDefault')}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

import type { LayoutVariant } from '@sky-app/slide-shared';

interface GridOverlayProps {
  variant: LayoutVariant | undefined;
  containerWidth: number;
  containerHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

const GRID_SIZE_PX = 20; // Grid 20px (canvas coordinates)
const GRID_COLOR = 'rgba(200, 200, 210, 0.15)';
const RULER_COLOR = 'rgba(200, 200, 210, 0.3)';
const RULER_HEIGHT = 20;
const RULER_WIDTH = 20;

export function GridOverlay({ variant, containerWidth, containerHeight, scale, offsetX, offsetY }: GridOverlayProps) {
  if (!variant) return null;

  // Refference dimensions (canvas coordinates)
  const refW = variant.refW;
  const refH = variant.refH;

  // Grid cell size in pixels (on screen)
  const gridStepScreen = GRID_SIZE_PX * scale;

  // Calculate grid start position relative to offset
  const gridStartX = ((offsetX % gridStepScreen) + gridStepScreen) % gridStepScreen;
  const gridStartY = ((offsetY % gridStepScreen) + gridStepScreen) % gridStepScreen;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Horizontal grid lines */}
      <svg
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: containerWidth,
          height: containerHeight,
        }}
        viewBox={`0 0 ${containerWidth} ${containerHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width={gridStepScreen} height={gridStepScreen} patternUnits="userSpaceOnUse" x={gridStartX} y={gridStartY}>
            <path d={`M ${gridStepScreen} 0 L 0 0 0 ${gridStepScreen}`} fill="none" stroke={GRID_COLOR} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={containerWidth} height={containerHeight} fill="url(#grid)" />
      </svg>

      {/* Ruler X */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: containerWidth,
          height: RULER_HEIGHT,
          background: 'rgba(255, 255, 255, 0.5)',
          borderBottom: `1px solid ${RULER_COLOR}`,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <svg style={{ width: containerWidth, height: RULER_HEIGHT }} preserveAspectRatio="none">
          {renderRulerMarks(containerWidth, gridStepScreen, gridStartX, RULER_HEIGHT, false)}
        </svg>
      </div>

      {/* Ruler Y */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: RULER_WIDTH,
          height: containerHeight,
          background: 'rgba(255, 255, 255, 0.5)',
          borderRight: `1px solid ${RULER_COLOR}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <svg style={{ width: RULER_WIDTH, height: containerHeight }} preserveAspectRatio="none">
          {renderRulerMarks(containerHeight, gridStepScreen, gridStartY, RULER_WIDTH, true)}
        </svg>
      </div>

      {/* Corner square */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: RULER_WIDTH,
          height: RULER_HEIGHT,
          background: 'rgba(255, 255, 255, 0.5)',
          borderRight: `1px solid ${RULER_COLOR}`,
          borderBottom: `1px solid ${RULER_COLOR}`,
        }}
      />
    </div>
  );
}

function renderRulerMarks(
  length: number,
  gridStepScreen: number,
  gridStart: number,
  rulerDim: number,
  isVertical: boolean
): React.ReactNode {
  const marks = [];
  const markSpacing = gridStepScreen;

  for (let pos = gridStart; pos < length; pos += markSpacing) {
    if (isVertical) {
      marks.push(
        <line key={pos} x1="0" y1={pos} x2={rulerDim * 0.6} y2={pos} stroke={RULER_COLOR} strokeWidth="1" />,
        <text
          key={`text-${pos}`}
          x={rulerDim * 0.1}
          y={pos + 10}
          fontSize="10"
          fill={RULER_COLOR}
          textAnchor="start"
          dominantBaseline="middle"
        >
          {Math.round(pos / markSpacing * GRID_SIZE_PX)}
        </text>
      );
    } else {
      marks.push(
        <line key={pos} x1={pos} y1="0" x2={pos} y2={rulerDim * 0.6} stroke={RULER_COLOR} strokeWidth="1" />,
        <text
          key={`text-${pos}`}
          x={pos}
          y={rulerDim * 0.75}
          fontSize="10"
          fill={RULER_COLOR}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {Math.round(pos / markSpacing * GRID_SIZE_PX)}
        </text>
      );
    }
  }

  return marks;
}

/** SVG icons transcribed verbatim from the Ischys design (viewBox 0 0 24 24). */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { size?: number; color: string; strokeWidth?: number };

const common = {
  fill: 'none' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PlusIcon({ size = 16, color, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function SearchIcon({ size = 13, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M21 21l-4-4" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function PlayIcon({ size = 16, color, strokeWidth = 2.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 4l14 8-14 8V4z" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function StarIcon({ size = 12, color, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1-6.3-4.6L5.7 21l2.3-7.1-6-4.5h7.6z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function HomeIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 10.5L12 3l9 7.5" stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M5 9.5V21h14V9.5" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function HistoryIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M12 7.5V12l3.5 2" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function ProfileIcon({ size = 24, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M4 21a8 8 0 0116 0" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function DumbbellIcon({ size = 30, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.5 6.5l11 11M4 9l-1.5-1.5a1.5 1.5 0 010-2l1-1a1.5 1.5 0 012 0L9 6M15 18l1.5 1.5a1.5 1.5 0 002 0l1-1a1.5 1.5 0 000-2L18 15"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

/** Wide down-chevron used by the header back button (viewBox 0 0 15 9). */
export function BackChevronIcon({ color, strokeWidth = 2.2 }: { color: string; strokeWidth?: number }) {
  return (
    <Svg width={15} height={9} viewBox="0 0 15 9">
      <Path d="M2 2l5.5 5L13 2" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function ReorderIcon({ size = 15, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function TrashIcon({ size = 15, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

/** Clock used in the per-exercise rest-timer row (hand at ~4-5 o'clock). */
export function ClockRowIcon({ size = 15, color, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={8} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M12 9.5V13l2.5 1.5M9 2h6" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

/** Clock icon with centered face (History empty-state hero). */
export function ClockCenteredIcon({ size = 30, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M12 7.5V12l3.5 2" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

/** Clock used in the resting bar (upright hands). */
export function ClockBarIcon({ size = 15, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={8} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M12 9v4l2 2M12 1h0M9 1h6" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 14, color, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

/** Cog/gear used by the Profile header settings button. */
export function SettingsIcon({ size = 18, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path
        d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function CheckIcon({ size = 18, color, strokeWidth = 3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function EditIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function CopyIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
      <Path
        d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

// --- Settings screen icons ---

export function BellIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function HapticIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x={7}
        y={3}
        width={10}
        height={18}
        rx={2}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Path d="M11 18h2" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function UnitsIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 7h18M3 12h18M3 17h18" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function ServerIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x={3}
        y={4}
        width={18}
        height={7}
        rx={1.5}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Rect
        x={3}
        y={13}
        width={18}
        height={7}
        rx={1.5}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Path
        d="M7 7.5h.01M7 16.5h.01"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function SyncIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 12a8 8 0 00-15-3M4 12a8 8 0 0015 3M8 17H4v4M16 7h4V3"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function UploadIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3v13M8 7l4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function DownloadIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3v13M8 12l4 4 4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function ShieldIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

export function CodeIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 6l-6 6 6 6M16 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

export function InfoIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} {...common} />
      <Path d="M12 11v5M12 8h.01" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

/** Cylindrical database "cans" icon used by the Server & Sync detail screen. */
export function DatabaseIcon({ size = 20, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6zM4 10c0 1.7 3.6 3 8 3s8-1.3 8-3M4 14c0 1.7 3.6 3 8 3s8-1.3 8-3"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

/** Filled heart used for Apple Health surfaces (chip, HR overlay, hero). */
export function HeartFilledIcon({ size = 13, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 20.5C5.5 16 3 12.5 3 8.8 3 6 5.2 4 7.5 4c1.7 0 3.3 1 4.5 2.6C13.2 5 14.8 4 16.5 4 18.8 4 21 6 21 8.8c0 3.7-2.5 7.2-9 11.7z"
      />
    </Svg>
  );
}

/** Reset/rotate icon — used by the Server & Sync danger zone. */
export function ResetIcon({ size = 15, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-4M20 14a8 8 0 01-14 4"
        stroke={color}
        strokeWidth={strokeWidth}
        {...common}
      />
    </Svg>
  );
}

/** X close glyph used by sheet headers. */
export function CloseIcon({ size = 14, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={strokeWidth} {...common} />
    </Svg>
  );
}

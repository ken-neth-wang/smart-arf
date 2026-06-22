/**
 * SMART-ARF theme — mirrors the CSS variables in smart-arf-app.html (`:root`).
 * smart-arf-app.html is the single source of truth; keep these in sync.
 */
export const Colors = {
  primary: '#1a5fa8',
  primaryDark: '#134a85',
  primaryLight: '#e8f0fb',
  success: '#1a7a4a',
  successBg: '#e8f5ee',
  warning: '#b45309',
  warningBg: '#fef3c7',
  danger: '#c0392b',
  dangerBg: '#fde8e8',
  urgent: '#7c2d12',
  urgentBg: '#fde8e4',
  gray: '#6b7280',
  grayLight: '#f3f4f6',
  border: '#d1d5db',
  text: '#111827',
  textSecondary: '#4b5563',
  white: '#ffffff',
  bg: '#eef2f7',
  patientBannerBg: '#0f3d6e',
  symChecked: '#ddeafa',
  groupBadge: '#6366f1',
} as const;

/** Tier key → display color. Mirrors `lvlColor` map in the HTML. */
export const tierColor: Record<string, string> = {
  unlikely: Colors.success,
  possible: Colors.warning,
  likely: Colors.danger,
  urgent: Colors.urgent,
  chorea: Colors.urgent,
  incomplete: Colors.gray,
};

export const radius = 14;
export const tapHeight = 52;

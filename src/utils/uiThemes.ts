import { UiThemeId } from '../types';
import type { AppTab } from '../components/Header';

export interface ThemePaletteTokens {
  id: Exclude<UiThemeId, 'dynamic-auto'>;
  label: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;
  ring: string;
  canvas: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  headerBg: string;
  chartBar: string;
  chartCap: string;
  chartEmpty: string;
}

export interface UiThemeOption {
  id: UiThemeId;
  label: string;
  description: string;
  swatchHex: string;
  secondaryHex: string;
  isDynamic?: boolean;
}

const PALETTES: Record<Exclude<UiThemeId, 'dynamic-auto'>, ThemePaletteTokens> = {
  'ocean-blue': {
    id: 'ocean-blue',
    label: 'Samudra Biru',
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    secondary: '#0284C7',
    accentSoft: '#EFF6FF',
    accentBorder: '#BFDBFE',
    accentText: '#1E40AF',
    ring: 'rgba(37, 99, 235, 0.18)',
    canvas: '#F3F7FC',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFD',
    border: '#DCE6F3',
    headerBg: 'rgba(255, 255, 255, 0.94)',
    chartBar: '#2563EB',
    chartCap: '#94A3B8',
    chartEmpty: '#DBEAFE',
  },
  'emerald-forest': {
    id: 'emerald-forest',
    label: 'Zamrud Edukasi',
    primary: '#059669',
    primaryHover: '#047857',
    secondary: '#10B981',
    accentSoft: '#ECFDF5',
    accentBorder: '#A7F3D0',
    accentText: '#065F46',
    ring: 'rgba(5, 150, 105, 0.18)',
    canvas: '#F2F9F6',
    surface: '#FFFFFF',
    surfaceAlt: '#F7FCF9',
    border: '#D5EAE0',
    headerBg: 'rgba(255, 255, 255, 0.94)',
    chartBar: '#059669',
    chartCap: '#94A3B8',
    chartEmpty: '#D1FAE5',
  },
  'teal-nusantara': {
    id: 'teal-nusantara',
    label: 'Teal Nusantara',
    primary: '#0D9488',
    primaryHover: '#0F766E',
    secondary: '#06B6D4',
    accentSoft: '#F0FDFA',
    accentBorder: '#99F6E4',
    accentText: '#115E59',
    ring: 'rgba(13, 148, 136, 0.18)',
    canvas: '#F1F9F9',
    surface: '#FFFFFF',
    surfaceAlt: '#F6FCFC',
    border: '#CFE7E5',
    headerBg: 'rgba(255, 255, 255, 0.94)',
    chartBar: '#0D9488',
    chartCap: '#94A3B8',
    chartEmpty: '#CCFBF1',
  },
  'indigo-royal': {
    id: 'indigo-royal',
    label: 'Indigo Akademik',
    primary: '#4F46E5',
    primaryHover: '#4338CA',
    secondary: '#3B82F6',
    accentSoft: '#EEF2FF',
    accentBorder: '#C7D2FE',
    accentText: '#3730A3',
    ring: 'rgba(79, 70, 229, 0.18)',
    canvas: '#F4F5FC',
    surface: '#FFFFFF',
    surfaceAlt: '#F8F9FE',
    border: '#DDE1F5',
    headerBg: 'rgba(255, 255, 255, 0.94)',
    chartBar: '#4F46E5',
    chartCap: '#94A3B8',
    chartEmpty: '#E0E7FF',
  },
  'amber-senja': {
    id: 'amber-senja',
    label: 'Amber Hangat',
    primary: '#D97706',
    primaryHover: '#B45309',
    secondary: '#EA580C',
    accentSoft: '#FFFBEB',
    accentBorder: '#FDE68A',
    accentText: '#92400E',
    ring: 'rgba(217, 119, 6, 0.18)',
    canvas: '#FBF8F3',
    surface: '#FFFFFF',
    surfaceAlt: '#FDFBF7',
    border: '#ECE0CE',
    headerBg: 'rgba(255, 255, 255, 0.94)',
    chartBar: '#D97706',
    chartCap: '#94A3B8',
    chartEmpty: '#FEF3C7',
  },
  'crimson-merdeka': {
    id: 'crimson-merdeka',
    label: 'Merah Delima',
    primary: '#E11D48',
    primaryHover: '#BE123C',
    secondary: '#F97316',
    accentSoft: '#FFF1F2',
    accentBorder: '#FECDD3',
    accentText: '#9F1239',
    ring: 'rgba(225, 29, 72, 0.18)',
    canvas: '#FDF4F6',
    surface: '#FFFFFF',
    surfaceAlt: '#FEF9FA',
    border: '#F1D8DE',
    headerBg: 'rgba(255, 255, 255, 0.94)',
    chartBar: '#E11D48',
    chartCap: '#94A3B8',
    chartEmpty: '#FFE4E6',
  },
};

const TAB_THEME_MAP: Record<AppTab, Exclude<UiThemeId, 'dynamic-auto'>> = {
  dashboard: 'ocean-blue',
  circulation: 'teal-nusantara',
  seating: 'emerald-forest',
  students: 'indigo-royal',
  'manage-students': 'ocean-blue',
  rooms: 'amber-senja',
  schedule: 'crimson-merdeka',
  rules: 'indigo-royal',
  export: 'emerald-forest',
};

export const UI_THEME_OPTIONS: UiThemeOption[] = [
  {
    id: 'dynamic-auto',
    label: 'Dinamis Adaptif',
    description: 'Warna berganti otomatis sesuai menu aktif',
    swatchHex: '#2563EB',
    secondaryHex: '#10B981',
    isDynamic: true,
  },
  {
    id: 'ocean-blue',
    label: 'Samudra Biru',
    description: 'Biru safir tegas & profesional',
    swatchHex: PALETTES['ocean-blue'].primary,
    secondaryHex: PALETTES['ocean-blue'].secondary,
  },
  {
    id: 'emerald-forest',
    label: 'Zamrud Edukasi',
    description: 'Hijau zamrud segar & nyaman',
    swatchHex: PALETTES['emerald-forest'].primary,
    secondaryHex: PALETTES['emerald-forest'].secondary,
  },
  {
    id: 'teal-nusantara',
    label: 'Teal Nusantara',
    description: 'Biru-hijau modern & cerah',
    swatchHex: PALETTES['teal-nusantara'].primary,
    secondaryHex: PALETTES['teal-nusantara'].secondary,
  },
  {
    id: 'indigo-royal',
    label: 'Indigo Akademik',
    description: 'Indigo klasik berwibawa',
    swatchHex: PALETTES['indigo-royal'].primary,
    secondaryHex: PALETTES['indigo-royal'].secondary,
  },
  {
    id: 'amber-senja',
    label: 'Amber Hangat',
    description: 'Nuansa hangat amber & senja',
    swatchHex: PALETTES['amber-senja'].primary,
    secondaryHex: PALETTES['amber-senja'].secondary,
  },
  {
    id: 'crimson-merdeka',
    label: 'Merah Delima',
    description: 'Merah delima energik & tegas',
    swatchHex: PALETTES['crimson-merdeka'].primary,
    secondaryHex: PALETTES['crimson-merdeka'].secondary,
  },
];

export function resolveThemeTokens(
  themeId: UiThemeId | undefined,
  activeTab: AppTab
): ThemePaletteTokens {
  const effectiveId: UiThemeId = themeId || 'dynamic-auto';
  if (effectiveId === 'dynamic-auto') {
    const mapped = TAB_THEME_MAP[activeTab] || 'ocean-blue';
    return PALETTES[mapped];
  }
  return PALETTES[effectiveId] || PALETTES['ocean-blue'];
}

export function applyThemeCssVars(tokens: ThemePaletteTokens): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-ui-theme', tokens.id);
  root.style.setProperty('--theme-primary', tokens.primary);
  root.style.setProperty('--theme-primary-hover', tokens.primaryHover);
  root.style.setProperty('--theme-secondary', tokens.secondary);
  root.style.setProperty('--theme-accent-soft', tokens.accentSoft);
  root.style.setProperty('--theme-accent-border', tokens.accentBorder);
  root.style.setProperty('--theme-accent-text', tokens.accentText);
  root.style.setProperty('--theme-ring', tokens.ring);
  root.style.setProperty('--theme-canvas', tokens.canvas);
  root.style.setProperty('--theme-surface', tokens.surface);
  root.style.setProperty('--theme-surface-alt', tokens.surfaceAlt);
  root.style.setProperty('--theme-border', tokens.border);
  root.style.setProperty('--theme-header-bg', tokens.headerBg);
}

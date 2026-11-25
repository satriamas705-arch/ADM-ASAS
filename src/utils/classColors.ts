export interface ClassColorTheme {
  id: string;
  label: string;
  // Static Tailwind utility classes for UI preview & print (no inline styles needed)
  headerBgClass: string;
  headerTextClass: string;
  cardBgClass: string;
  borderClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  seatBoxBgClass: string;
  seatBoxTextClass: string;
  swatchClass: string;
  accentTextClass: string;
  // RGB tuples for jsPDF vector rendering
  headerBgRgb: [number, number, number];
  headerTextRgb: [number, number, number];
  cardBgRgb: [number, number, number];
  borderRgb: [number, number, number];
  badgeBgRgb: [number, number, number];
  badgeTextRgb: [number, number, number];
  seatBoxBgRgb: [number, number, number];
  seatBoxTextRgb: [number, number, number];
}

export const CLASS_COLOR_PRESETS: ClassColorTheme[] = [
  {
    id: 'blue',
    label: 'Biru',
    headerBgClass: 'bg-blue-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-blue-50',
    borderClass: 'border-blue-400',
    badgeBgClass: 'bg-blue-100',
    badgeTextClass: 'text-blue-950',
    seatBoxBgClass: 'bg-blue-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-blue-600',
    accentTextClass: 'text-blue-900',
    headerBgRgb: [29, 78, 216],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [239, 246, 255],
    borderRgb: [96, 165, 250],
    badgeBgRgb: [219, 234, 254],
    badgeTextRgb: [23, 37, 84],
    seatBoxBgRgb: [30, 64, 175],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'emerald',
    label: 'Hijau',
    headerBgClass: 'bg-emerald-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-400',
    badgeBgClass: 'bg-emerald-100',
    badgeTextClass: 'text-emerald-950',
    seatBoxBgClass: 'bg-emerald-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-emerald-600',
    accentTextClass: 'text-emerald-900',
    headerBgRgb: [4, 120, 87],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [236, 253, 245],
    borderRgb: [52, 211, 153],
    badgeBgRgb: [209, 250, 229],
    badgeTextRgb: [2, 44, 34],
    seatBoxBgRgb: [6, 95, 70],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'amber',
    label: 'Kuning Emas',
    headerBgClass: 'bg-amber-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-amber-50',
    borderClass: 'border-amber-400',
    badgeBgClass: 'bg-amber-100',
    badgeTextClass: 'text-amber-950',
    seatBoxBgClass: 'bg-amber-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-amber-500',
    accentTextClass: 'text-amber-900',
    headerBgRgb: [180, 83, 9],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [255, 251, 235],
    borderRgb: [251, 191, 36],
    badgeBgRgb: [254, 243, 199],
    badgeTextRgb: [69, 26, 3],
    seatBoxBgRgb: [146, 64, 14],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'rose',
    label: 'Merah',
    headerBgClass: 'bg-rose-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-rose-50',
    borderClass: 'border-rose-400',
    badgeBgClass: 'bg-rose-100',
    badgeTextClass: 'text-rose-950',
    seatBoxBgClass: 'bg-rose-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-rose-600',
    accentTextClass: 'text-rose-900',
    headerBgRgb: [190, 18, 60],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [255, 241, 242],
    borderRgb: [251, 113, 133],
    badgeBgRgb: [255, 228, 230],
    badgeTextRgb: [76, 5, 25],
    seatBoxBgRgb: [159, 18, 57],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'violet',
    label: 'Ungu',
    headerBgClass: 'bg-violet-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-violet-50',
    borderClass: 'border-violet-400',
    badgeBgClass: 'bg-violet-100',
    badgeTextClass: 'text-violet-950',
    seatBoxBgClass: 'bg-violet-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-violet-600',
    accentTextClass: 'text-violet-900',
    headerBgRgb: [109, 40, 217],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [245, 243, 255],
    borderRgb: [167, 139, 250],
    badgeBgRgb: [237, 233, 254],
    badgeTextRgb: [46, 16, 101],
    seatBoxBgRgb: [91, 33, 182],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'cyan',
    label: 'Biru Cyan',
    headerBgClass: 'bg-cyan-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-cyan-50',
    borderClass: 'border-cyan-400',
    badgeBgClass: 'bg-cyan-100',
    badgeTextClass: 'text-cyan-950',
    seatBoxBgClass: 'bg-cyan-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-cyan-600',
    accentTextClass: 'text-cyan-900',
    headerBgRgb: [14, 116, 144],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [236, 254, 255],
    borderRgb: [34, 211, 238],
    badgeBgRgb: [207, 250, 254],
    badgeTextRgb: [8, 51, 68],
    seatBoxBgRgb: [21, 94, 117],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'orange',
    label: 'Oranye',
    headerBgClass: 'bg-orange-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-orange-50',
    borderClass: 'border-orange-400',
    badgeBgClass: 'bg-orange-100',
    badgeTextClass: 'text-orange-950',
    seatBoxBgClass: 'bg-orange-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-orange-600',
    accentTextClass: 'text-orange-900',
    headerBgRgb: [194, 65, 12],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [255, 247, 237],
    borderRgb: [251, 146, 60],
    badgeBgRgb: [255, 237, 213],
    badgeTextRgb: [67, 20, 7],
    seatBoxBgRgb: [154, 52, 18],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'indigo',
    label: 'Indigo',
    headerBgClass: 'bg-indigo-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-indigo-50',
    borderClass: 'border-indigo-400',
    badgeBgClass: 'bg-indigo-100',
    badgeTextClass: 'text-indigo-950',
    seatBoxBgClass: 'bg-indigo-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-indigo-600',
    accentTextClass: 'text-indigo-900',
    headerBgRgb: [67, 56, 202],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [238, 242, 255],
    borderRgb: [129, 140, 248],
    badgeBgRgb: [224, 231, 255],
    badgeTextRgb: [30, 27, 75],
    seatBoxBgRgb: [55, 48, 163],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'lime',
    label: 'Hijau Limau',
    headerBgClass: 'bg-lime-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-lime-50',
    borderClass: 'border-lime-500',
    badgeBgClass: 'bg-lime-100',
    badgeTextClass: 'text-lime-950',
    seatBoxBgClass: 'bg-lime-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-lime-600',
    accentTextClass: 'text-lime-900',
    headerBgRgb: [77, 124, 15],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [247, 254, 231],
    borderRgb: [132, 204, 22],
    badgeBgRgb: [236, 252, 203],
    badgeTextRgb: [26, 46, 5],
    seatBoxBgRgb: [63, 98, 18],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'fuchsia',
    label: 'Magenta',
    headerBgClass: 'bg-fuchsia-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-fuchsia-50',
    borderClass: 'border-fuchsia-400',
    badgeBgClass: 'bg-fuchsia-100',
    badgeTextClass: 'text-fuchsia-950',
    seatBoxBgClass: 'bg-fuchsia-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-fuchsia-600',
    accentTextClass: 'text-fuchsia-900',
    headerBgRgb: [162, 28, 175],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [253, 244, 255],
    borderRgb: [232, 121, 249],
    badgeBgRgb: [250, 232, 255],
    badgeTextRgb: [74, 4, 78],
    seatBoxBgRgb: [134, 25, 143],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'teal',
    label: 'Toska',
    headerBgClass: 'bg-teal-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-teal-50',
    borderClass: 'border-teal-400',
    badgeBgClass: 'bg-teal-100',
    badgeTextClass: 'text-teal-950',
    seatBoxBgClass: 'bg-teal-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-teal-600',
    accentTextClass: 'text-teal-900',
    headerBgRgb: [15, 118, 110],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [240, 253, 250],
    borderRgb: [45, 212, 191],
    badgeBgRgb: [204, 251, 241],
    badgeTextRgb: [4, 47, 46],
    seatBoxBgRgb: [17, 94, 89],
    seatBoxTextRgb: [255, 255, 255],
  },
  {
    id: 'slate',
    label: 'Abu Gelap',
    headerBgClass: 'bg-slate-700',
    headerTextClass: 'text-white',
    cardBgClass: 'bg-slate-50',
    borderClass: 'border-slate-400',
    badgeBgClass: 'bg-slate-200',
    badgeTextClass: 'text-slate-950',
    seatBoxBgClass: 'bg-slate-800',
    seatBoxTextClass: 'text-white',
    swatchClass: 'bg-slate-600',
    accentTextClass: 'text-slate-900',
    headerBgRgb: [51, 65, 85],
    headerTextRgb: [255, 255, 255],
    cardBgRgb: [248, 250, 252],
    borderRgb: [148, 163, 184],
    badgeBgRgb: [226, 232, 240],
    badgeTextRgb: [15, 23, 42],
    seatBoxBgRgb: [30, 41, 59],
    seatBoxTextRgb: [255, 255, 255],
  },
];

const PRESET_BY_ID = new Map<string, ClassColorTheme>(
  CLASS_COLOR_PRESETS.map((preset) => [preset.id, preset])
);

/**
 * Returns a deterministic color map for all classes, respecting optional custom overrides.
 */
export function buildClassColorMap(
  orderedClasses: string[],
  customClassColors?: Record<string, string>
): Record<string, ClassColorTheme> {
  const map: Record<string, ClassColorTheme> = {};
  orderedClasses.forEach((cls, idx) => {
    const customId = customClassColors?.[cls];
    const customPreset = customId ? PRESET_BY_ID.get(customId) : undefined;
    map[cls] = customPreset || CLASS_COLOR_PRESETS[idx % CLASS_COLOR_PRESETS.length];
  });
  return map;
}

/**
 * Gets the resolved color theme for a single class name.
 */
export function getClassColorTheme(
  className: string,
  orderedClasses: string[],
  customClassColors?: Record<string, string>
): ClassColorTheme {
  const key = className?.trim() || 'Tanpa Kelas';
  const customId = customClassColors?.[key];
  if (customId && PRESET_BY_ID.has(customId)) {
    return PRESET_BY_ID.get(customId)!;
  }
  const idx = orderedClasses.indexOf(key);
  if (idx >= 0) {
    return CLASS_COLOR_PRESETS[idx % CLASS_COLOR_PRESETS.length];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CLASS_COLOR_PRESETS[hash % CLASS_COLOR_PRESETS.length];
}

// Canonical preset indices per school grade level so single-card & batch PDFs always match
const CANONICAL_GRADE_PRESET_INDEX: Record<string, number> = {
  // SMA/SMK/MA (X, XI, XII / 10, 11, 12)
  X: 0, // Biru
  '10': 0,
  XI: 1, // Hijau
  '11': 1,
  XII: 2, // Kuning Emas
  '12': 2,
  XIII: 5, // Biru Cyan
  '13': 5,
  // SMP/MTs (VII, VIII, IX / 7, 8, 9)
  VII: 0, // Biru
  '7': 0,
  VIII: 1, // Hijau
  '8': 1,
  IX: 2, // Kuning Emas
  '9': 2,
  // SD/MI (I..VI / 1..6)
  I: 0, // Biru
  '1': 0,
  II: 1, // Hijau
  '2': 1,
  III: 2, // Kuning Emas
  '3': 2,
  IV: 3, // Merah
  '4': 3,
  V: 4, // Ungu
  '5': 4,
  VI: 10, // Toska
  '6': 10,
};

const GRADE_SORT_RANK: Record<string, number> = {
  '1': 1,
  I: 1,
  '2': 2,
  II: 2,
  '3': 3,
  III: 3,
  '4': 4,
  IV: 4,
  '5': 5,
  V: 5,
  '6': 6,
  VI: 6,
  '7': 7,
  VII: 7,
  '8': 8,
  VIII: 8,
  '9': 9,
  IX: 9,
  '10': 10,
  X: 10,
  '11': 11,
  XI: 11,
  '12': 12,
  XII: 12,
  '13': 13,
  XIII: 13,
};

/**
 * Extracts the grade level ("tingkat kelas") from a className string.
 * Examples:
 * - "X MIPA 1" -> "X"
 * - "XI IPA 2" -> "XI"
 * - "XII TKJ 1" -> "XII"
 * - "Kelas VII A" -> "VII"
 * - "8B" -> "8"
 * - "10-MIPA-1" -> "10"
 */
export function extractGradeLevel(className?: string): string {
  const raw = (className || '').trim();
  if (!raw) return 'Umum';

  // Strip optional leading "Kelas" / "Kls" / "Tingkat" label
  const stripped = raw.replace(/^(?:kelas|kls|tingkat)\s*[-.:/]?\s*/i, '').trim();
  const target = stripped || raw;

  // Check longest Roman numerals first (XII before XI/X, VIII before VII/V, etc.)
  const romanMatch = target.match(
    /^(XII|XIII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)(?=$|[\s\-._/()\d]|[A-Za-z](?:$|[\s\-._/\d]))/i
  );
  if (romanMatch) {
    return romanMatch[1].toUpperCase();
  }

  // Check leading numeric grade (1..13)
  const numMatch = target.match(/^(1[0-3]|[1-9])(?=$|[\s\-._/()A-Za-z])/);
  if (numMatch) {
    return numMatch[1];
  }

  // Fallback to first token
  const firstToken = target.split(/[\s\-._/]+/).filter(Boolean)[0];
  return firstToken ? firstToken.toUpperCase() : 'Umum';
}

/**
 * Returns unique grade levels present across students, ordered logically (1..13 / I..XIII then natural).
 */
export function getOrderedGradeLevels(
  students: { className?: string }[]
): string[] {
  const seen = new Set<string>();
  students.forEach((s) => {
    seen.add(extractGradeLevel(s.className));
  });
  return Array.from(seen).sort((a, b) => {
    const rankA = GRADE_SORT_RANK[a] ?? 999;
    const rankB = GRADE_SORT_RANK[b] ?? 999;
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Gets the deterministic color theme for a student's grade level ("tingkat kelas").
 * Ensures identical colors in single-card exports, room exports, and preview sheets.
 */
export function getGradeLevelColorTheme(
  classNameOrGrade?: string,
  customGradeColors?: Record<string, string>
): ClassColorTheme {
  const grade = extractGradeLevel(classNameOrGrade);
  const customId = customGradeColors?.[grade];
  if (customId && PRESET_BY_ID.has(customId)) {
    return PRESET_BY_ID.get(customId)!;
  }

  const canonicalIdx = CANONICAL_GRADE_PRESET_INDEX[grade];
  if (canonicalIdx !== undefined) {
    return CLASS_COLOR_PRESETS[canonicalIdx % CLASS_COLOR_PRESETS.length];
  }

  let hash = 0;
  for (let i = 0; i < grade.length; i += 1) {
    hash = (hash * 31 + grade.charCodeAt(i)) >>> 0;
  }
  return CLASS_COLOR_PRESETS[hash % CLASS_COLOR_PRESETS.length];
}

/**
 * Builds a grade-level -> ClassColorTheme map for all detected grade levels.
 */
export function buildGradeColorMap(
  orderedGrades: string[],
  customGradeColors?: Record<string, string>
): Record<string, ClassColorTheme> {
  const map: Record<string, ClassColorTheme> = {};
  orderedGrades.forEach((grade) => {
    map[grade] = getGradeLevelColorTheme(grade, customGradeColors);
  });
  return map;
}

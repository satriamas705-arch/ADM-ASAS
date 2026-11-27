import jsPDF, { GState } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Student,
  Room,
  ExamSettings,
  ExamScheduleItem,
  ExamDayGroup,
  DailyRoomJournalRecord,
  HandoverBeritaAcaraRecord,
  HandoverDirectionMode,
  PaperSize,
} from '../types';
import {
  buildRoomClassMatrix,
  buildCirculationSchedule,
  CirculationPattern,
} from './circulation';
import {
  AttendanceTarget,
  buildExamDayGroups,
  buildUniqueInvigilatorsSummary,
  resolveJournalRecord,
  resolveHandoverRecord,
  extractCityFromSettings,
  extractSignatureDateFromSettings,
  formatRoomNumberLabel,
  formatAttendanceTargetHeading,
  getStudentsForAttendanceTarget,
  getRoomDaySessionEntries,
  getRoomDaySessionInvigilator,
  getRoomDaySessionInvigilatorNip,
  getRoomDaySessionSummaryLabel,
  getSessionDisplayLabel,
  getScheduleRoomInvigilators,
  getOrderedClassNames,
  getOrderedClassNamesInRoom,
  getSchedulesForStudentCard,
} from './examDocuments';
import {
  getClassColorTheme,
  extractGradeLevel,
  getGradeLevelColorTheme,
} from './classColors';

const LINE_BLACK: [number, number, number] = [0, 0, 0];
const LINE_DARK: [number, number, number] = [15, 23, 42];
const BOX_BORDER_DARK: [number, number, number] = [51, 65, 85];
const GRID_LINE_WIDTH = 0.42;
const HEAD_LINE_WIDTH = 0.45;

export interface PaperSizeSpec {
  id: PaperSize;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm: number;
}

export const PAPER_SIZE_OPTIONS: Record<PaperSize, PaperSizeSpec> = {
  a4: {
    id: 'a4',
    label: 'A4 (210 × 297 mm)',
    shortLabel: 'A4',
    widthMm: 210,
    heightMm: 297,
  },
  f4: {
    id: 'f4',
    label: 'F4 / Folio (215 × 330 mm)',
    shortLabel: 'F4 / Folio',
    widthMm: 215,
    heightMm: 330,
  },
  legal: {
    id: 'legal',
    label: 'Legal (216 × 356 mm)',
    shortLabel: 'Legal',
    widthMm: 215.9,
    heightMm: 355.6,
  },
  letter: {
    id: 'letter',
    label: 'Letter / Kuarto (216 × 279 mm)',
    shortLabel: 'Letter',
    widthMm: 215.9,
    heightMm: 279.4,
  },
};

export function getPaperSizeSpec(paperSize?: PaperSize): PaperSizeSpec {
  return PAPER_SIZE_OPTIONS[paperSize || 'a4'] || PAPER_SIZE_OPTIONS.a4;
}

export function createPdfDoc(
  orientation: 'portrait' | 'landscape',
  settings?: Pick<ExamSettings, 'paperSize'>
): jsPDF {
  const spec = getPaperSizeSpec(settings?.paperSize);
  const format: [number, number] =
    orientation === 'landscape' ? [spec.heightMm, spec.widthMm] : [spec.widthMm, spec.heightMm];
  return new jsPDF({
    orientation,
    unit: 'mm',
    format,
  });
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const head = dataUrl.slice(0, 48).toLowerCase();
  if (head.includes('image/jpeg') || head.includes('image/jpg')) return 'JPEG';
  if (head.includes('image/webp')) return 'WEBP';
  return 'PNG';
}

function addImageSafe(
  doc: jsPDF,
  dataUrl: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (!dataUrl) return;
  try {
    doc.addImage(dataUrl, detectImageFormat(dataUrl), x, y, w, h);
  } catch {
    // Graceful fallback if image data cannot be decoded
  }
}

function renderPdfStampAndSignature(
  doc: jsPDF,
  settings: ExamSettings,
  role: 'headmaster' | 'committee',
  centerX: number,
  imageTopY: number,
  options?: { sigW?: number; sigH?: number; stampSize?: number }
): void {
  const sigW = options?.sigW ?? 32;
  const sigH = options?.sigH ?? 14.5;
  const stampSize = options?.stampSize ?? 27;

  const sigData =
    role === 'headmaster' ? settings.headmasterSignature : settings.committeeSignature;
  if (sigData) {
    addImageSafe(doc, sigData, centerX - sigW / 2, imageTopY + 0.5, sigW, sigH);
  }

  // Place enlarged school stamp shifted to the left of Headmaster's signature so it does not cover it
  if (role === 'headmaster' && settings.schoolStamp) {
    const stampX = sigData
      ? Math.max(8, centerX - sigW / 2 - stampSize * 0.9)
      : centerX - stampSize / 2;
    const stampY = imageTopY + 0.5 + sigH / 2 - stampSize / 2;
    const stampOpacity = detectImageFormat(settings.schoolStamp) === 'PNG' ? 0.80 : 0.65;
    try {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: stampOpacity }));
      addImageSafe(doc, settings.schoolStamp, stampX, stampY, stampSize, stampSize);
      doc.restoreGraphicsState();
    } catch {
      addImageSafe(doc, settings.schoolStamp, stampX, stampY, stampSize, stampSize);
    }
  }
}

interface AutoTableDensityPreset {
  fontSize: number;
  headFontSize: number;
  cellPadV: number;
  headPadV: number;
  minCellHeight: number;
  bottomMargin?: number;
}

/**
 * Renders an autoTable such that any trailing block (summary strip + signature block)
 * of height `trailingHeightMm` stays on the same page as the table (ideally fitting
 * everything on 1 page by tightening vertical density, and on genuinely multi-page
 * tables ensuring the trailing signature block is never orphaned alone on a blank page).
 */
function renderAutoTableWithSignature(
  doc: jsPDF,
  orientation: 'portrait' | 'landscape',
  settings: ExamSettings,
  startY: number,
  trailingHeightMm: number,
  presets: AutoTableDensityPreset[],
  buildTableConfig: (
    preset: AutoTableDensityPreset,
    targetDoc: jsPDF
  ) => Parameters<typeof autoTable>[1]
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const minSafeBottomMargin = 6;

  const measurePreset = (preset: AutoTableDensityPreset) => {
    const scratch = createPdfDoc(orientation, settings);
    const cfg = buildTableConfig(preset, scratch);
    autoTable(scratch, {
      ...cfg,
      didDrawCell: undefined,
      startY,
    });
    const pages = scratch.getNumberOfPages();
    const finalY =
      (scratch as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
      startY + 40;
    return { pages, finalY };
  };

  let chosenPreset: AutoTableDensityPreset | null = null;
  let lastMeasurement = { pages: 1, finalY: startY };

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    const m = measurePreset(preset);
    lastMeasurement = m;
    if (m.pages === 1 && m.finalY + trailingHeightMm <= pageHeight - minSafeBottomMargin) {
      chosenPreset = preset;
      break;
    }
  }

  if (!chosenPreset) {
    const compactPreset = presets[presets.length - 1];
    if (lastMeasurement.finalY + trailingHeightMm <= pageHeight - minSafeBottomMargin) {
      chosenPreset = compactPreset;
    } else {
      const reservedBottom = Math.min(
        Math.max(compactPreset.bottomMargin ?? 12, trailingHeightMm + 7),
        Math.floor(pageHeight * 0.44)
      );
      const paddedPreset: AutoTableDensityPreset = {
        ...compactPreset,
        bottomMargin: reservedBottom,
      };
      const paddedM = measurePreset(paddedPreset);
      chosenPreset =
        paddedM.finalY + trailingHeightMm <= pageHeight - minSafeBottomMargin
          ? paddedPreset
          : compactPreset;
    }
  }

  const finalConfig = buildTableConfig(chosenPreset, doc);
  autoTable(doc, {
    ...finalConfig,
    startY,
  });

  return (
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
    startY + 40
  );
}


/**
 * Creates official header (Kop Surat) on jsPDF document
 */
/**
 * Creates official header (Kop Surat) on jsPDF document with dual logos
 */
function renderLetterhead(
  doc: jsPDF,
  settings: ExamSettings,
  title: string,
  subTitle?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Draw Left Logo (Pemda)
  if (settings.logoLeftPemda) {
    try {
      doc.addImage(settings.logoLeftPemda, 'PNG', 14, 8, 18, 18);
    } catch {
      // Graceful fallback if image format requires conversion
    }
  }

  // Draw Right Logo (School)
  if (settings.logoRightSchool) {
    try {
      doc.addImage(settings.logoRightSchool, 'PNG', pageWidth - 32, 8, 18, 18);
    } catch {
      // Graceful fallback if image format requires conversion
    }
  }

  // Kop Text (Center Aligned)
  let curY = 12.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text((settings.governmentName || 'PEMERINTAH DAERAH').toUpperCase(), pageWidth / 2, curY, { align: 'center' });

  curY += 6;
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(settings.schoolName.toUpperCase(), pageWidth / 2, curY, { align: 'center' });

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const contactLine = `${settings.schoolAddress}${settings.schoolPhone ? ' | Telp: ' + settings.schoolPhone : ''}${settings.postalCode ? ' Kode Pos: ' + settings.postalCode : ''}`;
  doc.text(contactLine, pageWidth / 2, curY, { align: 'center' });

  curY += 3.5;
  const webLine = `${settings.schoolEmail ? 'Email: ' + settings.schoolEmail : ''}${settings.schoolWebsite ? ' | Website: ' + settings.schoolWebsite : ''}`;
  doc.setFontSize(7);
  doc.text(webLine, pageWidth / 2, curY, { align: 'center' });

  // Official Double Line Divider
  curY += 3.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.0);
  doc.line(14, curY, pageWidth - 14, curY);
  doc.setLineWidth(0.3);
  doc.line(14, curY + 1.2, pageWidth - 14, curY + 1.2);

  // Document Title
  curY += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title.toUpperCase(), pageWidth / 2, curY, { align: 'center' });

  if (subTitle) {
    curY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(subTitle, pageWidth / 2, curY, { align: 'center' });
  }

  return curY + 6;
}

export interface AttendancePdfOptions {
  dayDateText?: string;
  subjectText?: string;
  cityLabel?: string;
  dateLine?: string;
  invigilatorName?: string;
  invigilatorNip?: string;
  subjectTeacherName?: string;
  useDailyInvigilators?: boolean;
  schedule?: ExamScheduleItem;
}

function renderAttendancePage(
  doc: jsPDF,
  target: AttendanceTarget,
  students: Student[],
  settings: ExamSettings,
  options?: AttendancePdfOptions
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const targetStudents = getStudentsForAttendanceTarget(students, target);
  const targetHeading = formatAttendanceTargetHeading(target);

  const dayDateText =
    options?.dayDateText?.trim() || settings.examDate || '........................................';
  const subjectText =
    options?.subjectText?.trim() || '........................................';
  const cityLabel = (options?.cityLabel || extractCityFromSettings(settings)).trim();
  const dateLine = (
    options?.dateLine || extractSignatureDateFromSettings(settings, '_____________________')
  ).trim();
  const resolvedDaily =
    !options?.invigilatorName?.trim() &&
    options?.useDailyInvigilators &&
    target.mode !== 'per-class'
      ? getScheduleRoomInvigilators(target.room, options.schedule, settings)
      : null;
  const invigilatorDisplay =
    options?.invigilatorName?.trim() ||
    resolvedDaily?.invigilator1.trim() ||
    '_________________________';
  const invigilatorNipDisplay =
    options?.invigilatorNip?.trim() || resolvedDaily?.invigilator1Nip.trim() || '';
  const teacherDisplay = options?.subjectTeacherName?.trim() || '_________________________';

  // Top Centered Title Block (matching uploaded Daftar Hadir screenshot)
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    `DAFTAR HADIR PESERTA ${(settings.examTitle || 'UJIAN SEKOLAH').toUpperCase()}`,
    pageWidth / 2,
    14,
    { align: 'center' }
  );
  doc.text(
    (settings.schoolName || 'NAMA SEKOLAH').toUpperCase(),
    pageWidth / 2,
    19,
    { align: 'center' }
  );
  doc.setFontSize(9.5);
  doc.text(`Tahun Ajaran ${settings.academicYear}`, pageWidth / 2, 24, { align: 'center' });
  doc.setFontSize(target.mode === 'per-room-class' ? 12 : 13);
  doc.text(targetHeading, pageWidth / 2, 30, { align: 'center' });

  // Metadata rows (Hari, tanggal & Mata Pelajaran) with 2-spasi vertical spacing
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setDrawColor(...LINE_BLACK);
  doc.setLineWidth(0.45);

  doc.text('Hari, tanggal', 14, 39);
  doc.text(`: ${dayDateText}`, 46, 39);
  doc.line(46, 40.6, 114, 40.6);

  doc.text('Mata Pelajaran', 14, 47);
  doc.text(`: ${subjectText}`, 46, 47);
  doc.line(46, 48.6, 114, 48.6);

  // Table rows
  const defaultRowsFallback =
    target.mode === 'per-room' ? Math.max(1, Math.min(target.room.capacity || 20, 20)) : 15;
  const rowCount = targetStudents.length > 0 ? targetStudents.length : defaultRowsFallback;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRows: any[] = [];
  for (let i = 0; i < rowCount; i++) {
    const no = i + 1;
    const isOdd = no % 2 !== 0;
    const st = targetStudents[i];
    bodyRows.push([
      String(no),
      st ? st.participantNo || st.nis : '',
      st ? st.name.toUpperCase() : '',
      {
        content: String(no),
        styles: {
          halign: isOdd ? ('left' as const) : ('center' as const),
        },
      },
      '',
    ]);
  }

  // Footer summary row: Rata-rata
  bodyRows.push([
    {
      content: 'Rata-rata',
      colSpan: 4,
      styles: { halign: 'center' as const, fontStyle: 'bold' as const },
    },
    '',
  ]);

  const finalY = renderAutoTableWithSignature(
    doc,
    'portrait',
    settings,
    53,
    41,
    [
      { fontSize: 8.5, headFontSize: 8.8, cellPadV: 3.1, headPadV: 2.8, minCellHeight: 9.8, bottomMargin: 10 },
      { fontSize: 8.2, headFontSize: 8.4, cellPadV: 2.0, headPadV: 2.2, minCellHeight: 7.4, bottomMargin: 8 },
      { fontSize: 7.6, headFontSize: 8.0, cellPadV: 1.3, headPadV: 1.7, minCellHeight: 6.0, bottomMargin: 7 },
      { fontSize: 7.0, headFontSize: 7.5, cellPadV: 0.9, headPadV: 1.4, minCellHeight: 5.1, bottomMargin: 6 },
    ],
    (preset) => ({
      margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 10 },
      head: [['No', 'No. Peserta', 'Nama Peserta', 'Tanda Tangan', 'Nilai']],
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        lineColor: LINE_BLACK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: preset.headFontSize,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: preset.headPadV, bottom: preset.headPadV, left: 2, right: 2 },
      },
      styles: {
        fontSize: preset.fontSize,
        cellPadding: { top: preset.cellPadV, bottom: preset.cellPadV, left: 2, right: 2 },
        minCellHeight: preset.minCellHeight,
        textColor: [0, 0, 0],
        lineColor: LINE_BLACK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 11 },
        1: { halign: 'center', cellWidth: 28 },
        2: { halign: 'left', cellWidth: 'auto' },
        3: { halign: 'left', cellWidth: 48 },
        4: { halign: 'center', cellWidth: 22 },
      },
    })
  );

  // Bottom Signature Block: Left Pengawas, Right City/Date + Guru Mapel
  let sigY = finalY + (finalY + 41 > pageHeight - 4 ? 7 : 9);
  if (sigY + 32 > pageHeight - 3) {
    doc.addPage();
    sigY = 25;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(0, 0, 0);

  const leftSigX = 24;
  const rightSigX = pageWidth - 88;

  doc.text('Pengawas', leftSigX, sigY + 6.5);
  doc.text(invigilatorDisplay, leftSigX, sigY + 27);
  if (invigilatorNipDisplay) {
    doc.setFontSize(8.2);
    doc.text(`NIP. ${invigilatorNipDisplay}`, leftSigX, sigY + 31.2);
    doc.setFontSize(9.2);
  }

  doc.text(`${cityLabel}, ${dateLine}`, rightSigX, sigY);
  doc.text('Guru Mapel', rightSigX, sigY + 6.5);
  doc.text(teacherDisplay, rightSigX, sigY + 27);
}

function getTargetSlug(target: AttendanceTarget): string {
  if (target.mode === 'per-room') return target.room.name.replace(/\s+/g, '_');
  if (target.mode === 'per-class') return `Kelas_${target.className.replace(/\s+/g, '_')}`;
  return `${target.room.name.replace(/\s+/g, '_')}_Kelas_${target.className.replace(/\s+/g, '_')}`;
}

/**
 * Export Daftar Hadir 1 for any AttendanceTarget (Per Ruang, Per Kelas, or Per Ruang & Kelas)
 */
export function exportAttendancePdfForTarget(
  target: AttendanceTarget,
  students: Student[],
  settings: ExamSettings,
  options?: AttendancePdfOptions
): void {
  const doc = createPdfDoc('portrait', settings);

  renderAttendancePage(doc, target, students, settings, options);

  const subjSlug = options?.subjectText
    ? `_${options.subjectText.replace(/[^a-zA-Z0-9]+/g, '_')}`
    : '';
  doc.save(`Daftar_Hadir_${getTargetSlug(target)}${subjSlug}_${Date.now()}.pdf`);
}

/**
 * Export bundled Daftar Hadir 1 for a list of AttendanceTargets
 */
export function exportBundledAttendancePdfForTargets(
  targets: AttendanceTarget[],
  students: Student[],
  settings: ExamSettings,
  options?: AttendancePdfOptions,
  filenamePrefix = 'Daftar_Hadir'
): void {
  if (targets.length === 0) return;
  const doc = createPdfDoc('portrait', settings);

  targets.forEach((target, idx) => {
    if (idx > 0) doc.addPage();
    renderAttendancePage(doc, target, students, settings, options);
  });

  const subjSlug = options?.subjectText
    ? `_${options.subjectText.replace(/[^a-zA-Z0-9]+/g, '_')}`
    : '';
  doc.save(`${filenamePrefix}${subjSlug}_${Date.now()}.pdf`);
}

/**
 * Export bundled Daftar Hadir 1 across all scheduled subjects for a list of AttendanceTargets
 */
export function exportAllSubjectsAttendancePdfForTargets(
  targets: AttendanceTarget[],
  students: Student[],
  settings: ExamSettings,
  schedules: ExamScheduleItem[],
  options?: Omit<AttendancePdfOptions, 'dayDateText' | 'subjectText'>,
  filenamePrefix = 'Bundel_Daftar_Hadir'
): void {
  if (targets.length === 0) return;
  const doc = createPdfDoc('portrait', settings);

  const targetSchedules =
    schedules.length > 0
      ? schedules
      : [
          {
            id: 'default',
            day: '',
            date: settings.examDate || '',
            time: settings.examSession || '',
            subject: '',
            grade: '',
            roomNotes: '',
          },
        ];

  let pageCounter = 0;
  for (const sch of targetSchedules) {
    const dayDate = sch.day && sch.date ? `${sch.day}, ${sch.date}` : sch.date || settings.examDate;
    for (const target of targets) {
      if (pageCounter > 0) doc.addPage();
      renderAttendancePage(doc, target, students, settings, {
        ...options,
        dayDateText: dayDate,
        subjectText: sch.subject,
        schedule: sch,
      });
      pageCounter += 1;
    }
  }

  doc.save(`${filenamePrefix}_${targets.length}Lembar_${targetSchedules.length}Mapel_${Date.now()}.pdf`);
}

/**
 * Export official Exam Attendance Sheet for one room
 */
export function exportAttendancePdfForRoom(
  room: Room,
  students: Student[],
  settings: ExamSettings,
  saveFile = true,
  options?: AttendancePdfOptions
): jsPDF {
  const doc = createPdfDoc('portrait', settings);

  renderAttendancePage(doc, { mode: 'per-room', room }, students, settings, options);

  if (saveFile) {
    const subjSlug = options?.subjectText
      ? `_${options.subjectText.replace(/[^a-zA-Z0-9]+/g, '_')}`
      : '';
    doc.save(`Daftar_Hadir_${room.name.replace(/\s+/g, '_')}${subjSlug}_${Date.now()}.pdf`);
  }

  return doc;
}

/**
 * Export all rooms attendance into a single compiled PDF file
 */
export function exportAllRoomsAttendancePdf(
  rooms: Room[],
  students: Student[],
  settings: ExamSettings,
  options?: AttendancePdfOptions
): void {
  const doc = createPdfDoc('portrait', settings);

  rooms.forEach((room, roomIdx) => {
    if (roomIdx > 0) {
      doc.addPage();
    }
    renderAttendancePage(doc, { mode: 'per-room', room }, students, settings, options);
  });

  const subjSlug = options?.subjectText
    ? `_${options.subjectText.replace(/[^a-zA-Z0-9]+/g, '_')}`
    : '';
  doc.save(`Daftar_Hadir_Semua_Ruang${subjSlug}_${Date.now()}.pdf`);
}

/**
 * Export bundled attendance sheets for all rooms across all scheduled subjects
 */
export function exportAllSubjectsAttendancePdf(
  rooms: Room[],
  students: Student[],
  settings: ExamSettings,
  schedules: ExamScheduleItem[],
  options?: Omit<AttendancePdfOptions, 'dayDateText' | 'subjectText'>
): void {
  const doc = createPdfDoc('portrait', settings);

  const targetSchedules =
    schedules.length > 0
      ? schedules
      : [
          {
            id: 'default',
            day: '',
            date: settings.examDate || '',
            time: settings.examSession || '',
            subject: '',
            grade: '',
            roomNotes: '',
          },
        ];

  let pageCounter = 0;
  for (const sch of targetSchedules) {
    const dayDate = sch.day && sch.date ? `${sch.day}, ${sch.date}` : sch.date || settings.examDate;
    for (const room of rooms) {
      if (pageCounter > 0) {
        doc.addPage();
      }
      renderAttendancePage(doc, { mode: 'per-room', room }, students, settings, {
        ...options,
        dayDateText: dayDate,
        subjectText: sch.subject,
        schedule: sch,
      });
      pageCounter += 1;
    }
  }

  doc.save(`Bundel_Daftar_Hadir_${rooms.length}Ruang_${targetSchedules.length}Mapel_${Date.now()}.pdf`);
}

/**
 * Helper to draw Daftar Hadir 2 (Multi-Hari, Per Ruang / Per Kelas / Per Ruang & Kelas)
 * Matching uploaded screenshot:
 * Header: DAFTAR HADIR PESERTA [EXAM] / Tahun Ajaran / RUANG : XX (dan/atau KELAS : ...)
 * Columns: No | No. Peserta | Nama Peserta | Hari, tanggal (kolom tiap hari)
 * Footer rows: Jumlah hadir & Paraf Pengawas
 */
function renderAttendance2Page(
  doc: jsPDF,
  target: AttendanceTarget,
  dayGroups: ExamDayGroup[],
  students: Student[],
  settings: ExamSettings
): void {
  const pageWidth = doc.internal.pageSize.getWidth();

  const targetStudents = getStudentsForAttendanceTarget(students, target);
  const targetHeading = formatAttendanceTargetHeading(target);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    `DAFTAR HADIR PESERTA ${(settings.examTitle || 'UJIAN SEKOLAH').toUpperCase()}`,
    pageWidth / 2,
    13,
    { align: 'center' }
  );
  doc.setFontSize(9.5);
  doc.text(`Tahun Ajaran ${settings.academicYear}`, pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(target.mode === 'per-room-class' ? 12 : 13);
  doc.text(targetHeading, pageWidth / 2, 24, { align: 'center' });

  const daysCount = Math.max(1, dayGroups.length);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const head: any[] = [
    [
      { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
      { content: 'No. Peserta', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
      { content: 'Nama Peserta', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
      { content: 'Hari, tanggal', colSpan: daysCount, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' } },
    ],
    dayGroups.map((dg) => ({
      content: `${dg.day},\n${dg.date}`,
      styles: { halign: 'center', valign: 'middle', fontStyle: 'normal', fontSize: 7.5 },
    })),
  ];

  const defaultRowsFallback =
    target.mode === 'per-room' ? Math.max(1, Math.min(target.room.capacity || 20, 20)) : 15;
  const rowCount = targetStudents.length > 0 ? targetStudents.length : defaultRowsFallback;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRows: any[] = [];
  for (let i = 0; i < rowCount; i++) {
    const st = targetStudents[i];
    bodyRows.push([
      String(i + 1),
      st ? st.participantNo || st.nis : '',
      st ? st.name.toUpperCase() : '',
      ...dayGroups.map(() => ''),
    ]);
  }

  const jumlahRowIdx = bodyRows.length;
  bodyRows.push([
    {
      content: 'Jumlah hadir',
      colSpan: 3,
      styles: { halign: 'center' as const, fontStyle: 'bold' as const },
    },
    ...dayGroups.map(() => ''),
  ]);

  const parafRowIdx = bodyRows.length;
  bodyRows.push([
    {
      content: 'Paraf Pengawas',
      colSpan: 3,
      styles: { halign: 'center' as const, fontStyle: 'bold' as const, minCellHeight: 11 },
    },
    ...dayGroups.map(() => ({ content: '', styles: { minCellHeight: 11 } })),
  ]);

  // Dynamic column widths for A4 Landscape (printable width = 269mm)
  const printableW = pageWidth - 28;
  const fixedW = 10 + 28 + 75; // No + No. Peserta + Nama Peserta = 113mm
  const dayColW = Math.max(18, (printableW - fixedW) / daysCount);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colStyles: Record<number, any> = {
    0: { halign: 'center', cellWidth: 10 },
    1: { halign: 'center', cellWidth: 28 },
    2: { halign: 'left', cellWidth: 75 },
  };
  for (let d = 0; d < daysCount; d++) {
    colStyles[3 + d] = { halign: 'center', cellWidth: dayColW };
  }

  autoTable(doc, {
    startY: 28,
    margin: { left: 14, right: 14 },
    head,
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: LINE_BLACK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: 8.5,
      cellPadding: 1.5,
      valign: 'middle',
    },
    styles: {
      fontSize: 8,
      cellPadding: 1.4,
      textColor: [0, 0, 0],
      lineColor: LINE_BLACK,
      lineWidth: GRID_LINE_WIDTH,
      valign: 'middle',
      fillColor: [255, 255, 255],
    },
    columnStyles: colStyles,
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index === jumlahRowIdx) {
        doc.setDrawColor(...LINE_BLACK);
        doc.setLineWidth(0.75);
        doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
      }
      if (data.section === 'body' && data.row.index === parafRowIdx) {
        doc.setLineWidth(GRID_LINE_WIDTH);
      }
    },
  });
}

/**
 * Export Daftar Hadir 2 PDF for a single AttendanceTarget
 */
export function exportAttendance2PdfForTarget(
  target: AttendanceTarget,
  dayGroups: ExamDayGroup[],
  students: Student[],
  settings: ExamSettings
): void {
  const doc = createPdfDoc('landscape', settings);

  renderAttendance2Page(doc, target, dayGroups, students, settings);
  doc.save(`Daftar_Hadir_2_${getTargetSlug(target)}_${Date.now()}.pdf`);
}

/**
 * Export bundled Daftar Hadir 2 PDF for multiple AttendanceTargets
 */
export function exportBundledAttendance2PdfForTargets(
  targets: AttendanceTarget[],
  dayGroups: ExamDayGroup[],
  students: Student[],
  settings: ExamSettings,
  filenamePrefix = 'Bundel_Daftar_Hadir_2'
): void {
  if (targets.length === 0) return;
  const doc = createPdfDoc('landscape', settings);

  targets.forEach((target, idx) => {
    if (idx > 0) doc.addPage();
    renderAttendance2Page(doc, target, dayGroups, students, settings);
  });

  doc.save(`${filenamePrefix}_${targets.length}Lembar_${Date.now()}.pdf`);
}

/**
 * Export Door Poster PDF (Daftar Tempel Pintu Ruang)
 * Designed with clear seat indicators for classroom doors, scaled dynamically
 * to always fit cleanly on 1 single page of the selected paper size.
 */
export function exportDoorPosterPdf(
  room: Room,
  students: Student[],
  settings: ExamSettings
): void {
  const doc = createPdfDoc('portrait', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const roomStudents = students
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

  const capacity = Math.max(1, room.capacity);
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  const isCompactMode = pageHeight < 290 || capacity > 28;

  // Big Header banner (scaled for 1-page guarantee)
  const bannerH = isCompactMode ? 28 : 33;
  doc.setFillColor(30, 41, 59); // slate-900
  doc.rect(0, 0, pageWidth, bannerH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isCompactMode ? 9.5 : 10.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(settings.schoolName.toUpperCase(), pageWidth / 2, isCompactMode ? 7.5 : 9.5, {
    align: 'center',
  });

  doc.setFontSize(isCompactMode ? 14 : 15.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `DAFTAR PESERTA UJIAN - ${room.name.toUpperCase()}`,
    pageWidth / 2,
    isCompactMode ? 16 : 18.5,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isCompactMode ? 9 : 9.5);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `${settings.examTitle} (${settings.academicYear}) | ${room.building}`,
    pageWidth / 2,
    isCompactMode ? 23 : 26.5,
    { align: 'center' }
  );

  // Quick stats ribbon (without Sesi Ujian)
  const ribbonY = bannerH + 3;
  const ribbonH = isCompactMode ? 10 : 11.5;
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, ribbonY, contentWidth, ribbonH, 'F');
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.rect(marginX, ribbonY, contentWidth, ribbonH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isCompactMode ? 8.2 : 8.8);
  doc.setTextColor(30, 41, 59);
  const ribbonTextY = ribbonY + ribbonH / 2 + 1.2;
  doc.text(
    `Kapasitas: ${room.capacity} Meja (${room.columns} Kolom)  |  Terisi: ${roomStudents.length} Siswa  |  Kosong: ${Math.max(0, room.capacity - roomStudents.length)} Meja`,
    marginX + 4,
    ribbonTextY
  );

  const nisList = roomStudents.map((s) => s.nis).sort();
  const nisRange = nisList.length > 0 ? `${nisList[0]} s/d ${nisList[nisList.length - 1]}` : '-';
  doc.text(`Rentang NIS: ${nisRange}`, pageWidth - marginX - 4, ribbonTextY, {
    align: 'right',
  });

  // Table of students conforming to chair capacity rules (Meja 01 s/d Kapasitas)
  const tableData: string[][] = [];
  for (let seat = 1; seat <= capacity; seat++) {
    const st = roomStudents.find((s) => s.seatNumber === seat);
    if (st) {
      tableData.push([
        `Meja ${String(seat).padStart(2, '0')}`,
        st.participantNo || '-',
        st.nis,
        st.name,
        st.className,
        st.gender === 'L' ? 'Laki-Laki' : 'Perempuan',
      ]);
    } else {
      tableData.push([
        `Meja ${String(seat).padStart(2, '0')}`,
        '-',
        '-',
        '[ KURSI KOSONG / TERSEDIA ]',
        '-',
        '-',
      ]);
    }
  }

  // Dynamic sizing to ensure all rows fit cleanly on 1 single page of the selected paper
  const tableStartY = ribbonY + ribbonH + 3;
  const footerReserveMm = 11.5;
  const availableTableH = Math.max(80, pageHeight - tableStartY - footerReserveMm);
  const estimatedHeadH = 8;
  const idealRowH = ((availableTableH - estimatedHeadH) * 0.95) / capacity;

  let bodyFontSize = 9;
  let cellPadV = 2.0;

  if (idealRowH >= 8.4) {
    bodyFontSize = 9.5;
    cellPadV = Math.min(2.7, Math.max(1.8, (idealRowH - bodyFontSize * 0.41) / 2));
  } else if (idealRowH >= 6.8) {
    bodyFontSize = 8.5;
    cellPadV = Math.max(1.1, (idealRowH - bodyFontSize * 0.41) / 2);
  } else if (idealRowH >= 5.5) {
    bodyFontSize = 7.8;
    cellPadV = Math.max(0.75, (idealRowH - bodyFontSize * 0.41) / 2);
  } else if (idealRowH >= 4.4) {
    bodyFontSize = 7.0;
    cellPadV = Math.max(0.5, (idealRowH - bodyFontSize * 0.41) / 2);
  } else {
    bodyFontSize = Math.max(5.5, Number((idealRowH * 1.45).toFixed(1)));
    cellPadV = Math.max(0.3, (idealRowH - bodyFontSize * 0.41) / 2);
  }

  const headFontSize = Math.min(9.5, bodyFontSize + 0.7);
  const headPadV = Math.min(2.4, Math.max(1.0, cellPadV + 0.25));

  const colNoMeja = 19;
  const colNoPeserta = 26;
  const colNis = 20;
  const colKelas = 23;
  const colJk = 22;
  const colNamaWidth = contentWidth - (colNoMeja + colNoPeserta + colNis + colKelas + colJk);

  autoTable(doc, {
    startY: tableStartY,
    margin: { top: tableStartY, left: marginX, right: marginX, bottom: 7 },
    head: [['No Meja', 'No Peserta', 'NIS', 'Nama Siswa', 'Kelas', 'JK']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: headFontSize,
      cellPadding: { top: headPadV, bottom: headPadV, left: 1.5, right: 1.5 },
      halign: 'center',
      valign: 'middle',
    },
    styles: {
      fontSize: bodyFontSize,
      cellPadding: { top: cellPadV, bottom: cellPadV, left: 1.5, right: 1.5 },
      textColor: [15, 23, 42],
      lineColor: LINE_DARK,
      lineWidth: GRID_LINE_WIDTH,
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: colNoMeja },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: colNoPeserta },
      2: { halign: 'center', cellWidth: colNis },
      3: { halign: 'left', cellWidth: colNamaWidth },
      4: { halign: 'center', cellWidth: colKelas },
      5: { halign: 'center', cellWidth: colJk },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (hookData) => {
      // Shrink extra-long student names so every row stays 1 line tall and fits in 1 page
      if (hookData.section === 'body' && hookData.column.index === 3) {
        const rawText = Array.isArray(hookData.cell.text)
          ? hookData.cell.text.join(' ')
          : String(hookData.cell.text || '');
        if (rawText) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(bodyFontSize);
          const maxTextW = colNamaWidth - 3.5;
          const textW = doc.getTextWidth(rawText);
          if (textW > maxTextW && textW > 0) {
            const shrunkSize = Math.max(
              5.2,
              Number(((bodyFontSize * maxTextW) / textW).toFixed(1))
            );
            hookData.cell.styles.fontSize = shrunkSize;
          }
        }
      }
    },
  });

  // Compact footer on the single page
  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Harap ditempel di daun pintu masuk ruang ujian.', marginX, pageHeight - 5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(
    `${cityLabel}, ${dateLabel}  |  Panitia ${settings.schoolName}`,
    pageWidth - marginX,
    pageHeight - 5.5,
    { align: 'right' }
  );

  doc.save(`Tempelan_Pintu_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}

function fitSingleLineText(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxWidthMm) return text;
  let clipped = text;
  while (clipped.length > 1 && doc.getTextWidth(clipped + '..') > maxWidthMm) {
    clipped = clipped.slice(0, -1);
  }
  return clipped + '..';
}

export interface SeatingPlanPdfOptions {
  invigilatorName?: string;
  invigilatorNip?: string;
  daySessionLabel?: string;
}

function renderSeatingPlanPage(
  doc: jsPDF,
  room: Room,
  students: Student[],
  settings: ExamSettings,
  orderedClasses: string[],
  options?: SeatingPlanPdfOptions
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  const roomStudents = students
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
  const studentBySeat = new Map<number, Student>();
  roomStudents.forEach((s) => {
    if (s.seatNumber) studentBySeat.set(s.seatNumber, s);
  });

  const columns = Math.max(2, Math.min(6, room.columns || 4));
  const capacity = Math.max(1, room.capacity);
  const rows = Math.ceil(capacity / columns);

  const curY = renderLetterhead(
    doc,
    settings,
    'DENAH TATA LETAK TEMPAT DUDUK PESERTA',
    `${room.name.toUpperCase()} (${room.code}) - ${room.building} | ${(settings.activityName || settings.examTitle).toUpperCase()} (${settings.academicYear})`
  );

  // Room Summary Ribbon
  const ribbonY = curY - 2;
  const ribbonH = 6.2;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.35);
  doc.rect(marginX, ribbonY, contentWidth, ribbonH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(30, 41, 59);
  const leftSummary = `Kapasitas: ${capacity} Kursi (${columns} Kolom)  |  Terisi: ${roomStudents.length} Siswa  |  Kosong: ${Math.max(0, capacity - roomStudents.length)} Meja`;
  doc.text(leftSummary, marginX + 3, ribbonY + 4.1);

  const nisList = roomStudents.map((s) => s.nis).filter(Boolean).sort();
  const nisRange = nisList.length > 0 ? `${nisList[0]} - ${nisList[nisList.length - 1]}` : '-';
  const rightSummary = options?.daySessionLabel
    ? `${options.daySessionLabel} | NIS: ${nisRange}`
    : `Rentang NIS: ${nisRange}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.text(
    fitSingleLineText(doc, rightSummary, contentWidth * 0.45),
    pageWidth - marginX - 3,
    ribbonY + 4.1,
    { align: 'right' }
  );

  // Blackboard Banner
  const boardY = ribbonY + ribbonH + 2.2;
  const boardH = 5.2;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(marginX, boardY, contentWidth, boardH, 0.8, 0.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text('[ PAPAN TULIS DEPAN KELAS / ARAH DEPAN ]', pageWidth / 2, boardY + 3.6, {
    align: 'center',
  });

  // Invigilator Desk Box
  const invName = options?.invigilatorName?.trim() || room.invigilator1 || '-';
  const invNip =
    options?.invigilatorNip !== undefined ? options.invigilatorNip.trim() : room.invigilator1Nip || '';
  const deskY = boardY + boardH + 1.8;
  const deskW = 68;
  const deskH = invNip ? 9.5 : 7.4;
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.35);
  doc.roundedRect(pageWidth / 2 - deskW / 2, deskY, deskW, deskH, 0.8, 0.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(120, 53, 15);
  doc.text('MEJA PENGAWAS RUANG', pageWidth / 2, deskY + 3.1, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.text(fitSingleLineText(doc, invName, deskW - 6), pageWidth / 2, deskY + 6.0, {
    align: 'center',
  });
  if (invNip) {
    doc.setFontSize(5.8);
    doc.text(`NIP. ${invNip}`, pageWidth / 2, deskY + 8.5, { align: 'center' });
  }

  // Class Color Legend Pills
  let gridStartY = deskY + deskH + 2.5;
  const classesInRoom = getOrderedClassNamesInRoom(
    students,
    room.id,
    settings.customClassOrder
  );
  if (classesInRoom.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    const pills: { label: string; w: number; theme: ReturnType<typeof getClassColorTheme> }[] =
      classesInRoom.map((cls) => {
        const theme = getClassColorTheme(cls, orderedClasses, settings.classColors);
        const w = Math.max(12, doc.getTextWidth(cls) + 5.5);
        return { label: cls, w, theme };
      });
    const totalW = pills.reduce((sum, p) => sum + p.w + 2, 18);
    const startLegendX = Math.max(marginX, (pageWidth - Math.min(contentWidth, totalW)) / 2);
    let lx = startLegendX;
    let ly = gridStartY;
    doc.setTextColor(71, 85, 105);
    doc.text('Warna Kelas:', lx, ly + 2.9);
    lx += 16.5;

    pills.forEach((pill) => {
      if (lx + pill.w > pageWidth - marginX) {
        lx = startLegendX;
        ly += 5.0;
      }
      doc.setFillColor(...pill.theme.badgeBgRgb);
      doc.setDrawColor(...pill.theme.borderRgb);
      doc.setLineWidth(0.25);
      doc.roundedRect(lx, ly, pill.w, 4.1, 0.7, 0.7, 'FD');
      doc.setFillColor(...pill.theme.seatBoxBgRgb);
      doc.rect(lx + 1.1, ly + 1.05, 2.0, 2.0, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.0);
      doc.setTextColor(...pill.theme.badgeTextRgb);
      doc.text(pill.label, lx + 4.0, ly + 2.9);
      lx += pill.w + 1.8;
    });
    gridStartY = ly + 6.2;
  }

  // Physical Seating Grid (dynamically scaled to fit cleanly on 1 page)
  const bottomReserve = 29;
  const availGridH = Math.max(60, pageHeight - gridStartY - bottomReserve);
  const colGap = columns >= 5 ? 2.5 : 3.5;
  const rowGap = rows >= 8 ? 2.0 : 2.8;
  const seatW = (contentWidth - colGap * (columns - 1)) / columns;
  const seatH = Math.min(22.5, Math.max(11.5, (availGridH - rowGap * (rows - 1)) / rows));

  const compactSeat = seatH < 15.5 || columns >= 5;
  const badgeH = compactSeat ? 3.5 : 4.2;
  const nameFont = compactSeat ? 5.9 : 7.0;
  const metaFont = compactSeat ? 5.2 : 5.9;

  for (let idx = 0; idx < capacity; idx++) {
    const seatNo = idx + 1;
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    const sx = marginX + col * (seatW + colGap);
    const sy = gridStartY + row * (seatH + rowGap);
    const student = studentBySeat.get(seatNo);

    if (student) {
      const theme = getClassColorTheme(student.className, orderedClasses, settings.classColors);
      doc.setFillColor(...theme.cardBgRgb);
      doc.setDrawColor(...theme.borderRgb);
      doc.setLineWidth(0.45);
      doc.roundedRect(sx, sy, seatW, seatH, 1.1, 1.1, 'FD');

      // Seat number pill & gender badge
      const seatLabel = `Meja ${String(seatNo).padStart(2, '0')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(compactSeat ? 5.5 : 6.2);
      const seatBadgeW = Math.min(seatW * 0.58, doc.getTextWidth(seatLabel) + 3.0);
      doc.setFillColor(...theme.seatBoxBgRgb);
      doc.roundedRect(sx + 1.2, sy + 1.1, seatBadgeW, badgeH, 0.7, 0.7, 'F');
      doc.setTextColor(...theme.seatBoxTextRgb);
      doc.text(seatLabel, sx + 1.2 + seatBadgeW / 2, sy + 1.1 + badgeH * 0.72, {
        align: 'center',
      });

      const genderLabel = `(${student.gender})`;
      const genderBadgeW = Math.max(5.5, doc.getTextWidth(genderLabel) + 2.2);
      doc.setFillColor(...theme.badgeBgRgb);
      doc.roundedRect(
        sx + seatW - genderBadgeW - 1.2,
        sy + 1.1,
        genderBadgeW,
        badgeH,
        0.7,
        0.7,
        'F'
      );
      doc.setTextColor(...theme.badgeTextRgb);
      doc.text(
        genderLabel,
        sx + seatW - genderBadgeW / 2 - 1.2,
        sy + 1.1 + badgeH * 0.72,
        { align: 'center' }
      );

      // Divider line
      const divY = sy + badgeH + 2.0;
      doc.setDrawColor(...theme.borderRgb);
      doc.setLineWidth(0.2);
      doc.line(sx + 1.2, divY, sx + seatW - 1.2, divY);

      // Student Name
      const bodyMiddleY = divY + (sy + seatH - 4.4 - divY) * 0.56;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(nameFont);
      doc.setTextColor(15, 23, 42);
      doc.text(fitSingleLineText(doc, student.name, seatW - 2.6), sx + 1.3, bodyMiddleY);

      // Bottom NIS & Class badge
      const bottomRowY = sy + seatH - 1.6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(metaFont);
      doc.setTextColor(51, 65, 85);

      const clsText = student.className || '-';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(metaFont - 0.3);
      const clsMaxW = seatW * 0.52;
      const clsFitted = fitSingleLineText(doc, clsText, clsMaxW - 2.0);
      const clsPillW = Math.min(clsMaxW, doc.getTextWidth(clsFitted) + 2.6);
      const clsPillH = compactSeat ? 3.2 : 3.7;
      const clsPillX = sx + seatW - clsPillW - 1.2;
      const clsPillY = bottomRowY - clsPillH + 0.85;

      doc.setFillColor(...theme.badgeBgRgb);
      doc.roundedRect(clsPillX, clsPillY, clsPillW, clsPillH, 0.6, 0.6, 'F');
      doc.setTextColor(...theme.badgeTextRgb);
      doc.text(clsFitted, clsPillX + clsPillW / 2, bottomRowY, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(metaFont);
      doc.setTextColor(51, 65, 85);
      const nisMaxW = Math.max(8, clsPillX - (sx + 1.3) - 1.0);
      doc.text(fitSingleLineText(doc, student.nis || '-', nisMaxW), sx + 1.3, bottomRowY);
    } else {
      // Empty Desk Slot
      doc.setLineDashPattern([1.0, 1.0], 0);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(sx, sy, seatW, seatH, 1.1, 1.1, 'FD');
      doc.setLineDashPattern([], 0);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(compactSeat ? 5.5 : 6.0);
      doc.setTextColor(148, 163, 184);
      doc.text(`Meja ${String(seatNo).padStart(2, '0')}`, sx + 1.4, sy + 3.6);
      doc.setFont('helvetica', 'italic');
      doc.text('(Kosong)', sx + seatW / 2, sy + seatH * 0.58, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.0);
      doc.text('Tersedia', sx + 1.4, sy + seatH - 1.5);
    }
  }

  // Back Door label
  const gridBottomY = gridStartY + rows * seatH + Math.max(0, rows - 1) * rowGap;
  const backDoorY = Math.min(pageHeight - 25.5, gridBottomY + 4.4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('[ PINTU MASUK / BELAKANG KELAS ]', pageWidth / 2, backDoorY, { align: 'center' });

  // Supervisor Signature Block at Bottom Right
  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);
  const sigX = pageWidth - marginX - 30;
  const sigTopY = pageHeight - 23.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text(`${cityLabel}, ${dateLabel}`, sigX, sigTopY, { align: 'center' });
  doc.text('Mengetahui,', sigX, sigTopY + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Pengawas Ruang', sigX, sigTopY + 6.9, { align: 'center' });

  const invDisplay = `(${invName && invName !== '-' ? invName : '.....................................'})`;
  doc.text(invDisplay, sigX, sigTopY + 17.5, { align: 'center' });
  const invLineW = doc.getTextWidth(invDisplay);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.25);
  doc.line(sigX - invLineW / 2, sigTopY + 18.1, sigX + invLineW / 2, sigTopY + 18.1);

  if (invNip) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(`NIP. ${invNip}`, sigX, sigTopY + 21.0, { align: 'center' });
  }
}

/**
 * Export Physical Seating Plan PDF (Denah Tempat Duduk) for a single room.
 */
export function exportSeatingPlanPdf(
  room: Room,
  students: Student[],
  settings: ExamSettings,
  options?: SeatingPlanPdfOptions
): void {
  const doc = createPdfDoc('portrait', settings);
  const orderedClasses = getOrderedClassNames(students, settings.customClassOrder);
  renderSeatingPlanPage(doc, room, students, settings, orderedClasses, options);
  doc.save(`Denah_Tempat_Duduk_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}

/**
 * Export Physical Seating Plan PDF (Denah Tempat Duduk) for all rooms bundled into one PDF.
 */
export function exportAllSeatingPlansPdf(
  rooms: Room[],
  students: Student[],
  settings: ExamSettings
): void {
  if (rooms.length === 0) return;
  const doc = createPdfDoc('portrait', settings);
  const orderedClasses = getOrderedClassNames(students, settings.customClassOrder);
  rooms.forEach((room, idx) => {
    if (idx > 0) doc.addPage();
    renderSeatingPlanPage(doc, room, students, settings, orderedClasses);
  });
  doc.save(`Denah_Tempat_Duduk_Semua_Ruang_${rooms.length}R_${Date.now()}.pdf`);
}

function renderRoomParticipantsPages(
  doc: jsPDF,
  room: Room,
  students: Student[],
  settings: ExamSettings
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  const roomStudents = students
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

  const maleCount = roomStudents.filter((s) => s.gender === 'L').length;
  const femaleCount = roomStudents.filter((s) => s.gender === 'P').length;
  const partList = roomStudents.map((s) => s.participantNo || '').filter(Boolean);
  const partRange =
    partList.length > 0 ? `${partList[0]} s/d ${partList[partList.length - 1]}` : '-';

  const classStatsMap = new Map<string, { total: number; l: number; p: number }>();
  const orderedRoomClasses = getOrderedClassNamesInRoom(
    students,
    room.id,
    settings.customClassOrder
  );
  orderedRoomClasses.forEach((cls) => classStatsMap.set(cls, { total: 0, l: 0, p: 0 }));
  roomStudents.forEach((s) => {
    const cls = s.className?.trim() || 'Tanpa Kelas';
    const entry = classStatsMap.get(cls) || { total: 0, l: 0, p: 0 };
    entry.total += 1;
    if (s.gender === 'L') entry.l += 1;
    else entry.p += 1;
    classStatsMap.set(cls, entry);
  });

  const classSummaryText =
    Array.from(classStatsMap.entries())
      .map(([cls, st]) => `${cls} (${st.total})`)
      .join(', ') || '-';

  const curY = renderLetterhead(
    doc,
    settings,
    'DATA PESERTA UJIAN TIAP RUANG',
    `${room.name.toUpperCase()} (${room.code}) - ${room.building} | ${(settings.activityName || settings.examTitle).toUpperCase()} (TA ${settings.academicYear})`
  );

  // Room metadata info box (2x2 clean grid without Pengawas Ruang)
  const infoBoxY = curY - 1;
  const infoBoxH = 11.2;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.35);
  doc.rect(marginX, infoBoxY, contentWidth, infoBoxH, 'FD');

  doc.setFontSize(7.6);
  doc.setTextColor(15, 23, 42);

  const leftColX = marginX + 3;
  const rightColX = marginX + contentWidth * 0.52;

  doc.setFont('helvetica', 'normal');
  doc.text('Ruang / Lokasi', leftColX, infoBoxY + 4.3);
  doc.setFont('helvetica', 'bold');
  doc.text(`: ${room.name} (${room.code}) — ${room.building}`, leftColX + 24, infoBoxY + 4.3);

  doc.setFont('helvetica', 'normal');
  doc.text('No. Peserta', leftColX, infoBoxY + 8.8);
  doc.setFont('helvetica', 'bold');
  doc.text(`: ${partRange}`, leftColX + 24, infoBoxY + 8.8);

  doc.setFont('helvetica', 'normal');
  doc.text('Kapasitas / Terisi', rightColX, infoBoxY + 4.3);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `: ${roomStudents.length} / ${room.capacity} Kursi (L: ${maleCount}, P: ${femaleCount})`,
    rightColX + 27,
    infoBoxY + 4.3
  );

  doc.setFont('helvetica', 'normal');
  doc.text('Komposisi Kelas', rightColX, infoBoxY + 8.8);
  doc.setFont('helvetica', 'bold');
  doc.text(
    fitSingleLineText(doc, `: ${classSummaryText}`, contentWidth * 0.48 - 30),
    rightColX + 27,
    infoBoxY + 8.8
  );

  const tableRows: (string | number)[][] =
    roomStudents.length > 0
      ? roomStudents.map((st, idx) => [
          idx + 1,
          `Meja ${String(st.seatNumber || idx + 1).padStart(2, '0')}`,
          st.participantNo || '-',
          st.nis || '-',
          st.nisn || '-',
          st.name || '-',
          st.className || '-',
          st.gender,
        ])
      : [['-', '-', '-', '-', '-', 'Belum ada peserta yang dialokasikan pada ruangan ini.', '-', '-']];

  const colNo = 9;
  const colMeja = 17;
  const colNoPes = 25;
  const colNis = 18;
  const colNisn = 22;
  const colKelas = 23;
  const colLp = 10;
  const colNama = Math.max(40, contentWidth - (colNo + colMeja + colNoPes + colNis + colNisn + colKelas + colLp));

  const summaryStripH = 7.2;
  const tableEndY = renderAutoTableWithSignature(
    doc,
    'portrait',
    settings,
    infoBoxY + infoBoxH + 3.5,
    43,
    [
      { fontSize: 7.8, headFontSize: 8.0, cellPadV: 1.6, headPadV: 2.0, minCellHeight: 5.8, bottomMargin: 12 },
      { fontSize: 7.4, headFontSize: 7.6, cellPadV: 1.2, headPadV: 1.6, minCellHeight: 4.9, bottomMargin: 10 },
      { fontSize: 6.9, headFontSize: 7.2, cellPadV: 0.85, headPadV: 1.3, minCellHeight: 4.2, bottomMargin: 8 },
      { fontSize: 6.4, headFontSize: 6.8, cellPadV: 0.6, headPadV: 1.1, minCellHeight: 3.7, bottomMargin: 7 },
    ],
    (preset) => ({
      margin: { top: 14, left: marginX, right: marginX, bottom: preset.bottomMargin ?? 12 },
      showHead: 'everyPage',
      head: [['No', 'No. Meja', 'No. Peserta', 'NIS', 'NISN', 'Nama Lengkap Peserta', 'Kelas', 'L/P']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_BLACK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: preset.headFontSize,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: preset.headPadV, bottom: preset.headPadV, left: 1.4, right: 1.4 },
      },
      styles: {
        fontSize: preset.fontSize,
        cellPadding: { top: preset.cellPadV, bottom: preset.cellPadV, left: 1.4, right: 1.4 },
        minCellHeight: preset.minCellHeight,
        textColor: [15, 23, 42],
        lineColor: LINE_BLACK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: colNo },
        1: { halign: 'center', fontStyle: 'bold', cellWidth: colMeja },
        2: { halign: 'center', fontStyle: 'bold', cellWidth: colNoPes },
        3: { halign: 'center', cellWidth: colNis },
        4: { halign: 'center', cellWidth: colNisn },
        5: { halign: 'left', fontStyle: 'bold', cellWidth: colNama },
        6: { halign: 'center', cellWidth: colKelas },
        7: { halign: 'center', fontStyle: 'bold', cellWidth: colLp },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })
  );

  let afterY = tableEndY + 3.5;

  // Class breakdown summary line + Signatures kept on the same page
  if (afterY + summaryStripH + 33 > pageHeight - 4) {
    doc.addPage();
    afterY = 16;
  }

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.35);
  doc.rect(marginX, afterY, contentWidth, summaryStripH, 'FD');

  const detailBreakdown =
    Array.from(classStatsMap.entries())
      .map(([cls, st]) => `${cls}: ${st.total} (${st.l}L/${st.p}P)`)
      .join('  •  ') || '-';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text(
    fitSingleLineText(
      doc,
      `Rekap Peserta: Total ${roomStudents.length} Siswa (L: ${maleCount}, P: ${femaleCount})  |  ${detailBreakdown}`,
      contentWidth - 6
    ),
    marginX + 3,
    afterY + 4.7
  );

  // Official signatures
  const sigTopY = afterY + summaryStripH + 6;
  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);

  const leftSigX = marginX + 34;
  const rightSigX = pageWidth - marginX - 34;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(15, 23, 42);
  doc.text('Mengetahui,', leftSigX, sigTopY, { align: 'center' });
  doc.text('Kepala Sekolah,', leftSigX, sigTopY + 4.2, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'headmaster', leftSigX, sigTopY + 5.2, {
    sigW: 30,
    sigH: 13.5,
    stampSize: 25,
  });
  const hmName = settings.headmaster || '-';
  doc.setFont('helvetica', 'bold');
  doc.text(hmName, leftSigX, sigTopY + 21.5, { align: 'center' });
  const hmW = doc.getTextWidth(hmName);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.25);
  doc.line(leftSigX - hmW / 2, sigTopY + 22.1, leftSigX + hmW / 2, sigTopY + 22.1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, leftSigX, sigTopY + 25.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.0);
  doc.text(`${cityLabel}, ${dateLabel}`, rightSigX, sigTopY, { align: 'center' });
  doc.text('Ketua Panitia Ujian,', rightSigX, sigTopY + 4.2, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'committee', rightSigX, sigTopY + 5.2, {
    sigW: 30,
    sigH: 13.5,
  });
  const comName = settings.committeeHead || '-';
  doc.setFont('helvetica', 'bold');
  doc.text(comName, rightSigX, sigTopY + 21.5, { align: 'center' });
  const comW = doc.getTextWidth(comName);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.25);
  doc.line(rightSigX - comW / 2, sigTopY + 22.1, rightSigX + comW / 2, sigTopY + 22.1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, rightSigX, sigTopY + 25.5, { align: 'center' });
}

/**
 * Export Exam Participant Roster per Room (Data Peserta Ujian Tiap Ruang) to PDF for 1 room.
 */
export function exportRoomParticipantsPdf(
  room: Room,
  students: Student[],
  settings: ExamSettings
): void {
  const doc = createPdfDoc('portrait', settings);
  renderRoomParticipantsPages(doc, room, students, settings);
  doc.save(`Data_Peserta_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}

/**
 * Export Exam Participant Roster per Room (Data Peserta Ujian Tiap Ruang) for all rooms bundled into 1 PDF.
 */
export function exportAllRoomParticipantsPdf(
  rooms: Room[],
  students: Student[],
  settings: ExamSettings
): void {
  if (rooms.length === 0) return;
  const doc = createPdfDoc('portrait', settings);
  rooms.forEach((room, idx) => {
    if (idx > 0) doc.addPage();
    renderRoomParticipantsPages(doc, room, students, settings);
  });
  doc.save(`Data_Peserta_Semua_Ruang_${rooms.length}R_${Date.now()}.pdf`);
}

/**
 * Export Student Exam Cards (Kartu Peserta Ujian)
 * Layouts 4 cards per page in a 2x2 grid with dotted cut borders
 */
/**
 * Export Student Exam Cards (Kartu Peserta Ujian Lengkap)
 * Layouts 2 cards per page (top & bottom) containing:
 * - Kop Sekolah & Dua Logo
 * - Nama Kegiatan & Tahun Ajaran
 * - Identitas Peserta Lengkap (NIS, Nama, Kelas, No Meja, Ruang)
 * - Tabel Jadwal Ujian
 * - Kolom TTD / Paraf Pengawas Ruang per Mata Pelajaran
 * - Pengesahan Panitia & TTD Siswa
 */
export function exportExamCardsPdf(
  students: Student[],
  settings: ExamSettings,
  schedules?: ExamScheduleItem[],
  roomIdFilter?: string
): void {
  const doc = createPdfDoc('portrait', settings);

  const filteredStudents = roomIdFilter
    ? students.filter((s) => s.roomId === roomIdFilter)
    : students.filter((s) => s.roomId); // Only allocated students

  if (filteredStudents.length === 0) {
    throw new Error('Tidak ada siswa yang teralokasi pada ruangan ini.');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const cardWidth = Math.min(188, pageWidth - 20); // mm
  const twoCardHeight = Math.min(150, Math.floor((pageHeight - 18) / 2)); // mm
  const singleCardHeight = Math.floor(pageHeight - 18); // mm
  const marginX = (pageWidth - cardWidth) / 2;
  const topY0 = 6;

  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);

  let usedHeightOnCurrentPage = 0;
  let cardsOnCurrentPage = 0;

  filteredStudents.forEach((student, index) => {
    const visibleSchedules = getSchedulesForStudentCard(student, schedules);
    const rowCount = visibleSchedules.length;
    const useFullPageCard = rowCount > 14;
    const cardHeight = useFullPageCard ? singleCardHeight : twoCardHeight;

    if (
      index > 0 &&
      (useFullPageCard ||
        cardsOnCurrentPage >= 2 ||
        usedHeightOnCurrentPage + cardHeight + 6 > pageHeight - 6)
    ) {
      doc.addPage();
      usedHeightOnCurrentPage = 0;
      cardsOnCurrentPage = 0;
    }

    const y = cardsOnCurrentPage === 0 ? topY0 : topY0 + usedHeightOnCurrentPage + 6;
    const x = marginX;
    const gradeLevel = extractGradeLevel(student.className);
    const gradeTheme = getGradeLevelColorTheme(student.className, settings.gradeColors);

    // Card Soft Pastel Background + Crisp Grade-Colored Outer Border
    doc.setFillColor(...gradeTheme.cardBgRgb);
    doc.setDrawColor(...gradeTheme.headerBgRgb);
    doc.setLineWidth(0.75);
    doc.rect(x, y, cardWidth, cardHeight, 'FD');

    // Grade-Colored Header Banner Strip
    doc.setFillColor(...gradeTheme.headerBgRgb);
    doc.rect(x + 0.3, y + 0.3, cardWidth - 0.6, 16.2, 'F');
    doc.setDrawColor(...gradeTheme.headerBgRgb);
    doc.setLineWidth(0.5);
    doc.line(x, y + 16.5, x + cardWidth, y + 16.5);

    // White rounded backing frames so Pemda & School logos stay crisp on colored header
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x + 2.6, y + 1.2, 14.3, 14.3, 1.2, 1.2, 'F');
    doc.roundedRect(x + cardWidth - 16.9, y + 1.2, 14.3, 14.3, 1.2, 1.2, 'F');

    // Left Logo (Pemda) & Right Logo (School)
    addImageSafe(doc, settings.logoLeftPemda, x + 3, y + 1.6, 13.5, 13.5);
    addImageSafe(doc, settings.logoRightSchool, x + cardWidth - 16.5, y + 1.6, 13.5, 13.5);

    // Kop Text (high contrast white on colored header)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...gradeTheme.headerTextRgb);
    doc.text(settings.schoolName.toUpperCase(), x + cardWidth / 2, y + 5.5, { align: 'center' });

    doc.setFontSize(10.5);
    doc.setTextColor(...gradeTheme.headerTextRgb);
    doc.text('KARTU PESERTA UJIAN', x + cardWidth / 2, y + 10.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...gradeTheme.headerTextRgb);
    doc.text(
      `${settings.activityName || settings.examTitle} - TAHUN AJARAN ${settings.academicYear}`.toUpperCase(),
      x + cardWidth / 2,
      y + 14.5,
      { align: 'center' }
    );

    // Photo Box (2x3 format) with white interior & grade-colored frame
    const photoX = x + 4.5;
    const photoY = y + 19.2;
    doc.setFillColor(255, 255, 255);
    doc.rect(photoX, photoY, 17.5, 23, 'F');
    if (student.photoUrl) {
      addImageSafe(doc, student.photoUrl, photoX + 0.35, photoY + 0.35, 16.8, 22.3);
      doc.setDrawColor(...gradeTheme.headerBgRgb);
      doc.setLineWidth(0.5);
      doc.rect(photoX, photoY, 17.5, 23, 'S');
    } else {
      doc.setDrawColor(...gradeTheme.headerBgRgb);
      doc.setLineWidth(0.45);
      doc.rect(photoX, photoY, 17.5, 23, 'S');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Pas Foto', photoX + 8.75, photoY + 10.5, { align: 'center' });
      doc.text('2 x 3', photoX + 8.75, photoY + 14.5, { align: 'center' });
    }

    // Student Identity Grid (2 Columns next to photo, 1.5 spasi vertical spacing)
    const idX1 = photoX + 21;
    const idX2 = idX1 + 21;
    const idX3 = idX1 + 83;
    const idX4 = idX3 + 20;

    let idY = y + 22.0;
    const printField = (label: string, val: string, xLabel: number, xVal: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(51, 65, 85);
      doc.text(label, xLabel, idY);
      doc.text(':', xLabel + 18, idY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(val, xVal, idY);
    };

    // Row 1
    printField('No. Peserta', student.participantNo || '-', idX1, idX2);
    printField(
      'Ruang Ujian',
      `${student.roomName || '-'} (Meja ${String(student.seatNumber || 1).padStart(2, '0')})`,
      idX3,
      idX4
    );

    // Row 2 (1.5 spasi: 6.1mm step)
    idY += 6.1;
    printField('NIS / NISN', `${student.nis} / ${student.nisn || '-'}`, idX1, idX2);
    printField('Kelas', student.className, idX3, idX4);
    // Grade-level pill badge right beside className (if it fits within card right edge)
    const classValWidth = doc.getTextWidth(student.className || '');
    const badgeLabel = `TINGKAT ${gradeLevel}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    const badgeW = doc.getTextWidth(badgeLabel) + 4.2;
    const badgeX = idX4 + classValWidth + 2.5;
    if (badgeX + badgeW <= x + cardWidth - 3.5) {
      doc.setFillColor(...gradeTheme.badgeBgRgb);
      doc.setDrawColor(...gradeTheme.headerBgRgb);
      doc.setLineWidth(0.32);
      doc.roundedRect(badgeX, idY - 3.3, badgeW, 4.3, 0.9, 0.9, 'FD');
      doc.setTextColor(...gradeTheme.badgeTextRgb);
      doc.text(badgeLabel, badgeX + badgeW / 2, idY - 0.35, { align: 'center' });
    }

    // Row 3
    idY += 6.1;
    printField(
      'Nama Siswa',
      student.name.length > 29 ? student.name.slice(0, 27) + '..' : student.name,
      idX1,
      idX2
    );
    printField('Kelamin', student.gender === 'L' ? 'Laki-Laki (L)' : 'Perempuan (P)', idX3, idX4);

    // Row 4
    idY += 6.1;
    printField('Sesi Ujian', settings.examSession, idX1, idX2);
    printField('Tanggal', settings.examDate || '-', idX3, idX4);

    // Reserve bottom 24mm for Headmaster signature & school stamp
    const sigBlockHeight = 24;
    const sigTopY = y + cardHeight - sigBlockHeight;
    const tableStartY = y + 44.2;
    const availableTableHeight = Math.max(40, sigTopY - tableStartY - 2.0);

    // Determine single-table vs 2-column side-by-side table to keep tabel mapel at 2 spasi without overflow
    const estimatedSingleRowH = 8.5;
    const estimatedSingleTableH = 7.2 + rowCount * estimatedSingleRowH;
    const canFitSingleTable =
      (useFullPageCard && rowCount <= 22) ||
      (rowCount <= 8 && estimatedSingleTableH <= availableTableHeight);

    if (canFitSingleTable) {
      let fontSize = 7.2;
      let headFontSize = 7.2;
      let minCellHeight = 8.5; // 2 spasi untuk tabel mata pelajaran
      let cellPadding = { top: 2.7, bottom: 2.7, left: 1.4, right: 1.4 };

      if (useFullPageCard && rowCount > 18) {
        fontSize = 6.8;
        headFontSize = 7.0;
        minCellHeight = 7.9;
        cellPadding = { top: 2.4, bottom: 2.4, left: 1.3, right: 1.3 };
      }

      const tableBody = visibleSchedules.map((sch, schIdx) => [
        schIdx + 1,
        sch.day || '-',
        sch.date || '-',
        sch.time || '-',
        sch.subject || '-',
        '',
      ]);

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: x + 4.2, right: pageWidth - (x + cardWidth - 4.2) },
        pageBreak: 'avoid',
        head: [['No', 'Hari', 'Tanggal', 'Waktu', 'Mata Pelajaran Ujian', 'Paraf']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: gradeTheme.headerBgRgb,
          textColor: gradeTheme.headerTextRgb,
          lineColor: LINE_BLACK,
          lineWidth: 0.48,
          fontSize: headFontSize,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          cellPadding: { top: 1.8, bottom: 1.8, left: 1.2, right: 1.2 },
        },
        styles: {
          fillColor: [255, 255, 255],
          fontSize,
          cellPadding,
          minCellHeight,
          textColor: [0, 0, 0],
          lineColor: LINE_BLACK,
          lineWidth: 0.42,
          valign: 'middle',
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 7 },
          1: { halign: 'left', cellWidth: 14 },
          2: { halign: 'left', cellWidth: 27 },
          3: { halign: 'center', cellWidth: 27 },
          4: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
          5: { halign: 'center', cellWidth: 22 },
        },
        alternateRowStyles: {
          fillColor: gradeTheme.cardBgRgb,
        },
      });
    } else {
      // Side-by-side 2 tables so many subjects maintain 2 spasi & leave room for Headmaster stamp/TTD
      const half = Math.ceil(rowCount / 2);
      const leftItems = visibleSchedules.slice(0, half);
      const rightItems = visibleSchedules.slice(half);
      const innerPadX = 4.0;
      const gapMm = 2.5;
      const halfTableWidth = (cardWidth - innerPadX * 2 - gapMm) / 2;
      const denseHalf = half > 6 && !useFullPageCard;
      const compactFont = denseHalf ? 5.8 : 6.2;
      const compactMinH = denseHalf ? 7.6 : 8.4;
      const compactPad = denseHalf
        ? { top: 1.85, bottom: 1.85, left: 0.9, right: 0.9 }
        : { top: 2.2, bottom: 2.2, left: 0.95, right: 0.95 };

      const renderHalfTable = (
        items: ExamScheduleItem[],
        startNum: number,
        leftEdge: number,
        rightEdgeMargin: number
      ) => {
        autoTable(doc, {
          startY: tableStartY,
          margin: { left: leftEdge, right: rightEdgeMargin },
          tableWidth: halfTableWidth,
          pageBreak: 'avoid',
          head: [['No', 'Hari, Tanggal & Waktu', 'Mata Pelajaran', 'Paraf']],
          body: items.map((sch, idx) => [
            startNum + idx,
            `${sch.day}, ${sch.date}\n${sch.time}`,
            sch.subject || '-',
            '',
          ]),
          theme: 'grid',
          headStyles: {
            fillColor: gradeTheme.headerBgRgb,
            textColor: gradeTheme.headerTextRgb,
            lineColor: LINE_BLACK,
            lineWidth: 0.45,
            fontSize: 6.0,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            cellPadding: { top: 1.1, bottom: 1.1, left: 0.8, right: 0.8 },
          },
          styles: {
            fillColor: [255, 255, 255],
            fontSize: compactFont,
            cellPadding: compactPad,
            minCellHeight: compactMinH,
            textColor: [0, 0, 0],
            lineColor: LINE_BLACK,
            lineWidth: 0.4,
            valign: 'middle',
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 6 },
            1: { halign: 'left', cellWidth: 31 },
            2: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
            3: { halign: 'center', cellWidth: 12 },
          },
          alternateRowStyles: {
            fillColor: gradeTheme.cardBgRgb,
          },
        });
      };

      renderHalfTable(leftItems, 1, x + innerPadX, pageWidth - (x + innerPadX + halfTableWidth));
      renderHalfTable(
        rightItems,
        half + 1,
        x + innerPadX + halfTableWidth + gapMm,
        pageWidth - (x + cardWidth - innerPadX)
      );
    }

    // Bottom Right Official Headmaster Signature + School Stamp on Exam Card
    const sigCenterX = x + cardWidth - 36;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(15, 23, 42);
    doc.text(`${cityLabel}, ${dateLabel}`, sigCenterX, sigTopY + 2.2, { align: 'center' });
    doc.text('Kepala Sekolah,', sigCenterX, sigTopY + 5.5, { align: 'center' });

    renderPdfStampAndSignature(doc, settings, 'headmaster', sigCenterX, sigTopY + 6.0, {
      sigW: 28,
      sigH: 12.5,
      stampSize: 22.5,
    });

    const headmasterName = settings.headmaster || '-';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(0, 0, 0);
    doc.text(headmasterName, sigCenterX, sigTopY + 19.3, { align: 'center' });
    const nameWidth = doc.getTextWidth(headmasterName);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(
      sigCenterX - nameWidth / 2,
      sigTopY + 19.9,
      sigCenterX + nameWidth / 2,
      sigTopY + 19.9
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(51, 65, 85);
    doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigCenterX, sigTopY + 22.8, {
      align: 'center',
    });

    cardsOnCurrentPage += 1;
    usedHeightOnCurrentPage = (y - topY0) + cardHeight;

    // Dotted cutting line between 2 cards on the same page
    if (!useFullPageCard && cardsOnCurrentPage === 1 && index < filteredStudents.length - 1) {
      const cutY = y + cardHeight + 3.0;
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.3);
      doc.line(x - 5, cutY, x + cardWidth + 5, cutY);
      doc.setFontSize(6.0);
      doc.setTextColor(100, 116, 139);
      doc.text(
        '- - - - - - - - - - - - - - - - - - Gunting Di Sini - - - - - - - - - - - - - - - - - -',
        pageWidth / 2,
        cutY + 1.8,
        { align: 'center' }
      );
      doc.setLineDashPattern([], 0);
    }
  });

  doc.save(`Kartu_Peserta_Ujian_Lengkap_${Date.now()}.pdf`);
}

/**
 * Export single student exam card to PDF immediately
 */
export function exportSingleStudentCardPdf(
  student: Student,
  settings: ExamSettings,
  schedules?: ExamScheduleItem[]
): void {
  exportExamCardsPdf([student], settings, schedules);
}

/**
 * Export cuttable Exam Desk Cards (Kartu Meja Peserta) to PDF with distinct colors per grade level (tingkat kelas).
 * Supports 8 cards/page (2x4) or 10 cards/page (2x5) on A4 Portrait.
 */
export function exportDeskCardsPdf(
  students: Student[],
  rooms: Room[],
  settings: ExamSettings,
  options?: {
    roomIdFilter?: string;
    classFilter?: string;
    cardsPerPage?: 8 | 10;
    colorStyle?: 'full' | 'header';
  }
): void {
  const roomMap = new Map<string, Room>();
  const roomOrderMap = new Map<string, number>();
  rooms.forEach((r, idx) => {
    roomMap.set(r.id, r);
    roomOrderMap.set(r.id, idx);
  });

  const roomIdFilter = options?.roomIdFilter && options.roomIdFilter !== 'ALL' ? options.roomIdFilter : undefined;
  const classFilter = options?.classFilter && options.classFilter !== 'ALL' ? options.classFilter : undefined;
  const cardsPerPage: 8 | 10 = options?.cardsPerPage === 10 ? 10 : 8;
  const colorStyle = options?.colorStyle || 'full';

  const filteredStudents = students
    .filter((s) => Boolean(s.roomId))
    .filter((s) => (!roomIdFilter ? true : s.roomId === roomIdFilter))
    .filter((s) => (!classFilter ? true : (s.className?.trim() || 'Tanpa Kelas') === classFilter))
    .sort((a, b) => {
      const rA = roomOrderMap.get(a.roomId || '') ?? 9999;
      const rB = roomOrderMap.get(b.roomId || '') ?? 9999;
      if (rA !== rB) return rA - rB;
      return (a.seatNumber || 0) - (b.seatNumber || 0);
    });

  if (filteredStudents.length === 0) {
    throw new Error('Tidak ada peserta teralokasi yang sesuai dengan filter untuk dicetak ke Kartu Meja.');
  }

  const doc = createPdfDoc('portrait', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const cols = 2;
  const rows = cardsPerPage === 10 ? 5 : 4;
  const marginX = 10;
  const topStartY = 13;
  const bottomMargin = 9;
  const colGap = 6;
  const rowGap = cardsPerPage === 10 ? 4.5 : 5;
  const cardW = (pageWidth - marginX * 2 - colGap) / cols; // 92mm
  const cardH = (pageHeight - topStartY - bottomMargin - rowGap * (rows - 1)) / rows;
  const totalPages = Math.ceil(filteredStudents.length / cardsPerPage);

  const drawPageHeader = (pageNum: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const scopeText = roomIdFilter
      ? roomMap.get(roomIdFilter)?.name || 'Ruang Terpilih'
      : classFilter
        ? `Kelas ${classFilter}`
        : 'Semua Ruang';
    doc.text(
      `KARTU MEJA PESERTA UJIAN (${scopeText.toUpperCase()}) — ${(settings.activityName || settings.examTitle).toUpperCase()}`,
      marginX,
      8.5
    );
    doc.setFont('helvetica', 'normal');
    doc.text(`Hal ${pageNum} / ${totalPages}`, pageWidth - marginX, 8.5, { align: 'right' });
  };

  filteredStudents.forEach((student, index) => {
    const posInPage = index % cardsPerPage;
    const pageNum = Math.floor(index / cardsPerPage) + 1;

    if (posInPage === 0) {
      if (index > 0) doc.addPage();
      drawPageHeader(pageNum);
    }

    const col = posInPage % cols;
    const row = Math.floor(posInPage / cols);
    const x = marginX + col * (cardW + colGap);
    const y = topStartY + row * (cardH + rowGap);

    const theme = getGradeLevelColorTheme(student.className, settings.gradeColors);
    const room = student.roomId ? roomMap.get(student.roomId) : undefined;
    const roomNumLabel = room ? formatRoomNumberLabel(room) : student.roomName || '-';
    const roomDisplay = room ? `${room.name} (${room.code})` : student.roomName || '-';

    // Outer dashed cutting guide
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.roundedRect(x - 1.4, y - 1.2, cardW + 2.8, cardH + 2.4, 2, 2, 'S');
    doc.setLineDashPattern([], 0);

    // Card Background & Colored Border
    if (colorStyle === 'full') {
      doc.setFillColor(...theme.cardBgRgb);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.setDrawColor(...theme.borderRgb);
    doc.setLineWidth(0.55);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

    // Colored Header Strip
    const headerH = cardsPerPage === 10 ? 9.5 : 11;
    doc.setFillColor(...theme.headerBgRgb);
    doc.roundedRect(x, y, cardW, headerH, 1.5, 1.5, 'F');
    // Square off bottom corners of header strip
    doc.rect(x, y + headerH - 2, cardW, 2, 'F');

    // Small white logo box in header
    const logoSize = cardsPerPage === 10 ? 6.5 : 7.5;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x + 2.2, y + (headerH - logoSize) / 2, logoSize, logoSize, 0.8, 0.8, 'F');
    if (settings.logoRightSchool) {
      try {
        doc.addImage(
          settings.logoRightSchool,
          'PNG',
          x + 2.5,
          y + (headerH - logoSize) / 2 + 0.3,
          logoSize - 0.6,
          logoSize - 0.6
        );
      } catch {
        // fallback if image fails
      }
    }

    // Header Texts
    const textStartX = x + logoSize + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cardsPerPage === 10 ? 5.8 : 6.2);
    doc.setTextColor(...theme.headerTextRgb);
    const schoolStr = settings.schoolName.toUpperCase();
    doc.text(schoolStr.length > 34 ? schoolStr.slice(0, 32) + '..' : schoolStr, textStartX, y + (cardsPerPage === 10 ? 3.8 : 4.4));

    doc.setFontSize(cardsPerPage === 10 ? 7.2 : 8);
    doc.text('KARTU MEJA UJIAN', textStartX, y + (cardsPerPage === 10 ? 7.4 : 8.5));

    // White Class Badge on Header Right
    const classLabelText = (student.className || '-').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const badgeW = Math.max(15, Math.min(24, doc.getTextWidth(classLabelText) + 5));
    const badgeH = cardsPerPage === 10 ? 5.5 : 6.2;
    const badgeX = x + cardW - badgeW - 2.2;
    const badgeY = y + (headerH - badgeH) / 2;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'F');
    doc.setTextColor(15, 23, 42);
    doc.text(classLabelText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1.1, { align: 'center' });

    // Footer Strip
    const footerH = 5.2;
    const footerY = y + cardH - footerH;
    doc.setFillColor(255, 255, 255);
    doc.rect(x + 0.3, footerY, cardW - 0.6, footerH - 0.3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(x + 0.5, footerY, x + cardW - 0.5, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    const actText = settings.activityName || settings.examTitle;
    doc.text(actText.length > 42 ? actText.slice(0, 40) + '..' : actText, x + 2.8, footerY + 3.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`TA ${settings.academicYear}`, x + cardW - 2.8, footerY + 3.5, { align: 'right' });

    // Body Area
    const bodyTopY = y + headerH + 2.5;
    const bodyAvailH = footerY - bodyTopY - 2;

    // Left Seat Number Box
    const seatBoxW = cardsPerPage === 10 ? 20 : 22;
    const seatBoxX = x + 2.8;
    doc.setFillColor(...theme.seatBoxBgRgb);
    doc.roundedRect(seatBoxX, bodyTopY, seatBoxW, bodyAvailH, 1.4, 1.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...theme.seatBoxTextRgb);
    doc.text('NO. MEJA', seatBoxX + seatBoxW / 2, bodyTopY + (cardsPerPage === 10 ? 4.5 : 6), { align: 'center' });

    doc.setFontSize(cardsPerPage === 10 ? 18 : 21);
    doc.text(
      String(student.seatNumber || 1).padStart(2, '0'),
      seatBoxX + seatBoxW / 2,
      bodyTopY + bodyAvailH / 2 + (cardsPerPage === 10 ? 3 : 3.5),
      { align: 'center' }
    );

    doc.setFontSize(6.5);
    doc.text(`R.${roomNumLabel}`, seatBoxX + seatBoxW / 2, bodyTopY + bodyAvailH - 2.5, { align: 'center' });

    // Right Participant Info
    const infoX = seatBoxX + seatBoxW + 3.2;
    const infoW = cardW - (infoX - x) - 2.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text('NAMA PESERTA', infoX, bodyTopY + 3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cardsPerPage === 10 ? 8.2 : 9);
    doc.setTextColor(15, 23, 42);
    const nameLines = doc.splitTextToSize(student.name.toUpperCase(), infoW);
    doc.text(nameLines[0] || '', infoX, bodyTopY + (cardsPerPage === 10 ? 6.8 : 7.4));
    const hasSecondLine = nameLines.length > 1 && cardsPerPage === 8;
    if (hasSecondLine) {
      doc.setFontSize(8.2);
      doc.text(nameLines[1], infoX, bodyTopY + 11.2);
    }

    const metaY = bodyTopY + (cardsPerPage === 10 ? 11.5 : hasSecondLine ? 16 : 13.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No. Peserta', infoX, metaY);
    doc.text('NIS', infoX + 33, metaY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cardsPerPage === 10 ? 7.2 : 7.8);
    doc.setTextColor(15, 23, 42);
    doc.text(student.participantNo || '-', infoX, metaY + 3.6);
    doc.setFont('helvetica', 'normal');
    doc.text(student.nis || '-', infoX + 33, metaY + 3.6);

    // Bottom Room & Class Tag inside Body
    const tagRowY = bodyTopY + bodyAvailH - 4.8;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(infoX, tagRowY - 1.8, x + cardW - 2.8, tagRowY - 1.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text(roomDisplay, infoX, tagRowY + 2.2);

    // Colored Class Pill inside body
    const clsText = `Kelas ${student.className}`;
    doc.setFontSize(6.5);
    const clsW = Math.max(17, doc.getTextWidth(clsText) + 4.5);
    const clsX = x + cardW - clsW - 2.8;
    doc.setFillColor(...theme.badgeBgRgb);
    doc.roundedRect(clsX, tagRowY - 1, clsW, 4.6, 0.8, 0.8, 'F');
    doc.setTextColor(...theme.badgeTextRgb);
    doc.text(clsText, clsX + clsW / 2, tagRowY + 2.2, { align: 'center' });
  });

  const fileTag = roomIdFilter
    ? (roomMap.get(roomIdFilter)?.code || 'Ruang')
    : classFilter
      ? `Kelas_${classFilter.replace(/\s+/g, '_')}`
      : 'Semua_Ruang';
  doc.save(`Kartu_Meja_Peserta_${fileTag}_${Date.now()}.pdf`);
}

/**
 * Export official exam schedule document (Jadwal Pelaksanaan Ujian) to PDF with Kop Surat
 */
export function exportSchedulePdf(
  schedules: ExamScheduleItem[],
  settings: ExamSettings
): void {
  const doc = createPdfDoc('portrait', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Official Letterhead with dual logos
  const headerBottomY = renderLetterhead(
    doc,
    settings,
    'JADWAL PELAKSANAAN UJIAN',
    `TAHUN AJARAN ${settings.academicYear}`
  );

  // Activity Information Ribbon
  let currentY = headerBottomY + 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Nama Kegiatan', 18, currentY + 6);
  doc.text(':', 46, currentY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.activityName || settings.examTitle, 50, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Tahun Ajaran', 18, currentY + 12);
  doc.text(':', 46, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.academicYear, 50, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Rentang Tanggal', pageWidth - 80, currentY + 6);
  doc.text(':', pageWidth - 52, currentY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.examDate, pageWidth - 48, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Sesi Ujian', pageWidth - 80, currentY + 12);
  doc.text(':', pageWidth - 52, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.examSession, pageWidth - 48, currentY + 12);

  currentY += 21;

  // Schedule Table
  const tableRows = schedules.map((item, idx) => [
    idx + 1,
    `${item.day}\n${item.date}`,
    item.time,
    item.subject,
    item.grade || 'Semua Kelas',
    item.roomNotes || 'Sesi 1',
  ]);

  const finalY = renderAutoTableWithSignature(
    doc,
    'portrait',
    settings,
    currentY,
    40,
    [
      { fontSize: 8.0, headFontSize: 8.5, cellPadV: 2.5, headPadV: 2.2, minCellHeight: 7.0, bottomMargin: 12 },
      { fontSize: 7.6, headFontSize: 8.0, cellPadV: 1.8, headPadV: 1.8, minCellHeight: 5.8, bottomMargin: 10 },
      { fontSize: 7.0, headFontSize: 7.4, cellPadV: 1.2, headPadV: 1.4, minCellHeight: 4.8, bottomMargin: 8 },
    ],
    (preset) => ({
      margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 12 },
      head: [['No', 'Hari & Tanggal', 'Waktu / Jam', 'Mata Pelajaran Ujian', 'Tingkat / Kelas', 'Keterangan']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: preset.headFontSize,
        cellPadding: preset.headPadV,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: preset.fontSize,
        cellPadding: preset.cellPadV,
        minCellHeight: preset.minCellHeight,
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 32 },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        4: { halign: 'center', cellWidth: 26 },
        5: { halign: 'center', cellWidth: 24 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })
  );

  let sigY = finalY + (finalY + 41 > pageHeight - 4 ? 8 : 11);
  if (sigY + 32 > pageHeight - 3) {
    doc.addPage();
    sigY = 25;
  }

  // Official Signatures: Kepala Sekolah & Ketua Panitia
  const sigColLeft = 52;
  const sigColRight = pageWidth - 48;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  // Left: Mengetahui Kepala Sekolah
  doc.text('Mengetahui,', sigColLeft, sigY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, sigY + 5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'headmaster', sigColLeft, sigY + 7);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, sigY + 25, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, sigY + 29, { align: 'center' });

  // Right: Ketua Panitia Ujian
  const schedCity = extractCityFromSettings(settings);
  const todayStr = extractSignatureDateFromSettings(settings);
  doc.setFontSize(8.5);
  doc.text(`${schedCity}, ${todayStr}`, sigColRight, sigY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, sigY + 5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'committee', sigColRight, sigY + 7);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.committeeHead, sigColRight, sigY + 25, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, sigColRight, sigY + 29, { align: 'center' });

  doc.save(`Jadwal_Ujian_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
}

/**
 * Export official participant circulation breakdown per Room & Class (PDF Landscape A4)
 */
export function exportCirculationPdf(
  students: Student[],
  rooms: Room[],
  settings: ExamSettings,
  schedules: ExamScheduleItem[] = [],
  options?: {
    pattern?: CirculationPattern;
    dayCount?: number;
    includeRotation?: boolean;
  }
): void {
  const matrix = buildRoomClassMatrix(students, rooms, settings.customClassOrder);
  const pattern = options?.pattern || 'fixed';
  const includeRotation = options?.includeRotation ?? false;

  const doc = createPdfDoc('landscape', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Official Letterhead
  const headerBottomY = renderLetterhead(
    doc,
    settings,
    'PEMBAGIAN SIRKULASI PESERTA TIAP RUANG DAN KELAS',
    `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN AJARAN ${settings.academicYear}`
  );

  // Meta Info Bar
  let currentY = headerBottomY + 2;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 10, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Total Ruang: ${rooms.length} Ruang   |   Total Kelas: ${matrix.classes.length} Rombel   |   Peserta Teralokasi: ${matrix.grandTotalAllocated} / ${matrix.grandTotalStudents} Siswa (L: ${matrix.grandTotalMale}, P: ${matrix.grandTotalFemale})   |   Kapasitas: ${matrix.grandTotalCapacity} Kursi`,
    pageWidth / 2,
    currentY + 6.3,
    { align: 'center' }
  );

  currentY += 14;

  // Section 1: Matriks Ruang x Kelas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('A. MATRIKS DISTRIBUSI PESERTA PER RUANG DAN KELAS', 14, currentY);
  currentY += 3;

  const matrixHead = [
    [
      'No',
      'Ruang',
      'Lokasi',
      ...matrix.classes,
      'L',
      'P',
      'Jml',
      'Kap',
      'Sisa',
      'Rentang No. Peserta',
    ],
  ];

  const matrixBody: (string | number)[][] = matrix.rows.map((row, idx) => {
    const classCounts = matrix.classes.map((cls) => {
      const cnt = row.byClass[cls]?.count || 0;
      return cnt > 0 ? cnt : '-';
    });
    const pRange =
      row.participantMin && row.participantMax
        ? `${row.participantMin} s/d ${row.participantMax}`
        : '-';

    return [
      idx + 1,
      `${row.room.name} (${row.room.code})`,
      row.room.building,
      ...classCounts,
      row.male,
      row.female,
      row.total,
      row.room.capacity,
      row.remainingSeats,
      pRange,
    ];
  });

  // Footer total row
  const matrixFoot = [
    [
      '',
      'TOTAL KESELURUHAN',
      `${rooms.length} Ruang`,
      ...matrix.classes.map((cls) => matrix.classTotals[cls]?.allocated || 0),
      matrix.grandTotalMale,
      matrix.grandTotalFemale,
      matrix.grandTotalAllocated,
      matrix.grandTotalCapacity,
      matrix.grandTotalRemaining,
      '',
    ],
  ];

  const colStyles: Record<number, { halign?: 'left' | 'center' | 'right'; fontStyle?: 'normal' | 'bold'; cellWidth?: number | 'auto' }> = {
    0: { halign: 'center', cellWidth: 9 },
    1: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
    2: { halign: 'left', cellWidth: 34 },
  };

  matrix.classes.forEach((_, i) => {
    colStyles[3 + i] = { halign: 'center' };
  });

  const baseIdx = 3 + matrix.classes.length;
  colStyles[baseIdx] = { halign: 'center', cellWidth: 10 };
  colStyles[baseIdx + 1] = { halign: 'center', cellWidth: 10 };
  colStyles[baseIdx + 2] = { halign: 'center', fontStyle: 'bold', cellWidth: 12 };
  colStyles[baseIdx + 3] = { halign: 'center', cellWidth: 12 };
  colStyles[baseIdx + 4] = { halign: 'center', cellWidth: 12 };
  colStyles[baseIdx + 5] = { halign: 'center', cellWidth: 42 };

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: matrixHead,
    body: matrixBody,
    foot: matrixFoot,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: 7.5,
      halign: 'center',
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [15, 23, 42],
      lineColor: LINE_DARK,
      lineWidth: GRID_LINE_WIDTH,
      valign: 'middle',
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  let nextY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || currentY + 45) + 8;

  // Section 2: Rekapitulasi Sirkulasi per Kelas
  if (nextY + 40 > pageHeight) {
    doc.addPage();
    nextY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('B. REKAPITULASI SEBARAN SIRKULASI PER KELAS', 14, nextY);
  nextY += 3;

  const classRows = matrix.classSummaries.map((cs, idx) => {
    const distText =
      cs.roomDistributions.length > 0
        ? cs.roomDistributions
            .map((rd) => {
              const seatRange =
                rd.seatMin !== undefined && rd.seatMax !== undefined
                  ? `Meja ${String(rd.seatMin).padStart(2, '0')}-${String(rd.seatMax).padStart(2, '0')}`
                  : '';
              return `${rd.room.name} (${rd.count} siswa${seatRange ? ', ' + seatRange : ''})`;
            })
            .join('  |  ')
        : 'Belum dialokasikan';

    return [
      idx + 1,
      cs.className,
      cs.male,
      cs.female,
      cs.totalStudents,
      cs.allocatedStudents,
      distText,
    ];
  });

  const rotationDays = includeRotation
    ? buildCirculationSchedule(matrix, schedules, pattern, options?.dayCount)
    : [];
  const hasRotationSection = includeRotation && rotationDays.length > 0;

  if (!hasRotationSection) {
    nextY =
      renderAutoTableWithSignature(
        doc,
        'landscape',
        settings,
        nextY,
        36,
        [
          { fontSize: 7.5, headFontSize: 7.5, cellPadV: 2.0, headPadV: 2.0, minCellHeight: 6.0, bottomMargin: 10 },
          { fontSize: 7.0, headFontSize: 7.2, cellPadV: 1.4, headPadV: 1.5, minCellHeight: 5.0, bottomMargin: 8 },
          { fontSize: 6.5, headFontSize: 6.8, cellPadV: 0.9, headPadV: 1.2, minCellHeight: 4.2, bottomMargin: 7 },
        ],
        (preset) => ({
          margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 10 },
          head: [['No', 'Kelas / Rombel', 'L', 'P', 'Total', 'Teralokasi', 'Sebaran Ruang & Nomor Meja']],
          body: classRows,
          theme: 'grid',
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            lineColor: LINE_DARK,
            lineWidth: HEAD_LINE_WIDTH,
            fontSize: preset.headFontSize,
            cellPadding: preset.headPadV,
            halign: 'center',
          },
          styles: {
            fontSize: preset.fontSize,
            cellPadding: preset.cellPadV,
            minCellHeight: preset.minCellHeight,
            textColor: [15, 23, 42],
            lineColor: LINE_DARK,
            lineWidth: GRID_LINE_WIDTH,
            valign: 'middle',
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { halign: 'left', fontStyle: 'bold', cellWidth: 28 },
            2: { halign: 'center', cellWidth: 12 },
            3: { halign: 'center', cellWidth: 12 },
            4: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
            5: { halign: 'center', cellWidth: 18 },
            6: { halign: 'left', cellWidth: 'auto' },
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        })
      ) + 8;
  } else {
    autoTable(doc, {
      startY: nextY,
      margin: { left: 14, right: 14 },
      head: [['No', 'Kelas / Rombel', 'L', 'P', 'Total', 'Teralokasi', 'Sebaran Ruang & Nomor Meja']],
      body: classRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: 7.5,
        halign: 'center',
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 28 },
        2: { halign: 'center', cellWidth: 12 },
        3: { halign: 'center', cellWidth: 12 },
        4: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
        5: { halign: 'center', cellWidth: 18 },
        6: { halign: 'left', cellWidth: 'auto' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    nextY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ||
        nextY + 35) + 8;

    // Section 3: Jadwal Sirkulasi / Rotasi Ruang per Hari Ujian
    if (nextY + 45 > pageHeight) {
      doc.addPage();
      nextY = 16;
    }

    const patternLabelMap: Record<CirculationPattern, string> = {
      fixed: 'Tetap (Tanpa Rotasi Ruang)',
      'rotate-room-forward': 'Rotasi Ruang Maju (+1 Ruang / Hari)',
      'rotate-room-backward': 'Rotasi Ruang Mundur (-1 Ruang / Hari)',
      'rotate-seat-shift': 'Rotasi Pergeseran Meja Dalam Ruang',
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `C. JADWAL SIRKULASI / ROTASI PESERTA PER HARI UJIAN — POLA: ${patternLabelMap[pattern].toUpperCase()}`,
      14,
      nextY
    );
    nextY += 3;

    const rotHead = [['Hari / Tanggal', 'Mata Pelajaran', ...rooms.map((r) => `${r.name} (${r.code})`)]];
    const rotBody = rotationDays.map((day) => [
      `${day.dayLabel}\n${day.dateLabel}`,
      day.subjects.join(', '),
      ...day.roomAssignments.map(
        (ra) => `${ra.sourceGroupLabel} (${ra.studentCount} org)\n${ra.classBreakdownText}\n[${ra.seatShiftNote}]`
      ),
    ]);

    nextY =
      renderAutoTableWithSignature(
        doc,
        'landscape',
        settings,
        nextY,
        36,
        [
          { fontSize: 7.0, headFontSize: 7.5, cellPadV: 2.0, headPadV: 1.8, minCellHeight: 6.5, bottomMargin: 10 },
          { fontSize: 6.5, headFontSize: 7.0, cellPadV: 1.4, headPadV: 1.4, minCellHeight: 5.5, bottomMargin: 8 },
          { fontSize: 6.0, headFontSize: 6.5, cellPadV: 1.0, headPadV: 1.1, minCellHeight: 4.5, bottomMargin: 7 },
        ],
        (preset) => ({
          margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 10 },
          head: rotHead,
          body: rotBody,
          theme: 'grid',
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            lineColor: LINE_DARK,
            lineWidth: HEAD_LINE_WIDTH,
            fontSize: preset.headFontSize,
            cellPadding: preset.headPadV,
            halign: 'center',
          },
          styles: {
            fontSize: preset.fontSize,
            cellPadding: preset.cellPadV,
            minCellHeight: preset.minCellHeight,
            textColor: [15, 23, 42],
            lineColor: LINE_DARK,
            lineWidth: GRID_LINE_WIDTH,
            valign: 'top',
          },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
            1: { halign: 'left', cellWidth: 44 },
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        })
      ) + 8;
  }

  // Official Signatures
  if (nextY + 29 > pageHeight - 3) {
    doc.addPage();
    nextY = 20;
  }

  const sigColLeft = 58;
  const sigColRight = pageWidth - 58;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  doc.text('Mengetahui,', sigColLeft, nextY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, nextY + 4.5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'headmaster', sigColLeft, nextY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, nextY + 25, { align: 'center' });

  const circCity = extractCityFromSettings(settings);
  const todayStr = extractSignatureDateFromSettings(settings);
  doc.setFontSize(8.5);
  doc.text(`${circCity}, ${todayStr}`, sigColRight, nextY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, nextY + 4.5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'committee', sigColRight, nextY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.committeeHead, sigColRight, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, sigColRight, nextY + 25, { align: 'center' });

  doc.save(`Sirkulasi_Peserta_Ruang_Kelas_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
}

/**
 * Helper to draw a single Daily Room Journal page (per room, covering all exam days)
 * matching the uploaded official format.
 */
function renderDailyJournalPage(
  doc: jsPDF,
  room: Room,
  dayGroups: ExamDayGroup[],
  roomStudents: Student[],
  settings: ExamSettings,
  record: DailyRoomJournalRecord,
  blankMode: boolean
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const headerBottomY = renderLetterhead(
    doc,
    settings,
    `JURNAL HARIAN ${(settings.examTitle || 'UJIAN SEKOLAH').toUpperCase()}`,
    `Tahun Ajaran ${settings.academicYear}`
  );

  // Room label (RUANG : 01) left-aligned directly above table
  let curY = headerBottomY + 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`RUANG : ${formatRoomNumberLabel(room)}`, 14, curY);
  curY += 3;

  // Build 3-row nested table head matching screenshot
  const head = [
    [
      { content: 'No.', rowSpan: 3, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Hari, tgl', rowSpan: 3, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Mata Pelajaran', rowSpan: 3, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Nama Pengawas', rowSpan: 3, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Peserta', colSpan: 4, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Paraf', rowSpan: 3, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Ket.', rowSpan: 3, styles: { halign: 'center' as const, valign: 'middle' as const } },
    ],
    [
      { content: 'Harus\nHadir', rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Tidak Hadir', colSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Jml.\nHadir', rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const } },
    ],
    [
      { content: 'Jml', styles: { halign: 'center' as const, valign: 'middle' as const } },
      { content: 'Nomor', styles: { halign: 'center' as const, valign: 'middle' as const } },
    ],
  ];

  // Build body rows grouped by day with vertical rowSpan on No. and Hari, tgl
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRows: any[] = [];
  for (const dg of dayGroups) {
    const span = Math.max(1, dg.sessions.length);
    dg.sessions.forEach((sch, sIdx) => {
      const entry = record.sessions[sch.id];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any[] = [];
      if (sIdx === 0) {
        row.push({
          content: String(dg.dayNumber),
          rowSpan: span,
          styles: { halign: 'center', valign: 'middle' },
        });
        row.push({
          content: `${dg.day},\n${dg.date}`,
          rowSpan: span,
          styles: { halign: 'left', valign: 'middle' },
        });
      }
      row.push(sch.subject);
      const journalInvName = entry?.invigilatorName || '';
      const journalInvNip = journalInvName
        ? getRoomDaySessionInvigilatorNip(room, dg.dayKey, sch.id, settings)
        : '';
      row.push(
        blankMode
          ? ''
          : journalInvNip
            ? `${journalInvName}\nNIP. ${journalInvNip}`
            : journalInvName
      );
      row.push(String(roomStudents.length));
      row.push(blankMode ? '' : entry?.absentCount || '');
      row.push(blankMode ? '' : entry?.absentNumbers || '');
      row.push(blankMode ? '' : entry?.presentCount || '');
      row.push('');
      row.push(blankMode ? '' : entry?.notes || '');
      bodyRows.push(row);
    });
  }

  const tableFinalY = renderAutoTableWithSignature(
    doc,
    'portrait',
    settings,
    curY,
    38,
    [
      { fontSize: 7.8, headFontSize: 7.8, cellPadV: 2.2, headPadV: 1.8, minCellHeight: 8.5, bottomMargin: 12 },
      { fontSize: 7.4, headFontSize: 7.4, cellPadV: 1.5, headPadV: 1.5, minCellHeight: 6.8, bottomMargin: 10 },
      { fontSize: 6.9, headFontSize: 7.0, cellPadV: 1.0, headPadV: 1.2, minCellHeight: 5.4, bottomMargin: 8 },
      { fontSize: 6.4, headFontSize: 6.6, cellPadV: 0.7, headPadV: 1.0, minCellHeight: 4.5, bottomMargin: 7 },
    ],
    (preset) => ({
      margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 12 },
      head,
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [217, 217, 217],
        textColor: [0, 0, 0],
        lineColor: LINE_BLACK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: preset.headFontSize,
        fontStyle: 'bold',
        cellPadding: preset.headPadV,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: preset.fontSize,
        cellPadding: preset.cellPadV,
        textColor: [0, 0, 0],
        lineColor: LINE_BLACK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
        minCellHeight: preset.minCellHeight,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'left', cellWidth: 24 },
        2: { halign: 'left', cellWidth: 42 },
        3: { halign: 'left', cellWidth: 28 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'center', cellWidth: 9 },
        6: { halign: 'center', cellWidth: 15 },
        7: { halign: 'center', cellWidth: 11 },
        8: { halign: 'center', cellWidth: 17 },
        9: { halign: 'left', cellWidth: 16 },
      },
    })
  );

  curY = tableFinalY + (tableFinalY + 37 > pageHeight - 4 ? 6 : 8);

  // Bottom Right Signature: Kepala Sekolah
  if (curY + 30 > pageHeight - 3) {
    doc.addPage();
    curY = 22;
  }

  const sigX = pageWidth - 68;
  const cityLabel = (record.signatureCity || extractCityFromSettings(settings)).trim();
  const dateLine = (
    record.signatureDateText || extractSignatureDateFromSettings(settings, '_____________________')
  ).trim();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`${cityLabel}, ${dateLine}`, sigX, curY);
  doc.text('Kepala Sekolah', sigX, curY + 4.5);
  renderPdfStampAndSignature(doc, settings, 'headmaster', sigX + 16, curY + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigX, curY + 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`NIP ${settings.headmasterNip || '-'}`, sigX, curY + 27.5);
}

/**
 * Export Daily Room Journal PDF for a single room (covering all exam days)
 */
export function exportDailyJournalPdf(
  room: Room,
  dayGroups: ExamDayGroup[],
  roomStudents: Student[],
  settings: ExamSettings,
  record: DailyRoomJournalRecord,
  blankMode = false
): void {
  const doc = createPdfDoc('portrait', settings);

  renderDailyJournalPage(doc, room, dayGroups, roomStudents, settings, record, blankMode);
  doc.save(
    `Jurnal_Harian_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`
  );
}

/**
 * Export bundled Daily Room Journals PDF for all rooms (1 page per room)
 */
export function exportAllDailyJournalsPdf(
  rooms: Room[],
  dayGroups: ExamDayGroup[],
  students: Student[],
  settings: ExamSettings,
  journalMap: Record<string, DailyRoomJournalRecord>,
  blankMode = false
): void {
  const doc = createPdfDoc('portrait', settings);

  rooms.forEach((room, idx) => {
    if (idx > 0) doc.addPage();
    const roomStudents = students
      .filter((s) => s.roomId === room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
    const record = resolveJournalRecord(journalMap, room, dayGroups, settings);
    renderDailyJournalPage(doc, room, dayGroups, roomStudents, settings, record, blankMode);
  });

  doc.save(
    `Bundel_Jurnal_Harian_${rooms.length}Ruang_${Date.now()}.pdf`
  );
}

/**
 * Helper to draw a single Two-Way Handover Berita Acara page (Panitia <-> Pengawas)
 */
function renderHandoverBeritaAcaraPage(
  doc: jsPDF,
  room: Room,
  dayGroup: ExamDayGroup,
  roomStudents: Student[],
  settings: ExamSettings,
  record: HandoverBeritaAcaraRecord,
  directionMode: HandoverDirectionMode,
  blankMode: boolean
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const titleByMode: Record<HandoverDirectionMode, string> = {
    both: 'BERITA ACARA SERAH TERIMA NASKAH & BERKAS UJIAN',
    'to-invigilator': 'BERITA ACARA PENYERAHAN BERKAS (PANITIA KE PENGAWAS)',
    'to-committee': 'BERITA ACARA PENGEMBALIAN BERKAS (PENGAWAS KE PANITIA)',
  };

  const headerBottomY = renderLetterhead(
    doc,
    settings,
    titleByMode[directionMode],
    `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN AJARAN ${settings.academicYear}`
  );

  let curY = headerBottomY - 1;

  // Document number line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Nomor: ${record.documentNumber}`, pageWidth / 2, curY, { align: 'center' });
  curY += 4.5;

  // Opening Narrative & Room Metadata
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, curY, pageWidth - 28, 17, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  const introText = `Pada hari ini, ${dayGroup.day} tanggal ${dayGroup.date} (Hari ke-${dayGroup.dayNumber}), bertempat di Sekretariat Panitia ${settings.schoolName}, telah dilaksanakan serah terima naskah soal dan kelengkapan berkas ujian untuk ${room.name} (${room.code}) — ${room.building} dengan jumlah peserta terdaftar ${roomStudents.length} siswa (Kapasitas ${room.capacity} kursi).`;
  const introLines = doc.splitTextToSize(introText, pageWidth - 36);
  doc.text(introLines, 18, curY + 5);

  curY += 21;

  const dayInvSummary = getRoomDaySessionSummaryLabel(room, dayGroup, settings);
  const invigilatorName = record.invigilator1 || dayInvSummary || '.....................................';
  const invigilatorNipLabel = Array.from(
    new Set(
      getRoomDaySessionEntries(room, dayGroup, settings)
        .map((e) => e.invigilatorNip)
        .filter(Boolean)
    )
  ).join(' / ');
  const resolveSessInv = (scheduleId: string) =>
    record.sessionInvigilators?.[scheduleId] !== undefined
      ? record.sessionInvigilators[scheduleId]
      : getRoomDaySessionInvigilator(room, dayGroup.dayKey, scheduleId, settings);
  const committeeOut = record.committeeOfficerOut || settings.committeeHead || 'Petugas Panitia';
  const committeeIn = record.committeeOfficerIn || settings.committeeHead || 'Petugas Panitia';

  const isCompactHandover =
    directionMode === 'both' && (dayGroup.sessions.length >= 3 || pageHeight < 290);
  const bannerH = isCompactHandover ? 5.8 : 6.5;
  const tableFontH = isCompactHandover ? 6.8 : 7.2;
  const cellPadH = isCompactHandover ? 1.25 : 1.8;
  const sigOffsetH = isCompactHandover ? 13.5 : 17;
  const sigAdvanceH = isCompactHandover ? 19 : 23;

  // =========================================================================
  // TAHAP I: PANITIA -> PENGAWAS RUANG (PENGAMBILAN BERKAS)
  // =========================================================================
  if (directionMode === 'both' || directionMode === 'to-invigilator') {
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(14, curY, pageWidth - 28, bannerH, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isCompactHandover ? 7.5 : 8);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'I. SERAH TERIMA DARI PANITIA KE PENGAWAS RUANG (PENGAMBILAN NASKAH & BERKAS)',
      17,
      curY + (isCompactHandover ? 4.0 : 4.4)
    );
    curY += bannerH + (isCompactHandover ? 2.0 : 2.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(
      `Pukul Pengambilan: ${blankMode ? '.......... WIB' : record.handoverOutTime}   |   Kondisi Segel Amplop: ${blankMode ? '..............................' : record.sealStatusOut}`,
      14,
      curY
    );
    curY += 3;

    const outRows = dayGroup.sessions.map((sch, idx) => {
      const entry = record.sessions[sch.id];
      const sessInv = resolveSessInv(sch.id);
      const subjText =
        !blankMode && dayGroup.sessions.length > 1 && sessInv
          ? `${sch.subject}\n(Pengawas: ${sessInv})`
          : sch.subject;
      return [
        idx + 1,
        `${getSessionDisplayLabel(sch, idx)} (${sch.time})`,
        subjText,
        blankMode ? '' : entry?.questionCopies || String(roomStudents.length + (record.reserveCopies || 0)),
        blankMode ? '' : entry?.answerSheetCopies || String(roomStudents.length + (record.reserveCopies || 0)),
        '1 Set',
        blankMode ? '' : 'Utuh / Lengkap',
      ];
    });

    autoTable(doc, {
      startY: curY,
      margin: { left: 14, right: 14 },
      head: [
        [
          'No',
          'Sesi / Waktu',
          'Mata Pelajaran',
          'Naskah Soal (Eks)',
          'LJU / LJK (Lbr)',
          'Daftar Hadir & BA',
          'Kondisi Segel / Ket.',
        ],
      ],
      body: outRows,
      theme: 'grid',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: tableFontH,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: tableFontH,
        cellPadding: cellPadH,
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 32 },
        2: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 28 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    curY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || curY + 25) +
      (isCompactHandover ? 2.8 : 3.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Catatan Pengambilan: ${blankMode ? '...................................................................................................................' : record.notesOut || '-'}`,
      14,
      curY
    );
    curY += isCompactHandover ? 3.8 : 5;

    if (curY + 22 > pageHeight - 5) {
      doc.addPage();
      curY = 18;
    }

    // Signatures Stage I
    const sLeft = 52;
    const sRight = pageWidth - 52;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    doc.text('Yang Menyerahkan,', sLeft, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('Petugas / Panitia Ujian', sLeft, curY + 3.6, { align: 'center' });
    doc.text(`( ${committeeOut} )`, sLeft, curY + sigOffsetH, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.text('Yang Menerima,', sRight, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Pengawas ${room.name}`, sRight, curY + 3.6, { align: 'center' });
    doc.text(
      `( ${invigilatorName} )`,
      sRight,
      curY + sigOffsetH,
      { align: 'center' }
    );
    if (invigilatorNipLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.text(`NIP. ${invigilatorNipLabel}`, sRight, curY + sigOffsetH + 3.4, { align: 'center' });
    }

    curY += sigAdvanceH;
  }

  // =========================================================================
  // TAHAP II: PENGAWAS RUANG -> PANITIA (PENGEMBALIAN BERKAS)
  // =========================================================================
  if (directionMode === 'both' || directionMode === 'to-committee') {
    const estimatedStage2PlusValidationH =
      bannerH + 14 + dayGroup.sessions.length * (isCompactHandover ? 7.5 : 9) + sigAdvanceH + 26;
    if (curY + estimatedStage2PlusValidationH > pageHeight - 5) {
      doc.addPage();
      curY = 18;
    }

    doc.setFillColor(15, 118, 110); // teal-700 distinction for return stage
    doc.roundedRect(14, curY, pageWidth - 28, bannerH, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isCompactHandover ? 7.5 : 8);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'II. SERAH TERIMA DARI PENGAWAS RUANG KE PANITIA (PENGEMBALIAN HASIL & BERKAS UJIAN)',
      17,
      curY + (isCompactHandover ? 4.0 : 4.4)
    );
    curY += bannerH + (isCompactHandover ? 2.0 : 2.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(
      `Pukul Pengembalian: ${blankMode ? '.......... WIB' : record.handoverInTime}   |   Kondisi Berkas: ${blankMode ? '..............................' : record.sealStatusIn}`,
      14,
      curY
    );
    curY += 3;

    const inRows = dayGroup.sessions.map((sch, idx) => {
      const entry = record.sessions[sch.id];
      const sessInv = resolveSessInv(sch.id);
      const subjText =
        !blankMode && dayGroup.sessions.length > 1 && sessInv
          ? `${sch.subject}\n(Pengawas: ${sessInv})`
          : sch.subject;
      return [
        idx + 1,
        `${getSessionDisplayLabel(sch, idx)} (${sch.time})`,
        subjText,
        blankMode ? '' : entry?.returnedFilledSheets || '',
        blankMode ? '' : entry?.returnedUnusedSheets || '',
        blankMode ? '' : entry?.returnedQuestionCopies || '',
        blankMode ? '' : entry?.notes || 'Lengkap',
      ];
    });

    autoTable(doc, {
      startY: curY,
      margin: { left: 14, right: 14 },
      head: [
        [
          'No',
          'Sesi / Waktu',
          'Mata Pelajaran',
          'LJU Terisi (Lbr)',
          'Sisa LJU Kosong',
          'Naskah Kembali',
          'Daftar Hadir / Ket.',
        ],
      ],
      body: inRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: tableFontH,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: tableFontH,
        cellPadding: cellPadH,
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 32 },
        2: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 21 },
        4: { halign: 'center', cellWidth: 21 },
        5: { halign: 'center', cellWidth: 21 },
        6: { halign: 'center', cellWidth: 27 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    curY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || curY + 25) +
      (isCompactHandover ? 2.8 : 3.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Catatan Pengembalian: ${blankMode ? '...................................................................................................................' : record.notesIn || '-'}`,
      14,
      curY
    );
    curY += isCompactHandover ? 3.8 : 5;

    if (curY + sigOffsetH + 28 > pageHeight - 4) {
      doc.addPage();
      curY = 18;
    }

    // Signatures Stage II (Reversed: Pengawas hands over, Panitia receives)
    const sLeft = 52;
    const sRight = pageWidth - 52;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    doc.text('Yang Menyerahkan,', sLeft, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Pengawas ${room.name}`, sLeft, curY + 3.6, { align: 'center' });
    doc.text(
      `( ${invigilatorName} )`,
      sLeft,
      curY + sigOffsetH,
      { align: 'center' }
    );
    if (invigilatorNipLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.text(`NIP. ${invigilatorNipLabel}`, sLeft, curY + sigOffsetH + 3.4, { align: 'center' });
    }

    doc.setFont('helvetica', 'normal');
    doc.text('Yang Menerima,', sRight, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('Petugas / Panitia Ujian', sRight, curY + 3.6, { align: 'center' });
    doc.text(`( ${committeeIn} )`, sRight, curY + sigOffsetH, { align: 'center' });

    curY += sigAdvanceH - 1;
  }

  // Final Validation by Ketua Panitia Ujian (kept on the same sheet)
  if (curY + 26 > pageHeight - 3) {
    doc.addPage();
    curY = 20;
  }

  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.line(14, curY - 2, pageWidth - 14, curY - 2);

  const handoverCity = extractCityFromSettings(settings);
  const handoverDate = extractSignatureDateFromSettings(settings);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`${handoverCity}, ${handoverDate}`, pageWidth / 2, curY + 2, { align: 'center' });
  doc.text('Mengetahui & Mengesahkan,', pageWidth / 2, curY + 5.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Ketua Panitia Ujian', pageWidth / 2, curY + 9, { align: 'center' });
  doc.text(settings.committeeHead, pageWidth / 2, curY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, pageWidth / 2, curY + 24.5, { align: 'center' });
}

/**
 * Export single room + day Handover Berita Acara PDF (Panitia <-> Pengawas)
 */
export function exportHandoverBeritaAcaraPdf(
  room: Room,
  dayGroup: ExamDayGroup,
  roomStudents: Student[],
  settings: ExamSettings,
  record: HandoverBeritaAcaraRecord,
  directionMode: HandoverDirectionMode = 'both',
  blankMode = false
): void {
  const doc = createPdfDoc('portrait', settings);

  renderHandoverBeritaAcaraPage(
    doc,
    room,
    dayGroup,
    roomStudents,
    settings,
    record,
    directionMode,
    blankMode
  );

  doc.save(
    `BA_Serah_Terima_${room.name.replace(/\s+/g, '_')}_Hari${dayGroup.dayNumber}_${Date.now()}.pdf`
  );
}

/**
 * Export bundled Handover Berita Acara PDF for all rooms x all days
 */
export function exportAllHandoverBeritaAcaraPdf(
  rooms: Room[],
  dayGroups: ExamDayGroup[],
  students: Student[],
  settings: ExamSettings,
  handoverMap: Record<string, HandoverBeritaAcaraRecord>,
  directionMode: HandoverDirectionMode = 'both',
  blankMode = false
): void {
  const doc = createPdfDoc('portrait', settings);

  let pageIndex = 0;
  for (const room of rooms) {
    const roomStudents = students
      .filter((s) => s.roomId === room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    for (const dayGroup of dayGroups) {
      if (pageIndex > 0) doc.addPage();
      const record = resolveHandoverRecord(handoverMap, room, dayGroup, roomStudents, settings);
      renderHandoverBeritaAcaraPage(
        doc,
        room,
        dayGroup,
        roomStudents,
        settings,
        record,
        directionMode,
        blankMode
      );
      pageIndex += 1;
    }
  }

  doc.save(
    `Bundel_BA_Serah_Terima_${rooms.length}Ruang_${dayGroups.length}Hari_${Date.now()}.pdf`
  );
}

/**
 * Export focused Participant Distribution Matrix PDF (Matriks Distribusi Peserta Ruang x Kelas)
 */
export function exportDistributionMatrixPdf(
  students: Student[],
  rooms: Room[],
  settings: ExamSettings
): void {
  const matrix = buildRoomClassMatrix(students, rooms, settings.customClassOrder);

  const doc = createPdfDoc('landscape', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const headerBottomY = renderLetterhead(
    doc,
    settings,
    'MATRIKS DISTRIBUSI PESERTA TIAP RUANG DAN KELAS',
    `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN AJARAN ${settings.academicYear}`
  );

  let currentY = headerBottomY + 2;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 10, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total Ruang: ${rooms.length} Ruang   |   Rombel Aktif: ${matrix.classes.length} Kelas   |   Peserta Teralokasi: ${matrix.grandTotalAllocated} / ${matrix.grandTotalStudents} Siswa (L: ${matrix.grandTotalMale}, P: ${matrix.grandTotalFemale})   |   Kapasitas Total: ${matrix.grandTotalCapacity} Kursi (Sisa: ${matrix.grandTotalRemaining})`,
    pageWidth / 2,
    currentY + 6.3,
    { align: 'center' }
  );

  currentY += 13;

  const matrixHead = [
    [
      'No',
      'Kode',
      'Ruang Ujian',
      'Lokasi / Gedung',
      ...matrix.classes,
      'L',
      'P',
      'Jml',
      'Kap',
      'Sisa',
      'Rentang No. Peserta',
    ],
  ];

  const matrixBody: (string | number)[][] = matrix.rows.map((row, idx) => {
    const classCounts = matrix.classes.map((cls) => {
      const cnt = row.byClass[cls]?.count || 0;
      return cnt > 0 ? cnt : '-';
    });
    const pRange =
      row.participantMin && row.participantMax
        ? `${row.participantMin} s/d ${row.participantMax}`
        : '-';

    return [
      idx + 1,
      row.room.code,
      row.room.name,
      row.room.building,
      ...classCounts,
      row.male,
      row.female,
      row.total,
      row.room.capacity,
      row.remainingSeats,
      pRange,
    ];
  });

  const matrixFoot = [
    [
      '',
      'TOTAL',
      `${rooms.length} Ruang`,
      '',
      ...matrix.classes.map((cls) => matrix.classTotals[cls]?.allocated || 0),
      matrix.grandTotalMale,
      matrix.grandTotalFemale,
      matrix.grandTotalAllocated,
      matrix.grandTotalCapacity,
      matrix.grandTotalRemaining,
      '',
    ],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colStyles: Record<number, any> = {
    0: { halign: 'center', cellWidth: 9 },
    1: { halign: 'center', fontStyle: 'bold', cellWidth: 13 },
    2: { halign: 'left', fontStyle: 'bold', cellWidth: 26 },
    3: { halign: 'left', cellWidth: 30 },
  };
  matrix.classes.forEach((_, i) => {
    colStyles[4 + i] = { halign: 'center' };
  });
  const baseIdx = 4 + matrix.classes.length;
  colStyles[baseIdx] = { halign: 'center', cellWidth: 10 };
  colStyles[baseIdx + 1] = { halign: 'center', cellWidth: 10 };
  colStyles[baseIdx + 2] = { halign: 'center', fontStyle: 'bold', cellWidth: 11 };
  colStyles[baseIdx + 3] = { halign: 'center', cellWidth: 11 };
  colStyles[baseIdx + 4] = { halign: 'center', cellWidth: 11 };
  colStyles[baseIdx + 5] = { halign: 'center', cellWidth: 38 };

  const tableEndY = renderAutoTableWithSignature(
    doc,
    'landscape',
    settings,
    currentY,
    36,
    [
      { fontSize: 7.4, headFontSize: 7.5, cellPadV: 2.0, headPadV: 2.0, minCellHeight: 6.0, bottomMargin: 10 },
      { fontSize: 7.0, headFontSize: 7.2, cellPadV: 1.4, headPadV: 1.5, minCellHeight: 5.0, bottomMargin: 8 },
      { fontSize: 6.5, headFontSize: 6.8, cellPadV: 0.9, headPadV: 1.2, minCellHeight: 4.2, bottomMargin: 7 },
    ],
    (preset) => ({
      margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 10 },
      head: matrixHead,
      body: matrixBody,
      foot: matrixFoot,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: preset.headFontSize,
        cellPadding: preset.headPadV,
        halign: 'center',
        valign: 'middle',
      },
      footStyles: {
        fillColor: [226, 232, 240],
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontStyle: 'bold',
        fontSize: preset.headFontSize,
        cellPadding: preset.headPadV,
        halign: 'center',
      },
      styles: {
        fontSize: preset.fontSize,
        cellPadding: preset.cellPadV,
        minCellHeight: preset.minCellHeight,
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: colStyles,
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })
  );

  let nextY = tableEndY + (tableEndY + 36 > pageHeight - 4 ? 7 : 9);

  if (nextY + 28 > pageHeight - 3) {
    doc.addPage();
    nextY = 22;
  }

  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);
  const sigColLeft = 58;
  const sigColRight = pageWidth - 58;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  doc.text('Mengetahui,', sigColLeft, nextY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, nextY + 4.5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'headmaster', sigColLeft, nextY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, nextY + 25, { align: 'center' });

  doc.setFontSize(8.5);
  doc.text(`${cityLabel}, ${dateLabel}`, sigColRight, nextY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, nextY + 4.5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'committee', sigColRight, nextY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.committeeHead, sigColRight, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, sigColRight, nextY + 25, { align: 'center' });

  doc.save(`Matriks_Distribusi_Peserta_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
}

/**
 * Export official Invigilator Duty Schedule (Daftar Pengawas Ruang Per Hari) to PDF Landscape A4
 */
export function exportInvigilatorSchedulePdf(
  rooms: Room[],
  schedules: ExamScheduleItem[],
  settings: ExamSettings
): void {
  const dayGroups = buildExamDayGroups(schedules);

  const doc = createPdfDoc('landscape', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const headerBottomY = renderLetterhead(
    doc,
    settings,
    'DAFTAR TUGAS PENGAWAS RUANG UJIAN',
    `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN AJARAN ${settings.academicYear}`
  );

  const totalSessionsCount = dayGroups.reduce((acc, dg) => acc + dg.sessions.length, 0);

  let currentY = headerBottomY + 2;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 10, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Jumlah Ruang: ${rooms.length} Ruang   |   Jumlah Hari Ujian: ${dayGroups.length} Hari (${totalSessionsCount} Sesi)   |   Rasio: 1 Pengawas / Ruang / Sesi`,
    pageWidth / 2,
    currentY + 6.3,
    { align: 'center' }
  );

  currentY += 13;

  const sessionSlots = dayGroups.flatMap((dg) =>
    dg.sessions.map((sch, sIdx) => ({ dg, sch, sIdx }))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const head: any[] = [
    [
      { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'Kode', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'Nama Ruang', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'Lokasi / Gedung', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      ...dayGroups.map((dg) => ({
        content: `Hari ${dg.dayNumber}\n${dg.day}, ${dg.date}`,
        colSpan: Math.max(1, dg.sessions.length),
        styles: { halign: 'center', valign: 'middle' },
      })),
    ],
    sessionSlots.map(({ sch, sIdx }) => ({
      content: `${getSessionDisplayLabel(sch, sIdx)}\n${sch.subject.length > 18 ? sch.subject.slice(0, 16) + '..' : sch.subject}`,
      styles: { halign: 'center', valign: 'middle', fontSize: 6.5, fillColor: [51, 65, 85] },
    })),
  ];

  const body = rooms.map((room, idx) => [
    idx + 1,
    room.code,
    room.name,
    room.building,
    ...sessionSlots.map(({ dg, sch }) => {
      const invName = getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings) || '-';
      const invNip = getRoomDaySessionInvigilatorNip(room, dg.dayKey, sch.id, settings);
      return invNip && invName !== '-' ? `${invName}\nNIP. ${invNip}` : invName;
    }),
  ]);

  const printableW = pageWidth - 28;
  const fixedW = 8 + 12 + 23 + 26; // 69mm
  const slotColW = Math.max(18, (printableW - fixedW) / Math.max(1, sessionSlots.length));
  const tableFontSize = sessionSlots.length >= 8 ? 6.5 : sessionSlots.length >= 5 ? 7 : 7.5;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colStyles: Record<number, any> = {
    0: { halign: 'center', cellWidth: 8 },
    1: { halign: 'center', fontStyle: 'bold', cellWidth: 12 },
    2: { halign: 'left', fontStyle: 'bold', cellWidth: 23 },
    3: { halign: 'left', cellWidth: 26 },
  };
  sessionSlots.forEach((_, i) => {
    colStyles[4 + i] = { halign: 'left', cellWidth: slotColW };
  });

  const tableEndY = renderAutoTableWithSignature(
    doc,
    'landscape',
    settings,
    currentY,
    36,
    [
      { fontSize: tableFontSize, headFontSize: tableFontSize, cellPadV: 1.8, headPadV: 1.8, minCellHeight: 8.0, bottomMargin: 10 },
      { fontSize: Math.min(tableFontSize, 6.8), headFontSize: Math.min(tableFontSize, 6.8), cellPadV: 1.2, headPadV: 1.4, minCellHeight: 6.2, bottomMargin: 8 },
      { fontSize: Math.min(tableFontSize, 6.2), headFontSize: Math.min(tableFontSize, 6.4), cellPadV: 0.85, headPadV: 1.1, minCellHeight: 4.8, bottomMargin: 7 },
    ],
    (preset) => ({
      margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 10 },
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_DARK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: preset.headFontSize,
        cellPadding: preset.headPadV,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: preset.fontSize,
        cellPadding: preset.cellPadV,
        textColor: [15, 23, 42],
        lineColor: LINE_DARK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
        minCellHeight: preset.minCellHeight,
      },
      columnStyles: colStyles,
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    })
  );

  let nextY = tableEndY + (tableEndY + 36 > pageHeight - 4 ? 7 : 9);

  if (nextY + 28 > pageHeight - 3) {
    doc.addPage();
    nextY = 22;
  }

  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);
  const sigColLeft = 58;
  const sigColRight = pageWidth - 58;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  doc.text('Mengetahui,', sigColLeft, nextY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, nextY + 4.5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'headmaster', sigColLeft, nextY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, nextY + 25, { align: 'center' });

  doc.setFontSize(8.5);
  doc.text(`${cityLabel}, ${dateLabel}`, sigColRight, nextY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, nextY + 4.5, { align: 'center' });
  renderPdfStampAndSignature(doc, settings, 'committee', sigColRight, nextY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.committeeHead, sigColRight, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, sigColRight, nextY + 25, { align: 'center' });

  doc.save(`Daftar_Pengawas_Ruang_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
}

/**
 * Export Invigilator Attendance & Signature Sheet (Daftar Hadir & Tanda Tangan Kehadiran Pengawas)
 * Supports:
 * - 'multi-day': Landscape A4 matrix across all exam days with spacious wet-signature cells
 * - 'per-day': Portrait A4 per exam day (specific dayKey or bundled all days) with zig-zag signatures
 */
export function exportInvigilatorAttendancePdf(
  rooms: Room[],
  schedules: ExamScheduleItem[],
  settings: ExamSettings,
  options?: {
    mode?: 'per-day' | 'multi-day';
    dayKey?: string;
  }
): void {
  const mode = options?.mode || 'multi-day';
  const dayGroups = buildExamDayGroups(schedules);

  if (mode === 'multi-day') {
    const doc = createPdfDoc('landscape', settings);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const invigilatorRows = buildUniqueInvigilatorsSummary(rooms, dayGroups, settings);

    const headerBottomY = renderLetterhead(
      doc,
      settings,
      'DAFTAR HADIR DAN TANDA TANGAN PENGAWAS UJIAN',
      `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN AJARAN ${settings.academicYear}`
    );

    const currentY = headerBottomY + 2;
    const daysCount = Math.max(1, dayGroups.length);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const head: any[] = [
      [
        { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Nama Pengawas Ruang', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        {
          content: 'Hari, Tanggal & Tanda Tangan Kehadiran',
          colSpan: daysCount,
          styles: { halign: 'center', valign: 'middle' },
        },
      ],
      dayGroups.map((dg) => ({
        content: `Hari ${dg.dayNumber}\n${dg.day}, ${dg.date}`,
        styles: { halign: 'center', valign: 'middle', fontSize: 7.2 },
      })),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildMultiDayBody = (cellMinH: number): any[] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = invigilatorRows.map((item, idx) => [
        idx + 1,
        item.nip ? `${item.name}\nNIP. ${item.nip}` : item.name,
        ...dayGroups.map((dg) => {
          const assignedCodes = item.dayRoomMap[dg.dayKey];
          if (!assignedCodes || assignedCodes.length === 0) {
            return {
              content: '—',
              styles: { halign: 'center', textColor: [148, 163, 184], minCellHeight: cellMinH },
            };
          }
          return {
            content: assignedCodes.length > 0 && !item.isPlaceholder ? `(${assignedCodes.join(',')})` : '',
            styles: {
              halign: 'right',
              valign: 'bottom',
              fontSize: 6.2,
              textColor: [100, 116, 139],
              minCellHeight: cellMinH,
            },
          };
        }),
      ]);

      rows.push([
        {
          content: 'Jumlah Pengawas Hadir',
          colSpan: 2,
          styles: { halign: 'center', fontStyle: 'bold' },
        },
        ...dayGroups.map(() => ''),
      ]);

      rows.push([
        {
          content: 'Paraf Ketua Panitia',
          colSpan: 2,
          styles: { halign: 'center', fontStyle: 'bold', minCellHeight: Math.max(7.5, cellMinH - 1) },
        },
        ...dayGroups.map(() => ({ content: '', styles: { minCellHeight: Math.max(7.5, cellMinH - 1) } })),
      ]);

      return rows;
    };

    const jumlahRowIdx = invigilatorRows.length;

    const printableW = pageWidth - 28;
    const fixedW = 9 + 60; // 69mm
    const dayColW = Math.max(22, (printableW - fixedW) / daysCount);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colStyles: Record<number, any> = {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 60 },
    };
    dayGroups.forEach((_, i) => {
      colStyles[2 + i] = { halign: 'center', cellWidth: dayColW };
    });

    const tableEndY = renderAutoTableWithSignature(
      doc,
      'landscape',
      settings,
      currentY,
      34,
      [
        { fontSize: 7.8, headFontSize: 7.8, cellPadV: 1.8, headPadV: 1.8, minCellHeight: 11, bottomMargin: 10 },
        { fontSize: 7.4, headFontSize: 7.4, cellPadV: 1.4, headPadV: 1.5, minCellHeight: 9.2, bottomMargin: 8 },
        { fontSize: 7.0, headFontSize: 7.0, cellPadV: 1.0, headPadV: 1.2, minCellHeight: 7.8, bottomMargin: 7 },
        { fontSize: 6.5, headFontSize: 6.8, cellPadV: 0.8, headPadV: 1.0, minCellHeight: 6.8, bottomMargin: 6 },
      ],
      (preset, targetDoc) => ({
        margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 10 },
        head,
        body: buildMultiDayBody(preset.minCellHeight),
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          lineColor: LINE_BLACK,
          lineWidth: HEAD_LINE_WIDTH,
          fontSize: preset.headFontSize,
          cellPadding: preset.headPadV,
          fontStyle: 'bold',
          valign: 'middle',
        },
        styles: {
          fontSize: preset.fontSize,
          cellPadding: preset.cellPadV,
          textColor: [0, 0, 0],
          lineColor: LINE_BLACK,
          lineWidth: GRID_LINE_WIDTH,
          valign: 'middle',
        },
        columnStyles: colStyles,
        didDrawCell: (data) => {
          if (data.section === 'body' && data.row.index === jumlahRowIdx) {
            targetDoc.setDrawColor(...LINE_BLACK);
            targetDoc.setLineWidth(0.75);
            targetDoc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
          }
        },
      })
    );

    let nextY = tableEndY + (tableEndY + 34 > pageHeight - 4 ? 7 : 9);
    if (nextY + 27 > pageHeight - 3) {
      doc.addPage();
      nextY = 22;
    }

    const cityLabel = extractCityFromSettings(settings);
    const dateLabel = extractSignatureDateFromSettings(settings);
    const sigX = pageWidth - 62;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${cityLabel}, ${dateLabel}`, sigX, nextY, { align: 'center' });
    doc.text('Ketua Panitia Ujian,', sigX, nextY + 4.5, { align: 'center' });
    renderPdfStampAndSignature(doc, settings, 'committee', sigX, nextY + 6);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.committeeHead, sigX, nextY + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`NIP. ${settings.committeeNip || '-'}`, sigX, nextY + 24, { align: 'center' });

    doc.save(`Daftar_Hadir_Pengawas_MultiHari_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
    return;
  }

  // MODE 2: PER-DAY PORTRAIT A4 (1 page per exam day, or specific dayKey)
  const targetDays =
    options?.dayKey && options.dayKey !== 'ALL'
      ? dayGroups.filter((dg) => dg.dayKey === options.dayKey)
      : dayGroups;
  const daysToRender = targetDays.length > 0 ? targetDays : dayGroups;

  const doc = createPdfDoc('portrait', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const cityLabel = extractCityFromSettings(settings);

  daysToRender.forEach((dg, dayIdx) => {
    if (dayIdx > 0) doc.addPage();

    const headerBottomY = renderLetterhead(
      doc,
      settings,
      'DAFTAR HADIR & TANDA TANGAN PENGAWAS UJIAN',
      `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN AJARAN ${settings.academicYear}`
    );

    let currentY = headerBottomY + 2;

    // Metadata Info Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...BOX_BORDER_DARK);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('Hari / Tanggal', 18, currentY + 5.2);
    doc.text(':', 44, currentY + 5.2);
    doc.setFont('helvetica', 'bold');
    doc.text(`Hari ke-${dg.dayNumber} — ${dg.day}, ${dg.date}`, 48, currentY + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.text('Sesi & Mapel', 18, currentY + 10.6);
    doc.text(':', 44, currentY + 10.6);
    doc.setFont('helvetica', 'bold');
    const subjSummary = dg.sessions
      .map((s, idx) => `${getSessionDisplayLabel(s, idx)}: ${s.subject} (${s.time})`)
      .join('  |  ');
    const clippedSubj = subjSummary.length > 74 ? subjSummary.slice(0, 72) + '..' : subjSummary;
    doc.text(clippedSubj, 48, currentY + 10.6);

    currentY += 18;

    const hasMultipleSessions = dg.sessions.length > 1;
    let rowCounter = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyRows: any[] = [];

    for (const room of rooms) {
      if (dg.sessions.length === 0) {
        rowCounter += 1;
        const no = rowCounter;
        const isOdd = no % 2 !== 0;
        const defaultName = room.invigilator1 || '-';
        const defaultNip = room.invigilator1Nip?.trim();
        bodyRows.push([
          String(no),
          room.code,
          room.name,
          defaultNip && defaultName !== '-' ? `${defaultName}\nNIP. ${defaultNip}` : defaultName,
          '',
          {
            content: `${no}.`,
            styles: { halign: isOdd ? ('left' as const) : ('center' as const) },
          },
          '',
        ]);
        continue;
      }

      dg.sessions.forEach((sch, sIdx) => {
        rowCounter += 1;
        const no = rowCounter;
        const isOdd = no % 2 !== 0;
        const invName =
          getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings) || '-';
        const invNip = getRoomDaySessionInvigilatorNip(room, dg.dayKey, sch.id, settings);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row: any[] = [String(no)];
        if (sIdx === 0) {
          row.push({
            content: room.code,
            rowSpan: dg.sessions.length,
            styles: { halign: 'center' as const, valign: 'middle' as const, fontStyle: 'bold' as const },
          });
          row.push({
            content: room.name,
            rowSpan: dg.sessions.length,
            styles: { halign: 'left' as const, valign: 'middle' as const },
          });
        }
        if (hasMultipleSessions) {
          row.push(`${getSessionDisplayLabel(sch, sIdx)}\n${sch.subject}`);
        }
        row.push(invNip && invName !== '-' ? `${invName}\nNIP. ${invNip}` : invName);
        row.push('');
        row.push({
          content: `${no}.`,
          styles: { halign: isOdd ? ('left' as const) : ('center' as const) },
        });
        row.push('');
        bodyRows.push(row);
      });
    }

    const headRow = hasMultipleSessions
      ? [['No', 'Kode', 'Ruang Ujian', 'Sesi / Mapel', 'Nama Pengawas Ruang', 'Jam Hadir', 'Tanda Tangan', 'Ket.']]
      : [['No', 'Kode', 'Ruang Ujian', 'Nama Pengawas Ruang', 'Jam Hadir', 'Tanda Tangan', 'Ket.']];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colStyles: Record<number, any> = hasMultipleSessions
      ? {
          0: { halign: 'center', cellWidth: 9 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 13 },
          2: { halign: 'left', cellWidth: 22 },
          3: { halign: 'left', fontSize: 7, cellWidth: 28 },
          4: { halign: 'left', fontStyle: 'bold', cellWidth: 44 },
          5: { halign: 'center', cellWidth: 18 },
          6: { halign: 'left', cellWidth: 33 },
          7: { halign: 'center', cellWidth: 15 },
        }
      : {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
          2: { halign: 'left', cellWidth: 28 },
          3: { halign: 'left', fontStyle: 'bold', cellWidth: 56 },
          4: { halign: 'center', cellWidth: 20 },
          5: { halign: 'left', cellWidth: 36 },
          6: { halign: 'center', cellWidth: 17 },
        };

    const tableEndY = renderAutoTableWithSignature(
      doc,
      'portrait',
      settings,
      currentY,
      36,
      [
        { fontSize: hasMultipleSessions ? 7.5 : 8, headFontSize: hasMultipleSessions ? 7.5 : 8, cellPadV: 1.8, headPadV: 1.8, minCellHeight: 9.5, bottomMargin: 12 },
        { fontSize: 7.2, headFontSize: 7.3, cellPadV: 1.3, headPadV: 1.4, minCellHeight: 7.6, bottomMargin: 10 },
        { fontSize: 6.7, headFontSize: 6.9, cellPadV: 0.9, headPadV: 1.1, minCellHeight: 6.2, bottomMargin: 8 },
        { fontSize: 6.3, headFontSize: 6.6, cellPadV: 0.65, headPadV: 0.95, minCellHeight: 5.2, bottomMargin: 7 },
      ],
      (preset) => ({
        margin: { top: 14, left: 14, right: 14, bottom: preset.bottomMargin ?? 12 },
        head: headRow,
        body: bodyRows,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          lineColor: LINE_BLACK,
          lineWidth: HEAD_LINE_WIDTH,
          fontSize: preset.headFontSize,
          cellPadding: preset.headPadV,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        styles: {
          fontSize: preset.fontSize,
          cellPadding: preset.cellPadV,
          textColor: [0, 0, 0],
          lineColor: LINE_BLACK,
          lineWidth: GRID_LINE_WIDTH,
          valign: 'middle',
          minCellHeight: preset.minCellHeight,
        },
        columnStyles: colStyles,
      })
    );

    let nextY = tableEndY + (tableEndY + 36 > pageHeight - 4 ? 7 : 9);
    if (nextY + 29 > pageHeight - 3) {
      doc.addPage();
      nextY = 22;
    }

    const sigX = pageWidth - 52;
    const perDayDate = (settings.signatureDate || '').trim() || dg.date || '_____________________';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${cityLabel}, ${perDayDate}`, sigX, nextY, {
      align: 'center',
    });
    doc.text('Ketua Panitia Ujian,', sigX, nextY + 5, { align: 'center' });
    renderPdfStampAndSignature(doc, settings, 'committee', sigX, nextY + 6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.committeeHead, sigX, nextY + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`NIP. ${settings.committeeNip || '-'}`, sigX, nextY + 26, { align: 'center' });
  });

  const daySlug =
    daysToRender.length === 1 ? `Hari${daysToRender[0].dayNumber}` : `${daysToRender.length}Hari`;
  doc.save(`Daftar_Hadir_Pengawas_${daySlug}_${Date.now()}.pdf`);
}





import jsPDF from 'jspdf';
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
  getRoomDaySessionInvigilator,
  getRoomDaySessionSummaryLabel,
  getSessionDisplayLabel,
  getScheduleRoomInvigilators,
  getOrderedClassNames,
  getSchedulesForStudentCard,
} from './examDocuments';
import { getClassColorTheme } from './classColors';

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
  const resolvedDailyInv =
    !options?.invigilatorName?.trim() &&
    options?.useDailyInvigilators &&
    target.mode !== 'per-class'
      ? getScheduleRoomInvigilators(target.room, options.schedule, settings).invigilator1
      : '';
  const invigilatorDisplay =
    options?.invigilatorName?.trim() || resolvedDailyInv.trim() || '_________________________';
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

  autoTable(doc, {
    startY: 53,
    margin: { left: 14, right: 14 },
    head: [['No', 'No. Peserta', 'Nama Peserta', 'Tanda Tangan', 'Nilai']],
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineColor: LINE_BLACK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: 8.8,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2.8, bottom: 2.8, left: 2, right: 2 },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 3.1, bottom: 3.1, left: 2, right: 2 },
      minCellHeight: 9.8,
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
  });

  // Bottom Signature Block: Left Pengawas, Right City/Date + Guru Mapel (2-spasi spacing)
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 220;
  let sigY = finalY + 11;
  if (sigY + 34 > pageHeight) {
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
 * Designed with large fonts and clear seat indicators for classroom doors
 */
export function exportDoorPosterPdf(
  room: Room,
  students: Student[],
  settings: ExamSettings
): void {
  const doc = createPdfDoc('portrait', settings);

  const pageWidth = doc.internal.pageSize.getWidth();
  const roomStudents = students
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

  // Big Header banner
  doc.setFillColor(30, 41, 59); // slate-900
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(settings.schoolName.toUpperCase(), pageWidth / 2, 12, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(`DAFTAR PESERTA UJIAN - ${room.name.toUpperCase()}`, pageWidth / 2, 23, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text(`${settings.examTitle} (${settings.academicYear}) | ${room.building}`, pageWidth / 2, 33, { align: 'center' });

  // Quick stats ribbon
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 48, pageWidth - 28, 14, 'F');
  doc.setDrawColor(...BOX_BORDER_DARK);
  doc.setLineWidth(0.4);
  doc.rect(14, 48, pageWidth - 28, 14, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Aturan Kapasitas: ${room.capacity} Meja (${room.columns} Kolom)  |  Terisi: ${roomStudents.length} Siswa  |  Kosong: ${Math.max(0, room.capacity - roomStudents.length)} Meja`, 20, 56);

  const nisList = roomStudents.map((s) => s.nis).sort();
  const nisRange = nisList.length > 0 ? `${nisList[0]} s/d ${nisList[nisList.length - 1]}` : '-';
  doc.text(`Rentang NIS: ${nisRange}  |  Sesi: ${settings.examSession}`, pageWidth - 20, 56, { align: 'right' });

  // Table of students conforming to chair capacity rules (Meja 01 s/d Kapasitas)
  const capacity = Math.max(1, room.capacity);
  const tableData = [];
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

  autoTable(doc, {
    startY: 68,
    head: [['No Meja', 'No Peserta', 'NIS', 'Nama Siswa', 'Kelas', 'JK']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: 9.5,
      halign: 'center',
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: LINE_DARK,
      lineWidth: GRID_LINE_WIDTH,
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 28 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'left', cellWidth: 'auto' },
      4: { halign: 'center', cellWidth: 25 },
      5: { halign: 'center', cellWidth: 22 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  doc.save(`Tempelan_Pintu_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
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
  const cardHeight = Math.min(144, Math.floor((pageHeight - 28) / 2)); // mm
  const marginX = (pageWidth - cardWidth) / 2;
  const topY0 = 9;
  const topY1 = topY0 + cardHeight + 9;

  filteredStudents.forEach((student, index) => {
    const cardIndexOnPage = index % 2;

    if (index > 0 && cardIndexOnPage === 0) {
      doc.addPage();
    }

    const y = cardIndexOnPage === 0 ? topY0 : topY1;
    const x = marginX;

    // Card Outer Border (crisp dark border)
    doc.setDrawColor(...LINE_BLACK);
    doc.setLineWidth(0.6);
    doc.rect(x, y, cardWidth, cardHeight, 'S');

    // Header Background Strip
    doc.setFillColor(248, 250, 252);
    doc.rect(x + 0.3, y + 0.3, cardWidth - 0.6, 17.2, 'F');
    doc.setDrawColor(...LINE_BLACK);
    doc.setLineWidth(0.48);
    doc.line(x, y + 17.5, x + cardWidth, y + 17.5);

    // Left Logo (Pemda)
    if (settings.logoLeftPemda) {
      try {
        doc.addImage(settings.logoLeftPemda, 'PNG', x + 3, y + 1.8, 13.8, 13.8);
      } catch {
        // fallback
      }
    }

    // Right Logo (School)
    if (settings.logoRightSchool) {
      try {
        doc.addImage(settings.logoRightSchool, 'PNG', x + cardWidth - 16.8, y + 1.8, 13.8, 13.8);
      } catch {
        // fallback
      }
    }

    // Kop Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(settings.schoolName.toUpperCase(), x + cardWidth / 2, y + 5.8, { align: 'center' });

    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text('KARTU PESERTA UJIAN', x + cardWidth / 2, y + 10.6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `${settings.activityName || settings.examTitle} - TAHUN AJARAN ${settings.academicYear}`.toUpperCase(),
      x + cardWidth / 2,
      y + 15.1,
      { align: 'center' }
    );

    // Photo Box (2x3 format)
    const photoX = x + 4.5;
    const photoY = y + 20.5;
    doc.setDrawColor(...LINE_DARK);
    doc.setLineWidth(0.38);
    doc.rect(photoX, photoY, 17.5, 23, 'S');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Pas Foto', photoX + 8.75, photoY + 10.5, { align: 'center' });
    doc.text('2 x 3', photoX + 8.75, photoY + 14.5, { align: 'center' });

    // Student Identity Grid (2 Columns next to photo)
    const idX1 = photoX + 21;
    const idX2 = idX1 + 21;
    const idX3 = idX1 + 83;
    const idX4 = idX3 + 20;

    let idY = y + 23.5;
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

    // Row 2
    idY += 5.0;
    printField('NIS / NISN', `${student.nis} / ${student.nisn || '-'}`, idX1, idX2);
    printField('Kelas', student.className, idX3, idX4);

    // Row 3
    idY += 5.0;
    printField(
      'Nama Siswa',
      student.name.length > 29 ? student.name.slice(0, 27) + '..' : student.name,
      idX1,
      idX2
    );
    printField('Kelamin', student.gender === 'L' ? 'Laki-Laki (L)' : 'Perempuan (P)', idX3, idX4);

    // Row 4
    idY += 5.0;
    printField('Sesi Ujian', settings.examSession, idX1, idX2);
    printField('Tanggal', settings.examDate || '-', idX3, idX4);

    // Synchronized schedule for this student (matching grade/class & chronological day/date/time)
    const visibleSchedules = getSchedulesForStudentCard(student, schedules);
    const tableStartY = y + 46.2;
    const rowCount = visibleSchedules.length;

    if (rowCount <= 15) {
      // Single clean table with dedicated Hari, Tanggal, Waktu, Mata Pelajaran, Paraf columns
      let fontSize = 6.9;
      let headFontSize = 7.0;
      let cellPadding = { top: 1.4, bottom: 1.4, left: 1.3, right: 1.3 };
      if (rowCount >= 12) {
        fontSize = 5.75;
        headFontSize = 6.1;
        cellPadding = { top: 0.65, bottom: 0.65, left: 1.0, right: 1.0 };
      } else if (rowCount >= 9) {
        fontSize = 6.25;
        headFontSize = 6.5;
        cellPadding = { top: 0.95, bottom: 0.95, left: 1.15, right: 1.15 };
      }

      const tableBody = visibleSchedules.map((sch, schIdx) => [
        schIdx + 1,
        sch.day || '-',
        sch.date || '-',
        sch.time || '-',
        sch.subject || '-',
        '', // Blank for invigilator signature paraf
      ]);

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: x + 4.2, right: pageWidth - (x + cardWidth - 4.2) },
        pageBreak: 'avoid',
        head: [['No', 'Hari', 'Tanggal', 'Waktu', 'Mata Pelajaran Ujian', 'Paraf']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          lineColor: LINE_BLACK,
          lineWidth: 0.48,
          fontSize: headFontSize,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          cellPadding: { top: 1.25, bottom: 1.25, left: 1.1, right: 1.1 },
        },
        styles: {
          fontSize,
          cellPadding,
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
          fillColor: [248, 250, 252],
        },
      });
    } else {
      // 16+ subjects: render two side-by-side tables so ALL subjects, hari & tanggal fit on 1 card cleanly
      const half = Math.ceil(rowCount / 2);
      const leftItems = visibleSchedules.slice(0, half);
      const rightItems = visibleSchedules.slice(half);
      const innerPadX = 4.0;
      const gapMm = 2.5;
      const halfTableWidth = (cardWidth - innerPadX * 2 - gapMm) / 2;
      const compactFont = rowCount > 24 ? 5.2 : 5.6;
      const compactPad = rowCount > 24
        ? { top: 0.5, bottom: 0.5, left: 0.7, right: 0.7 }
        : { top: 0.65, bottom: 0.65, left: 0.85, right: 0.85 };

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
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            lineColor: LINE_BLACK,
            lineWidth: 0.45,
            fontSize: 5.9,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            cellPadding: { top: 1.0, bottom: 1.0, left: 0.8, right: 0.8 },
          },
          styles: {
            fontSize: compactFont,
            cellPadding: compactPad,
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
            fillColor: [248, 250, 252],
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

    // Dotted cutting line between cards
    if (cardIndexOnPage === 0) {
      const cutY = y + cardHeight + 4.5;
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.3);
      doc.line(x - 5, cutY, x + cardWidth + 5, cutY);
      doc.setFontSize(6.2);
      doc.setTextColor(100, 116, 139);
      doc.text('- - - - - - - - - - - - - - - - - - Gunting Di Sini - - - - - - - - - - - - - - - - - -', pageWidth / 2, cutY + 2, { align: 'center' });
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
 * Export cuttable Exam Desk Cards (Kartu Meja Peserta) to PDF with distinct colors per class.
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
  const orderedClasses = getOrderedClassNames(students, settings.customClassOrder);
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

    const theme = getClassColorTheme(student.className, orderedClasses, settings.classColors);
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

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['No', 'Hari & Tanggal', 'Waktu / Jam', 'Mata Pelajaran Ujian', 'Tingkat / Kelas', 'Keterangan']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
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
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || currentY + 60;
  let sigY = finalY + 12;
  if (sigY + 35 > pageHeight) {
    doc.addPage();
    sigY = 25;
  }

  // Official Signatures: Kepala Sekolah & Ketua Panitia
  const sigColLeft = 45;
  const sigColRight = pageWidth - 45;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  // Left: Mengetahui Kepala Sekolah
  doc.text('Mengetahui,', sigColLeft, sigY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, sigY + 5, { align: 'center' });
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
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || nextY + 35) + 8;

  // Section 3 (Optional): Jadwal Sirkulasi / Rotasi Ruang per Hari Ujian
  if (includeRotation) {
    const rotationDays = buildCirculationSchedule(matrix, schedules, pattern, options?.dayCount);
    if (rotationDays.length > 0) {
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

      autoTable(doc, {
        startY: nextY,
        margin: { left: 14, right: 14 },
        head: rotHead,
        body: rotBody,
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
          fontSize: 7,
          cellPadding: 2,
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
      });

      nextY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || nextY + 40) + 10;
    }
  }

  // Official Signatures
  if (nextY + 32 > pageHeight) {
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
      row.push(blankMode ? '' : entry?.invigilatorName || '');
      row.push(String(roomStudents.length));
      row.push(blankMode ? '' : entry?.absentCount || '');
      row.push(blankMode ? '' : entry?.absentNumbers || '');
      row.push(blankMode ? '' : entry?.presentCount || '');
      row.push('');
      row.push(blankMode ? '' : entry?.notes || '');
      bodyRows.push(row);
    });
  }

  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    head,
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: [217, 217, 217],
      textColor: [0, 0, 0],
      lineColor: LINE_BLACK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: 7.8,
      fontStyle: 'bold',
      cellPadding: 1.8,
      halign: 'center',
      valign: 'middle',
    },
    styles: {
      fontSize: 7.8,
      cellPadding: 2.2,
      textColor: [0, 0, 0],
      lineColor: LINE_BLACK,
      lineWidth: GRID_LINE_WIDTH,
      valign: 'middle',
      minCellHeight: 8.5,
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
  });

  curY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || curY + 80) + 8;

  // Bottom Right Signature: Kepala Sekolah
  if (curY + 34 > pageHeight) {
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
  const resolveSessInv = (scheduleId: string) =>
    record.sessionInvigilators?.[scheduleId] !== undefined
      ? record.sessionInvigilators[scheduleId]
      : getRoomDaySessionInvigilator(room, dayGroup.dayKey, scheduleId, settings);
  const committeeOut = record.committeeOfficerOut || settings.committeeHead || 'Petugas Panitia';
  const committeeIn = record.committeeOfficerIn || settings.committeeHead || 'Petugas Panitia';

  // =========================================================================
  // TAHAP I: PANITIA -> PENGAWAS RUANG (PENGAMBILAN BERKAS)
  // =========================================================================
  if (directionMode === 'both' || directionMode === 'to-invigilator') {
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(14, curY, pageWidth - 28, 6.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'I. SERAH TERIMA DARI PANITIA KE PENGAWAS RUANG (PENGAMBILAN NASKAH & BERKAS)',
      17,
      curY + 4.4
    );
    curY += 9;

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
        fontSize: 7.2,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 7.2,
        cellPadding: 1.8,
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
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || curY + 25) + 3.5;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Catatan Pengambilan: ${blankMode ? '...................................................................................................................' : record.notesOut || '-'}`,
      14,
      curY
    );
    curY += 5;

    // Signatures Stage I
    const sLeft = 52;
    const sRight = pageWidth - 52;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    doc.text('Yang Menyerahkan,', sLeft, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('Petugas / Panitia Ujian', sLeft, curY + 3.8, { align: 'center' });
    doc.text(`( ${committeeOut} )`, sLeft, curY + 17, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.text('Yang Menerima,', sRight, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Pengawas ${room.name}`, sRight, curY + 3.8, { align: 'center' });
    doc.text(
      `( ${invigilatorName} )`,
      sRight,
      curY + 17,
      { align: 'center' }
    );

    curY += 23;
  }

  // =========================================================================
  // TAHAP II: PENGAWAS RUANG -> PANITIA (PENGEMBALIAN BERKAS)
  // =========================================================================
  if (directionMode === 'both' || directionMode === 'to-committee') {
    if (curY + 68 > pageHeight) {
      doc.addPage();
      curY = 18;
    }

    doc.setFillColor(15, 118, 110); // teal-700 distinction for return stage
    doc.roundedRect(14, curY, pageWidth - 28, 6.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'II. SERAH TERIMA DARI PENGAWAS RUANG KE PANITIA (PENGEMBALIAN HASIL & BERKAS UJIAN)',
      17,
      curY + 4.4
    );
    curY += 9;

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
        fontSize: 7.2,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 7.2,
        cellPadding: 1.8,
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
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || curY + 25) + 3.5;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Catatan Pengembalian: ${blankMode ? '...................................................................................................................' : record.notesIn || '-'}`,
      14,
      curY
    );
    curY += 5;

    // Signatures Stage II (Reversed: Pengawas hands over, Panitia receives)
    const sLeft = 52;
    const sRight = pageWidth - 52;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    doc.text('Yang Menyerahkan,', sLeft, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Pengawas ${room.name}`, sLeft, curY + 3.8, { align: 'center' });
    doc.text(
      `( ${invigilatorName} )`,
      sLeft,
      curY + 17,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.text('Yang Menerima,', sRight, curY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('Petugas / Panitia Ujian', sRight, curY + 3.8, { align: 'center' });
    doc.text(`( ${committeeIn} )`, sRight, curY + 17, { align: 'center' });

    curY += 22;
  }

  // Final Validation by Ketua Panitia Ujian
  if (curY + 24 > pageHeight) {
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
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: {
      fontSize: 7.4,
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
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ||
      currentY + 45) + 10;

  if (nextY + 32 > pageHeight) {
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
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, nextY + 25, { align: 'center' });

  doc.setFontSize(8.5);
  doc.text(`${cityLabel}, ${dateLabel}`, sigColRight, nextY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, nextY + 4.5, { align: 'center' });
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
    ...sessionSlots.map(
      ({ dg, sch }) => getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings) || '-'
    ),
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

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head,
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      lineColor: LINE_DARK,
      lineWidth: HEAD_LINE_WIDTH,
      fontSize: tableFontSize,
      halign: 'center',
      valign: 'middle',
    },
    styles: {
      fontSize: tableFontSize,
      cellPadding: 1.8,
      textColor: [15, 23, 42],
      lineColor: LINE_DARK,
      lineWidth: GRID_LINE_WIDTH,
      valign: 'middle',
      minCellHeight: 8,
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  let nextY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ||
      currentY + 45) + 10;

  if (nextY + 32 > pageHeight) {
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
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, nextY + 25, { align: 'center' });

  doc.setFontSize(8.5);
  doc.text(`${cityLabel}, ${dateLabel}`, sigColRight, nextY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, nextY + 4.5, { align: 'center' });
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
        { content: 'Ruang Tugas', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
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
    const body: any[] = invigilatorRows.map((item, idx) => [
      idx + 1,
      item.name,
      item.roomLabels.join(', '),
      ...dayGroups.map((dg) => {
        const assignedCodes = item.dayRoomMap[dg.dayKey];
        if (!assignedCodes || assignedCodes.length === 0) {
          return {
            content: '—',
            styles: { halign: 'center', textColor: [148, 163, 184], minCellHeight: 11 },
          };
        }
        return {
          content: assignedCodes.length > 0 && !item.isPlaceholder ? `(${assignedCodes.join(',')})` : '',
          styles: {
            halign: 'right',
            valign: 'bottom',
            fontSize: 6.2,
            textColor: [100, 116, 139],
            minCellHeight: 11,
          },
        };
      }),
    ]);

    const jumlahRowIdx = body.length;
    body.push([
      {
        content: 'Jumlah Pengawas Hadir',
        colSpan: 3,
        styles: { halign: 'center', fontStyle: 'bold' },
      },
      ...dayGroups.map(() => ''),
    ]);

    body.push([
      {
        content: 'Paraf Ketua Panitia',
        colSpan: 3,
        styles: { halign: 'center', fontStyle: 'bold', minCellHeight: 10 },
      },
      ...dayGroups.map(() => ({ content: '', styles: { minCellHeight: 10 } })),
    ]);

    const printableW = pageWidth - 28;
    const fixedW = 9 + 54 + 28; // 91mm
    const dayColW = Math.max(22, (printableW - fixedW) / daysCount);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colStyles: Record<number, any> = {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 54 },
      2: { halign: 'center', cellWidth: 28 },
    };
    dayGroups.forEach((_, i) => {
      colStyles[3 + i] = { halign: 'center', cellWidth: dayColW };
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_BLACK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: 7.8,
        fontStyle: 'bold',
        valign: 'middle',
      },
      styles: {
        fontSize: 7.8,
        cellPadding: 1.8,
        textColor: [0, 0, 0],
        lineColor: LINE_BLACK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
      },
      columnStyles: colStyles,
      didDrawCell: (data) => {
        if (data.section === 'body' && data.row.index === jumlahRowIdx) {
          doc.setDrawColor(...LINE_BLACK);
          doc.setLineWidth(0.75);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      },
    });

    let nextY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ||
        currentY + 55) + 9;
    if (nextY + 28 > pageHeight) {
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
        bodyRows.push([
          String(no),
          room.code,
          room.name,
          room.invigilator1 || '-',
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
        row.push(invName);
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

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      head: headRow,
      body: bodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: LINE_BLACK,
        lineWidth: HEAD_LINE_WIDTH,
        fontSize: hasMultipleSessions ? 7.5 : 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: hasMultipleSessions ? 7.5 : 8,
        cellPadding: 1.8,
        textColor: [0, 0, 0],
        lineColor: LINE_BLACK,
        lineWidth: GRID_LINE_WIDTH,
        valign: 'middle',
        minCellHeight: 9.5,
      },
      columnStyles: colStyles,
    });

    let nextY =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ||
        currentY + 60) + 10;
    if (nextY + 30 > pageHeight) {
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





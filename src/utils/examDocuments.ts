import {
  ExamScheduleItem,
  ExamDayGroup,
  Room,
  Student,
  ExamSettings,
  DailyRoomJournalRecord,
  HandoverBeritaAcaraRecord,
  JournalSessionEntry,
  HandoverSessionEntry,
  DailyRoomInvigilatorAssignment,
} from '../types';

const JOURNAL_STORAGE_KEY = 'autoexam_daily_journals_v2';
const HANDOVER_STORAGE_KEY = 'autoexam_handover_records_v1';

/**
 * Group schedule items by day + date so daily journals and handover forms
 * are automatically structured per exam day.
 */
export function buildExamDayGroups(schedules: ExamScheduleItem[]): ExamDayGroup[] {
  const source: ExamScheduleItem[] =
    schedules && schedules.length > 0
      ? schedules
      : [
          {
            id: 'fallback-1',
            day: 'Senin',
            date: '20 Oktober 2026',
            time: '07.30 - 09.30 WIB',
            subject: 'Mata Pelajaran Sesi 1',
            grade: 'Semua Kelas',
            roomNotes: 'Sesi 1',
          },
          {
            id: 'fallback-2',
            day: 'Senin',
            date: '20 Oktober 2026',
            time: '10.00 - 11.30 WIB',
            subject: 'Mata Pelajaran Sesi 2',
            grade: 'Semua Kelas',
            roomNotes: 'Sesi 2',
          },
          {
            id: 'fallback-3',
            day: 'Selasa',
            date: '21 Oktober 2026',
            time: '07.30 - 09.30 WIB',
            subject: 'Mata Pelajaran Sesi 1',
            grade: 'Semua Kelas',
            roomNotes: 'Sesi 1',
          },
          {
            id: 'fallback-4',
            day: 'Selasa',
            date: '21 Oktober 2026',
            time: '10.00 - 11.30 WIB',
            subject: 'Mata Pelajaran Sesi 2',
            grade: 'Semua Kelas',
            roomNotes: 'Sesi 2',
          },
        ];

  const grouped = new Map<string, ExamDayGroup>();
  let dayCounter = 0;

  for (const item of source) {
    const dayStr = (item.day || 'Hari').trim();
    const dateStr = (item.date || '-').trim();
    const key = `${dayStr}__${dateStr}`;

    if (!grouped.has(key)) {
      dayCounter += 1;
      grouped.set(key, {
        dayKey: key,
        dayNumber: dayCounter,
        day: dayStr,
        date: dateStr,
        label: `Hari ke-${dayCounter}: ${dayStr}, ${dateStr}`,
        sessions: [],
      });
    }
    grouped.get(key)!.sessions.push(item);
  }

  return Array.from(grouped.values());
}

export function makeRoomDayKey(roomId: string, dayKey: string): string {
  return `${roomId}::${dayKey}`;
}

export function getScheduleDayKey(schedule: Pick<ExamScheduleItem, 'day' | 'date'>): string {
  const dayStr = (schedule.day || 'Hari').trim();
  const dateStr = (schedule.date || '-').trim();
  return `${dayStr}__${dateStr}`;
}

export function getRoomDayInvigilators(
  room: Room,
  dayKey: string,
  settings?: ExamSettings
): { invigilator1: string; invigilator2: string } {
  const key = makeRoomDayKey(room.id, dayKey);
  const entry = settings?.dailyInvigilators?.[key];
  if (entry !== undefined) {
    return {
      invigilator1: entry.invigilator1 || '',
      invigilator2: '',
    };
  }
  return {
    invigilator1: room.invigilator1 || '',
    invigilator2: '',
  };
}

export function getScheduleRoomInvigilators(
  room: Room,
  schedule?: ExamScheduleItem,
  settings?: ExamSettings
): { invigilator1: string; invigilator2: string } {
  if (!schedule) {
    return {
      invigilator1: room.invigilator1 || '',
      invigilator2: '',
    };
  }
  return getRoomDayInvigilators(room, getScheduleDayKey(schedule), settings);
}

export function extractCityFromSettings(settings: ExamSettings): string {
  const addr = (settings.schoolAddress || '').trim();
  if (addr) {
    const parts = addr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }
  return 'Jakarta';
}

export function formatRoomNumberLabel(room: Room): string {
  const nameMatch = room.name.match(/\d+/);
  if (nameMatch) return nameMatch[0].padStart(2, '0');
  const codeMatch = room.code.match(/\d+/);
  if (codeMatch) return codeMatch[0].padStart(2, '0');
  return room.code || room.name;
}

export type AttendanceGroupingMode = 'per-room' | 'per-class' | 'per-room-class';

export type AttendanceTarget =
  | { mode: 'per-room'; room: Room }
  | { mode: 'per-class'; className: string }
  | { mode: 'per-room-class'; room: Room; className: string };

export function getOrderedClassNames(
  students: Student[],
  customClassOrder?: string[]
): string[] {
  const detectedSet = new Set<string>();
  for (const s of students) {
    const cls = s.className?.trim();
    if (cls) detectedSet.add(cls);
  }
  const detected = Array.from(detectedSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  if (customClassOrder && customClassOrder.length > 0) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const c of customClassOrder) {
      if (detectedSet.has(c) && !seen.has(c)) {
        ordered.push(c);
        seen.add(c);
      }
    }
    for (const c of detected) {
      if (!seen.has(c)) ordered.push(c);
    }
    return ordered;
  }

  return detected;
}

export function getOrderedClassNamesInRoom(
  students: Student[],
  roomId: string,
  customClassOrder?: string[]
): string[] {
  const roomStudents = students.filter((s) => s.roomId === roomId);
  return getOrderedClassNames(roomStudents, customClassOrder);
}

export function getRoomClassPairs(
  rooms: Room[],
  students: Student[],
  customClassOrder?: string[]
): Array<{ room: Room; className: string }> {
  const pairs: Array<{ room: Room; className: string }> = [];
  for (const room of rooms) {
    const classesInRoom = getOrderedClassNamesInRoom(students, room.id, customClassOrder);
    for (const className of classesInRoom) {
      pairs.push({ room, className });
    }
  }
  return pairs;
}

export function getStudentsForAttendanceTarget(
  students: Student[],
  target: AttendanceTarget
): Student[] {
  if (target.mode === 'per-room') {
    return students
      .filter((s) => s.roomId === target.room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
  }
  if (target.mode === 'per-room-class') {
    return students
      .filter(
        (s) =>
          s.roomId === target.room.id &&
          (s.className?.trim() || '') === target.className
      )
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
  }
  return students
    .filter((s) => (s.className?.trim() || '') === target.className)
    .sort((a, b) => {
      const pA = a.participantNo || a.nis || '';
      const pB = b.participantNo || b.nis || '';
      const cmp = pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });
}

export function formatAttendanceTargetHeading(target: AttendanceTarget): string {
  if (target.mode === 'per-room') {
    return `RUANG : ${formatRoomNumberLabel(target.room)}`;
  }
  if (target.mode === 'per-class') {
    return `KELAS : ${target.className.toUpperCase() || '-'}`;
  }
  return `RUANG : ${formatRoomNumberLabel(target.room)} — KELAS : ${target.className.toUpperCase() || '-'}`;
}

export function buildDefaultJournalRecord(
  room: Room,
  dayGroups: ExamDayGroup[],
  settings?: ExamSettings
): DailyRoomJournalRecord {
  const sessions: Record<string, JournalSessionEntry> = {};
  for (const dg of dayGroups) {
    const hasDailyEntry =
      settings?.dailyInvigilators?.[makeRoomDayKey(room.id, dg.dayKey)] !== undefined;
    const dayInv = getRoomDayInvigilators(room, dg.dayKey, settings);
    for (const sch of dg.sessions) {
      sessions[sch.id] = {
        scheduleId: sch.id,
        invigilatorName: hasDailyEntry ? dayInv.invigilator1 : '',
        presentCount: '',
        absentCount: '',
        absentNumbers: '',
        notes: '',
      };
    }
  }

  return {
    roomId: room.id,
    signatureCity: settings ? extractCityFromSettings(settings) : 'Jakarta',
    signatureDateText: '_____________________',
    sessions,
  };
}

export function buildDefaultHandoverRecord(
  room: Room,
  dayGroup: ExamDayGroup,
  roomStudents: Student[],
  settings: ExamSettings
): HandoverBeritaAcaraRecord {
  const reserveCopies = 2;
  const studentCount = roomStudents.length;
  const defaultCopies = studentCount > 0 ? String(studentCount + reserveCopies) : '';
  const yearShort = (settings.academicYear || '2026/2027').split('/')[0] || '2026';
  const docNumber = `BA-ST/${room.code || 'R01'}/H${String(dayGroup.dayNumber).padStart(2, '0')}/${yearShort}`;
  const dayInv = getRoomDayInvigilators(room, dayGroup.dayKey, settings);

  const sessions: Record<string, HandoverSessionEntry> = {};
  for (const sch of dayGroup.sessions) {
    sessions[sch.id] = {
      scheduleId: sch.id,
      questionCopies: defaultCopies,
      answerSheetCopies: defaultCopies,
      returnedFilledSheets: '',
      returnedUnusedSheets: '',
      returnedQuestionCopies: '',
      notes: '',
    };
  }

  return {
    roomId: room.id,
    dayKey: dayGroup.dayKey,
    documentNumber: docNumber,
    committeeOfficerOut: settings.committeeHead || 'Petugas Panitia Ujian',
    committeeOfficerIn: settings.committeeHead || 'Petugas Panitia Ujian',
    invigilator1: dayInv.invigilator1,
    invigilator2: '',
    handoverOutTime: '07.10 WIB',
    handoverInTime: '11.45 WIB',
    reserveCopies,
    sealStatusOut: 'Amplop Tersegel Utuh & Lengkap',
    sealStatusIn: 'Lengkap, Tersegel & Sesuai Daftar Hadir',
    notesOut: 'Naskah soal, LJU, daftar hadir, dan berita acara telah diperiksa bersama dalam kondisi utuh.',
    notesIn: 'Seluruh lembar jawaban peserta, sisa berkas, daftar hadir, dan jurnal ruang telah diterima kembali oleh panitia.',
    sessions,
  };
}

export function loadJournalRecords(): Record<string, DailyRoomJournalRecord> {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveJournalRecords(records: Record<string, DailyRoomJournalRecord>): void {
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage quota errors
  }
}

export function loadHandoverRecords(): Record<string, HandoverBeritaAcaraRecord> {
  try {
    const raw = localStorage.getItem(HANDOVER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveHandoverRecords(records: Record<string, HandoverBeritaAcaraRecord>): void {
  try {
    localStorage.setItem(HANDOVER_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage quota errors
  }
}

export function resolveJournalRecord(
  map: Record<string, DailyRoomJournalRecord>,
  room: Room,
  dayGroups: ExamDayGroup[],
  settings?: ExamSettings
): DailyRoomJournalRecord {
  const base = buildDefaultJournalRecord(room, dayGroups, settings);
  const stored = map[room.id];
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    signatureCity: stored.signatureCity !== undefined ? stored.signatureCity : base.signatureCity,
    signatureDateText: stored.signatureDateText !== undefined ? stored.signatureDateText : base.signatureDateText,
    sessions: {
      ...base.sessions,
      ...(stored.sessions || {}),
    },
  };
}

export function resolveHandoverRecord(
  map: Record<string, HandoverBeritaAcaraRecord>,
  room: Room,
  dayGroup: ExamDayGroup,
  roomStudents: Student[],
  settings: ExamSettings
): HandoverBeritaAcaraRecord {
  const key = makeRoomDayKey(room.id, dayGroup.dayKey);
  const base = buildDefaultHandoverRecord(room, dayGroup, roomStudents, settings);
  const stored = map[key];
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    invigilator1: stored.invigilator1 || base.invigilator1,
    invigilator2: '',
    sessions: {
      ...base.sessions,
      ...(stored.sessions || {}),
    },
  };
}

/**
 * Sync existing saved Jurnal Harian and BA Serah Terima records in localStorage
 * when daily invigilators are updated from the Pengawas Per Hari Per Ruang editor.
 */
export function syncStoredDocumentsWithDailyInvigilators(
  dailyMap: Record<string, DailyRoomInvigilatorAssignment>,
  rooms: Room[],
  dayGroups: ExamDayGroup[]
): {
  journalMap: Record<string, DailyRoomJournalRecord>;
  handoverMap: Record<string, HandoverBeritaAcaraRecord>;
} {
  const journalMap = loadJournalRecords();
  let journalChanged = false;

  for (const room of rooms) {
    const existingJournal = journalMap[room.id];
    if (!existingJournal) continue;
    const updatedSessions = { ...existingJournal.sessions };
    let roomChanged = false;

    for (const dg of dayGroups) {
      const assignment = dailyMap[makeRoomDayKey(room.id, dg.dayKey)];
      if (!assignment) continue;
      for (const sch of dg.sessions) {
        const entry = updatedSessions[sch.id];
        if (entry) {
          updatedSessions[sch.id] = {
            ...entry,
            invigilatorName: assignment.invigilator1 || '',
          };
          roomChanged = true;
        }
      }
    }

    if (roomChanged) {
      journalMap[room.id] = {
        ...existingJournal,
        sessions: updatedSessions,
      };
      journalChanged = true;
    }
  }

  if (journalChanged) {
    saveJournalRecords(journalMap);
  }

  const handoverMap = loadHandoverRecords();
  let handoverChanged = false;

  for (const room of rooms) {
    for (const dg of dayGroups) {
      const key = makeRoomDayKey(room.id, dg.dayKey);
      const existingHandover = handoverMap[key];
      const assignment = dailyMap[key];
      if (!existingHandover || !assignment) continue;
      handoverMap[key] = {
        ...existingHandover,
        invigilator1: assignment.invigilator1 || '',
        invigilator2: '',
      };
      handoverChanged = true;
    }
  }

  if (handoverChanged) {
    saveHandoverRecords(handoverMap);
  }

  return { journalMap, handoverMap };
}

export interface InvigilatorSummaryRow {
  name: string;
  isPlaceholder: boolean;
  roomLabels: string[];
  dayRoomMap: Record<string, string[]>; // dayKey -> array of room codes
}

/**
 * Builds an ordered list of invigilators across all exam days and rooms
 * for the Invigilator Attendance & Signature sheet.
 */
export function buildUniqueInvigilatorsSummary(
  rooms: Room[],
  dayGroups: ExamDayGroup[],
  settings?: ExamSettings
): InvigilatorSummaryRow[] {
  const byNormalizedName = new Map<string, InvigilatorSummaryRow>();

  for (const room of rooms) {
    for (const dg of dayGroups) {
      const assigned = getRoomDayInvigilators(room, dg.dayKey, settings).invigilator1.trim();
      if (!assigned) continue;

      const normKey = assigned.toLowerCase();
      let existing = byNormalizedName.get(normKey);
      if (!existing) {
        existing = {
          name: assigned,
          isPlaceholder: /^pengawas\s+ruang/i.test(assigned),
          roomLabels: [],
          dayRoomMap: {},
        };
        byNormalizedName.set(normKey, existing);
      }
      if (!existing.roomLabels.includes(room.code)) {
        existing.roomLabels.push(room.code);
      }
      if (!existing.dayRoomMap[dg.dayKey]) {
        existing.dayRoomMap[dg.dayKey] = [];
      }
      if (!existing.dayRoomMap[dg.dayKey].includes(room.code)) {
        existing.dayRoomMap[dg.dayKey].push(room.code);
      }
    }
  }

  if (byNormalizedName.size === 0) {
    return rooms.map((room) => {
      const dayRoomMap: Record<string, string[]> = {};
      for (const dg of dayGroups) {
        dayRoomMap[dg.dayKey] = [room.code];
      }
      return {
        name: `Pengawas ${room.name}`,
        isPlaceholder: true,
        roomLabels: [room.code],
        dayRoomMap,
      };
    });
  }

  return Array.from(byNormalizedName.values());
}



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

export function makeRoomDaySessionKey(roomId: string, dayKey: string, scheduleId: string): string {
  return `${roomId}::${dayKey}::${scheduleId}`;
}

export function getSessionDisplayLabel(
  sch: Pick<ExamScheduleItem, 'roomNotes'>,
  sessionIndex: number
): string {
  const raw = (sch.roomNotes || '').trim();
  return raw || `Sesi ${sessionIndex + 1}`;
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
): { invigilator1: string; invigilator1Nip: string; invigilator2: string } {
  const key = makeRoomDayKey(room.id, dayKey);
  const entry = settings?.dailyInvigilators?.[key];
  if (entry !== undefined) {
    return {
      invigilator1: entry.invigilator1 || '',
      invigilator1Nip:
        entry.invigilator1Nip !== undefined ? entry.invigilator1Nip || '' : room.invigilator1Nip || '',
      invigilator2: '',
    };
  }
  return {
    invigilator1: room.invigilator1 || '',
    invigilator1Nip: room.invigilator1Nip || '',
    invigilator2: '',
  };
}

export function getRoomDaySessionInvigilator(
  room: Room,
  dayKey: string,
  scheduleId?: string,
  settings?: ExamSettings
): string {
  if (scheduleId && settings?.sessionInvigilators) {
    const sessKey = makeRoomDaySessionKey(room.id, dayKey, scheduleId);
    if (Object.prototype.hasOwnProperty.call(settings.sessionInvigilators, sessKey)) {
      return settings.sessionInvigilators[sessKey] || '';
    }
  }
  return getRoomDayInvigilators(room, dayKey, settings).invigilator1;
}

export function getRoomDaySessionInvigilatorNip(
  room: Room,
  dayKey: string,
  scheduleId?: string,
  settings?: ExamSettings
): string {
  if (scheduleId && settings?.sessionInvigilatorNips) {
    const sessKey = makeRoomDaySessionKey(room.id, dayKey, scheduleId);
    if (Object.prototype.hasOwnProperty.call(settings.sessionInvigilatorNips, sessKey)) {
      return settings.sessionInvigilatorNips[sessKey] || '';
    }
  }
  return getRoomDayInvigilators(room, dayKey, settings).invigilator1Nip;
}

export function hasRoomSessionConfigured(
  roomId: string,
  dayKey: string,
  scheduleId: string,
  settings?: ExamSettings
): boolean {
  const sessKey = makeRoomDaySessionKey(roomId, dayKey, scheduleId);
  if (
    settings?.sessionInvigilators &&
    Object.prototype.hasOwnProperty.call(settings.sessionInvigilators, sessKey)
  ) {
    return true;
  }
  return settings?.dailyInvigilators?.[makeRoomDayKey(roomId, dayKey)] !== undefined;
}

export function getRoomDaySessionEntries(
  room: Room,
  dayGroup: ExamDayGroup,
  settings?: ExamSettings
): Array<{
  schedule: ExamScheduleItem;
  sessionLabel: string;
  invigilatorName: string;
  invigilatorNip: string;
}> {
  return dayGroup.sessions.map((sch, idx) => ({
    schedule: sch,
    sessionLabel: getSessionDisplayLabel(sch, idx),
    invigilatorName: getRoomDaySessionInvigilator(room, dayGroup.dayKey, sch.id, settings).trim(),
    invigilatorNip: getRoomDaySessionInvigilatorNip(room, dayGroup.dayKey, sch.id, settings).trim(),
  }));
}

export function getRoomDaySessionSummaryLabel(
  room: Room,
  dayGroup: ExamDayGroup,
  settings?: ExamSettings
): string {
  const entries = getRoomDaySessionEntries(room, dayGroup, settings);
  const uniqueNames: string[] = [];
  for (const e of entries) {
    if (e.invigilatorName && !uniqueNames.includes(e.invigilatorName)) {
      uniqueNames.push(e.invigilatorName);
    }
  }
  return uniqueNames.join(' / ');
}

export function getScheduleRoomInvigilators(
  room: Room,
  schedule?: ExamScheduleItem,
  settings?: ExamSettings
): { invigilator1: string; invigilator1Nip: string; invigilator2: string } {
  if (!schedule) {
    return {
      invigilator1: room.invigilator1 || '',
      invigilator1Nip: room.invigilator1Nip || '',
      invigilator2: '',
    };
  }
  const dayKey = getScheduleDayKey(schedule);
  return {
    invigilator1: getRoomDaySessionInvigilator(room, dayKey, schedule.id, settings),
    invigilator1Nip: getRoomDaySessionInvigilatorNip(room, dayKey, schedule.id, settings),
    invigilator2: '',
  };
}

export function extractCityFromAddress(schoolAddress?: string): string {
  const addr = (schoolAddress || '').trim();
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

export function extractCityFromSettings(settings: ExamSettings): string {
  const manualCity = (settings.signatureCity || '').trim();
  if (manualCity) {
    return manualCity;
  }
  return extractCityFromAddress(settings.schoolAddress);
}

export function extractSignatureDateFromSettings(
  settings: ExamSettings,
  fallback?: string
): string {
  const manualDate = (settings.signatureDate || '').trim();
  if (manualDate) {
    return manualDate;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  const fromExamDate = (settings.examDate || '').split('-')[0].trim();
  return fromExamDate || '20 Oktober 2026';
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
    for (const sch of dg.sessions) {
      const configured = hasRoomSessionConfigured(room.id, dg.dayKey, sch.id, settings);
      const sessInv = getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings);
      sessions[sch.id] = {
        scheduleId: sch.id,
        invigilatorName: configured ? sessInv : '',
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
    signatureDateText: settings
      ? extractSignatureDateFromSettings(settings, '_____________________')
      : '_____________________',
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
  const dayInvSummary = getRoomDaySessionSummaryLabel(room, dayGroup, settings);
  const sessionInvigilators: Record<string, string> = {};

  const sessions: Record<string, HandoverSessionEntry> = {};
  for (const sch of dayGroup.sessions) {
    sessionInvigilators[sch.id] = getRoomDaySessionInvigilator(
      room,
      dayGroup.dayKey,
      sch.id,
      settings
    );
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
    invigilator1: dayInvSummary,
    invigilator2: '',
    handoverOutTime: '07.10 WIB',
    handoverInTime: '11.45 WIB',
    reserveCopies,
    sealStatusOut: 'Amplop Tersegel Utuh & Lengkap',
    sealStatusIn: 'Lengkap, Tersegel & Sesuai Daftar Hadir',
    notesOut: 'Naskah soal, LJU, daftar hadir, dan berita acara telah diperiksa bersama dalam kondisi utuh.',
    notesIn: 'Seluruh lembar jawaban peserta, sisa berkas, daftar hadir, dan jurnal ruang telah diterima kembali oleh panitia.',
    sessionInvigilators,
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
    sessionInvigilators: {
      ...(base.sessionInvigilators || {}),
      ...(stored.sessionInvigilators || {}),
    },
    sessions: {
      ...base.sessions,
      ...(stored.sessions || {}),
    },
  };
}

/**
 * Sync existing saved Jurnal Harian and BA Serah Terima records in localStorage
 * when invigilators are updated from the Per Hari × Per Ruang × Per Sesi editor.
 */
export function syncStoredDocumentsWithDailyInvigilators(
  dailyMap: Record<string, DailyRoomInvigilatorAssignment>,
  rooms: Room[],
  dayGroups: ExamDayGroup[],
  sessionMap?: Record<string, string>
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
      const dayAssignment = dailyMap[makeRoomDayKey(room.id, dg.dayKey)];
      for (const sch of dg.sessions) {
        const sessKey = makeRoomDaySessionKey(room.id, dg.dayKey, sch.id);
        const hasSessionVal =
          sessionMap && Object.prototype.hasOwnProperty.call(sessionMap, sessKey);
        const resolvedName = hasSessionVal
          ? sessionMap[sessKey] || ''
          : dayAssignment?.invigilator1;
        if (resolvedName === undefined) continue;

        const entry = updatedSessions[sch.id];
        if (entry) {
          updatedSessions[sch.id] = {
            ...entry,
            invigilatorName: resolvedName || '',
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
      if (!existingHandover) continue;

      const dayAssignment = dailyMap[key];
      const nextSessInv: Record<string, string> = {};
      const uniqueNames: string[] = [];
      let anyUpdated = false;

      for (const sch of dg.sessions) {
        const sessKey = makeRoomDaySessionKey(room.id, dg.dayKey, sch.id);
        const hasSessionVal =
          sessionMap && Object.prototype.hasOwnProperty.call(sessionMap, sessKey);
        const val = hasSessionVal
          ? (sessionMap[sessKey] || '').trim()
          : dayAssignment
            ? (dayAssignment.invigilator1 || '').trim()
            : '';
        if (hasSessionVal || dayAssignment) {
          anyUpdated = true;
        }
        nextSessInv[sch.id] = val;
        if (val && !uniqueNames.includes(val)) {
          uniqueNames.push(val);
        }
      }

      if (!anyUpdated) continue;

      handoverMap[key] = {
        ...existingHandover,
        invigilator1: uniqueNames.join(' / '),
        invigilator2: '',
        sessionInvigilators: nextSessInv,
      };
      handoverChanged = true;
    }
  }

  if (handoverChanged) {
    saveHandoverRecords(handoverMap);
  }

  return { journalMap, handoverMap };
}

/**
 * Sync existing saved Jurnal Harian and BA Serah Terima records in localStorage
 * when global signature city, signature date, headmaster, or committee head change.
 */
export function syncStoredDocumentsWithSettings(
  prevSettings: ExamSettings,
  nextSettings: ExamSettings
): {
  journalMap: Record<string, DailyRoomJournalRecord>;
  handoverMap: Record<string, HandoverBeritaAcaraRecord>;
} {
  const prevCity = extractCityFromSettings(prevSettings);
  const nextCity = extractCityFromSettings(nextSettings);
  const prevDate = extractSignatureDateFromSettings(prevSettings, '_____________________');
  const nextDate = extractSignatureDateFromSettings(nextSettings, '_____________________');

  const journalMap = loadJournalRecords();
  let journalChanged = false;

  for (const roomId of Object.keys(journalMap)) {
    const rec = journalMap[roomId];
    if (!rec) continue;
    let updated = rec;
    let changed = false;

    if (!rec.signatureCity || rec.signatureCity === prevCity || prevCity !== nextCity) {
      if (rec.signatureCity !== nextCity) {
        updated = { ...updated, signatureCity: nextCity };
        changed = true;
      }
    }

    if (
      !rec.signatureDateText ||
      rec.signatureDateText === prevDate ||
      rec.signatureDateText === '_____________________' ||
      prevDate !== nextDate
    ) {
      if (rec.signatureDateText !== nextDate) {
        updated = { ...updated, signatureDateText: nextDate };
        changed = true;
      }
    }

    if (changed) {
      journalMap[roomId] = updated;
      journalChanged = true;
    }
  }

  if (journalChanged) {
    saveJournalRecords(journalMap);
  }

  const prevCommitteeHead = (prevSettings.committeeHead || '').trim() || 'Petugas Panitia Ujian';
  const nextCommitteeHead = (nextSettings.committeeHead || '').trim() || 'Petugas Panitia Ujian';

  const handoverMap = loadHandoverRecords();
  let handoverChanged = false;

  for (const key of Object.keys(handoverMap)) {
    const rec = handoverMap[key];
    if (!rec) continue;
    let updated = rec;
    let changed = false;

    if (
      !rec.committeeOfficerOut ||
      rec.committeeOfficerOut === prevCommitteeHead ||
      rec.committeeOfficerOut === 'Petugas Panitia Ujian'
    ) {
      if (rec.committeeOfficerOut !== nextCommitteeHead) {
        updated = { ...updated, committeeOfficerOut: nextCommitteeHead };
        changed = true;
      }
    }

    if (
      !rec.committeeOfficerIn ||
      rec.committeeOfficerIn === prevCommitteeHead ||
      rec.committeeOfficerIn === 'Petugas Panitia Ujian'
    ) {
      if (rec.committeeOfficerIn !== nextCommitteeHead) {
        updated = { ...updated, committeeOfficerIn: nextCommitteeHead };
        changed = true;
      }
    }

    if (changed) {
      handoverMap[key] = updated;
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
  nip?: string;
  isPlaceholder: boolean;
  roomLabels: string[];
  dayRoomMap: Record<string, string[]>; // dayKey -> formatted room/session tags like ["R01·S1,S2"] or ["R01"]
}

/**
 * Builds an ordered list of invigilators across all exam days, rooms, and sessions
 * for the Invigilator Attendance & Signature sheet.
 */
export function buildUniqueInvigilatorsSummary(
  rooms: Room[],
  dayGroups: ExamDayGroup[],
  settings?: ExamSettings
): InvigilatorSummaryRow[] {
  interface TempSummary {
    name: string;
    nip: string;
    isPlaceholder: boolean;
    roomLabels: string[];
    dayRoomSessions: Record<string, Record<string, string[]>>; // dayKey -> room.code -> ['S1', 'S2']
  }

  const byNormalizedName = new Map<string, TempSummary>();

  for (const room of rooms) {
    for (const dg of dayGroups) {
      dg.sessions.forEach((sch, sIdx) => {
        const assigned = getRoomDaySessionInvigilator(
          room,
          dg.dayKey,
          sch.id,
          settings
        ).trim();
        if (!assigned) return;

        const assignedNip = getRoomDaySessionInvigilatorNip(
          room,
          dg.dayKey,
          sch.id,
          settings
        ).trim();

        const normKey = assigned.toLowerCase();
        let existing = byNormalizedName.get(normKey);
        if (!existing) {
          existing = {
            name: assigned,
            nip: assignedNip,
            isPlaceholder: /^pengawas\s+ruang/i.test(assigned),
            roomLabels: [],
            dayRoomSessions: {},
          };
          byNormalizedName.set(normKey, existing);
        } else if (!existing.nip && assignedNip) {
          existing.nip = assignedNip;
        }

        if (!existing.roomLabels.includes(room.code)) {
          existing.roomLabels.push(room.code);
        }
        if (!existing.dayRoomSessions[dg.dayKey]) {
          existing.dayRoomSessions[dg.dayKey] = {};
        }
        if (!existing.dayRoomSessions[dg.dayKey][room.code]) {
          existing.dayRoomSessions[dg.dayKey][room.code] = [];
        }
        const shortSess = `S${sIdx + 1}`;
        if (!existing.dayRoomSessions[dg.dayKey][room.code].includes(shortSess)) {
          existing.dayRoomSessions[dg.dayKey][room.code].push(shortSess);
        }
      });
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
        nip: room.invigilator1Nip?.trim() || undefined,
        isPlaceholder: true,
        roomLabels: [room.code],
        dayRoomMap,
      };
    });
  }

  const daySessionCountMap = new Map<string, number>();
  dayGroups.forEach((dg) => daySessionCountMap.set(dg.dayKey, dg.sessions.length));

  return Array.from(byNormalizedName.values()).map((temp) => {
    const dayRoomMap: Record<string, string[]> = {};
    for (const dg of dayGroups) {
      const roomMap = temp.dayRoomSessions[dg.dayKey];
      if (!roomMap) continue;
      const totalDaySessions = daySessionCountMap.get(dg.dayKey) || 1;
      dayRoomMap[dg.dayKey] = Object.entries(roomMap).map(([code, sessTags]) => {
        if (totalDaySessions <= 1 || sessTags.length >= totalDaySessions) {
          return code;
        }
        return `${code}·${sessTags.join(',')}`;
      });
    }
    return {
      name: temp.name,
      nip: temp.nip || undefined,
      isPlaceholder: temp.isPlaceholder,
      roomLabels: temp.roomLabels,
      dayRoomMap,
    };
  });
}

const MONTH_INDEX_MAP: Record<string, number> = {
  januari: 0,
  jan: 0,
  februari: 1,
  feb: 1,
  pebruari: 1,
  maret: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  may: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  agustus: 7,
  agu: 7,
  ags: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  oktober: 9,
  okt: 9,
  oct: 9,
  november: 10,
  nov: 10,
  nopember: 10,
  nop: 10,
  desember: 11,
  des: 11,
  dec: 11,
};

function parseExamDateTimestamp(dateStr?: string): number | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().toLowerCase();
  if (!clean) return null;

  // ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return Date.UTC(Number(y), Number(m) - 1, Number(d));
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyNumMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyNumMatch) {
    const [, d, m, y] = dmyNumMatch;
    return Date.UTC(Number(y), Number(m) - 1, Number(d));
  }

  // DD Month YYYY (e.g., "20 Oktober 2026" or "20 Okt 2026")
  const textMatch = clean.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/);
  if (textMatch) {
    const day = Number(textMatch[1]);
    const monthName = textMatch[2];
    const year = textMatch[3] ? Number(textMatch[3]) : 2026;
    const monthIdx = MONTH_INDEX_MAP[monthName];
    if (monthIdx !== undefined && day >= 1 && day <= 31) {
      return Date.UTC(year, monthIdx, day);
    }
  }

  return null;
}

function parseStartTimeMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2})[.:](\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scheduleMatchesStudentClass(
  scheduleGrade: string | undefined,
  studentClassName: string | undefined
): boolean {
  const gradeRaw = (scheduleGrade || '').trim();
  const classRaw = (studentClassName || '').trim();
  if (!gradeRaw || !classRaw) return true;

  const gradeUpper = gradeRaw.toUpperCase();
  if (
    gradeUpper.includes('SEMUA') ||
    gradeUpper.includes('ALL') ||
    gradeUpper.includes('UMUM') ||
    gradeUpper === '-'
  ) {
    return true;
  }

  const classUpper = classRaw.toUpperCase();
  if (gradeUpper === classUpper) return true;

  const cleaned = gradeUpper
    .replace(/\b(KELAS|TINGKAT|ROMBEL|KLS)\b/g, ' ')
    .trim();
  const tokens = cleaned
    .split(/[,;/&]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (token === classUpper) return true;
    if (classUpper.startsWith(`${token} `) || classUpper.startsWith(`${token}-`)) {
      return true;
    }
    if (/^\d+$/.test(token) && new RegExp(`^${escapeRegExp(token)}(?:\\D|$)`).test(classUpper)) {
      return true;
    }
    if (new RegExp(`\\b${escapeRegExp(token)}\\b`).test(classUpper)) {
      return true;
    }
  }

  return false;
}

const FALLBACK_CARD_SCHEDULES: ExamScheduleItem[] = [
  { id: '1', day: 'Senin', date: '20 Oktober 2026', time: '07.30 - 09.30 WIB', subject: 'Bahasa Indonesia', grade: 'Semua Kelas' },
  { id: '2', day: 'Senin', date: '20 Oktober 2026', time: '10.00 - 11.30 WIB', subject: 'Pendidikan Agama', grade: 'Semua Kelas' },
  { id: '3', day: 'Selasa', date: '21 Oktober 2026', time: '07.30 - 09.30 WIB', subject: 'Matematika Wajib', grade: 'Semua Kelas' },
  { id: '4', day: 'Selasa', date: '21 Oktober 2026', time: '10.00 - 11.30 WIB', subject: 'Pendidikan Pancasila', grade: 'Semua Kelas' },
  { id: '5', day: 'Rabu', date: '22 Oktober 2026', time: '07.30 - 09.30 WIB', subject: 'Bahasa Inggris', grade: 'Semua Kelas' },
  { id: '6', day: 'Rabu', date: '22 Oktober 2026', time: '10.00 - 11.30 WIB', subject: 'Sejarah Indonesia', grade: 'Semua Kelas' },
];

export function getSchedulesForStudentCard(
  student: Pick<Student, 'className'> | null | undefined,
  schedules?: ExamScheduleItem[]
): ExamScheduleItem[] {
  const source = schedules && schedules.length > 0 ? schedules : FALLBACK_CARD_SCHEDULES;
  const filteredByClass = student?.className
    ? source.filter((item) => scheduleMatchesStudentClass(item.grade, student.className))
    : source;
  const activeList = filteredByClass.length > 0 ? filteredByClass : source;

  return activeList
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const dateA = parseExamDateTimestamp(a.item.date);
      const dateB = parseExamDateTimestamp(b.item.date);
      if (dateA !== null && dateB !== null && dateA !== dateB) {
        return dateA - dateB;
      }
      const sameDayKeyA = getScheduleDayKey(a.item);
      const sameDayKeyB = getScheduleDayKey(b.item);
      if (sameDayKeyA === sameDayKeyB) {
        const timeA = parseStartTimeMinutes(a.item.time);
        const timeB = parseStartTimeMinutes(b.item.time);
        if (timeA !== null && timeB !== null && timeA !== timeB) {
          return timeA - timeB;
        }
      }
      return a.idx - b.idx;
    })
    .map((entry) => entry.item);
}




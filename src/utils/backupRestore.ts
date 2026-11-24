import {
  Student,
  Room,
  ExamSettings,
  ExamScheduleItem,
  DailyRoomJournalRecord,
  HandoverBeritaAcaraRecord,
  SortMethod,
  PaperSize,
} from '../types';
import { defaultExamSettings } from './sampleData';
import {
  loadJournalRecords,
  saveJournalRecords,
  loadHandoverRecords,
  saveHandoverRecords,
} from './examDocuments';

export interface ExamBackupData {
  settings: ExamSettings;
  rooms: Room[];
  students: Student[];
  schedules: ExamScheduleItem[];
  journals: Record<string, DailyRoomJournalRecord>;
  handovers: Record<string, HandoverBeritaAcaraRecord>;
}

export interface ExamBackupPayload {
  app: 'SISPRAK-RUANG-UJIAN';
  formatVersion: 1;
  exportedAt: string;
  data: ExamBackupData;
}

export interface ParsedBackupResult {
  sourceFormat: 'json' | 'sql';
  exportedAt?: string;
  data: ExamBackupData;
  counts: {
    students: number;
    rooms: number;
    schedules: number;
    journals: number;
    handovers: number;
  };
  warnings: string[];
}

function getBackupTimestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}_${hh}-${mm}`;
}

function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildBackupPayload(
  settings: ExamSettings,
  rooms: Room[],
  students: Student[],
  schedules: ExamScheduleItem[]
): ExamBackupPayload {
  return {
    app: 'SISPRAK-RUANG-UJIAN',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      rooms,
      students,
      schedules,
      journals: loadJournalRecords(),
      handovers: loadHandoverRecords(),
    },
  };
}

export function exportBackupJson(
  settings: ExamSettings,
  rooms: Room[],
  students: Student[],
  schedules: ExamScheduleItem[]
): string {
  const payload = buildBackupPayload(settings, rooms, students, schedules);
  const filename = `backup-sisprak-ujian-${getBackupTimestampSlug()}.json`;
  triggerFileDownload(
    filename,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
  return filename;
}

// ============================================================
// SQL BACKUP GENERATOR (ANSI SQL Compatible: SQLite/MySQL/PG)
// ============================================================

function sqlValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlCommentSafe(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

export function exportBackupSql(
  settings: ExamSettings,
  rooms: Room[],
  students: Student[],
  schedules: ExamScheduleItem[]
): string {
  const payload = buildBackupPayload(settings, rooms, students, schedules);
  const { journals, handovers } = payload.data;
  const lines: string[] = [];

  lines.push('-- ============================================================');
  lines.push('-- SISPRAK RUANG UJIAN - SQL DATABASE BACKUP');
  lines.push(`-- Exported At : ${payload.exportedAt}`);
  lines.push(`-- Sekolah     : ${sqlCommentSafe(settings.schoolName || '-')}`);
  lines.push(`-- Kegiatan    : ${sqlCommentSafe(settings.activityName || settings.examTitle || '-')}`);
  lines.push('-- Format      : Standard ANSI SQL (SQLite / PostgreSQL / MySQL)');
  lines.push('-- ============================================================');
  lines.push('');

  // 1. TABLE exam_settings
  lines.push('CREATE TABLE IF NOT EXISTS exam_settings (');
  lines.push('  id VARCHAR(64) PRIMARY KEY,');
  lines.push('  school_name VARCHAR(255) NOT NULL,');
  lines.push('  activity_name VARCHAR(255) NOT NULL,');
  lines.push('  academic_year VARCHAR(64) NOT NULL,');
  lines.push('  sort_method VARCHAR(64) NOT NULL,');
  lines.push('  paper_size VARCHAR(32) NOT NULL,');
  lines.push('  headmaster VARCHAR(255),');
  lines.push('  committee_head VARCHAR(255),');
  lines.push('  settings_json TEXT NOT NULL');
  lines.push(');');
  lines.push('DELETE FROM exam_settings;');
  lines.push(
    'INSERT INTO exam_settings (id, school_name, activity_name, academic_year, sort_method, paper_size, headmaster, committee_head, settings_json) VALUES (' +
      [
        sqlValue('default'),
        sqlValue(settings.schoolName),
        sqlValue(settings.activityName || settings.examTitle),
        sqlValue(settings.academicYear),
        sqlValue(settings.sortMethod),
        sqlValue(settings.paperSize || 'a4'),
        sqlValue(settings.headmaster),
        sqlValue(settings.committeeHead),
        sqlValue(JSON.stringify(settings)),
      ].join(', ') +
      ');'
  );
  lines.push('');

  // 2. TABLE exam_rooms
  lines.push('CREATE TABLE IF NOT EXISTS exam_rooms (');
  lines.push('  id VARCHAR(128) PRIMARY KEY,');
  lines.push('  name VARCHAR(255) NOT NULL,');
  lines.push('  code VARCHAR(64) NOT NULL,');
  lines.push('  capacity INTEGER NOT NULL,');
  lines.push('  columns_count INTEGER NOT NULL,');
  lines.push('  building VARCHAR(255),');
  lines.push('  invigilator1 VARCHAR(255),');
  lines.push('  invigilator2 VARCHAR(255)');
  lines.push(');');
  lines.push('DELETE FROM exam_rooms;');
  for (const r of rooms) {
    lines.push(
      'INSERT INTO exam_rooms (id, name, code, capacity, columns_count, building, invigilator1, invigilator2) VALUES (' +
        [
          sqlValue(r.id),
          sqlValue(r.name),
          sqlValue(r.code),
          sqlValue(r.capacity),
          sqlValue(r.columns),
          sqlValue(r.building),
          sqlValue(r.invigilator1),
          sqlValue(r.invigilator2 ?? null),
        ].join(', ') +
        ');'
    );
  }
  lines.push('');

  // 3. TABLE exam_students
  lines.push('CREATE TABLE IF NOT EXISTS exam_students (');
  lines.push('  id VARCHAR(128) PRIMARY KEY,');
  lines.push('  nis VARCHAR(64) NOT NULL,');
  lines.push('  nisn VARCHAR(64),');
  lines.push('  name VARCHAR(255) NOT NULL,');
  lines.push('  class_name VARCHAR(128) NOT NULL,');
  lines.push('  gender VARCHAR(8) NOT NULL,');
  lines.push('  room_id VARCHAR(128),');
  lines.push('  room_name VARCHAR(255),');
  lines.push('  seat_number INTEGER,');
  lines.push('  participant_no VARCHAR(128)');
  lines.push(');');
  lines.push('DELETE FROM exam_students;');
  for (const s of students) {
    lines.push(
      'INSERT INTO exam_students (id, nis, nisn, name, class_name, gender, room_id, room_name, seat_number, participant_no) VALUES (' +
        [
          sqlValue(s.id),
          sqlValue(s.nis),
          sqlValue(s.nisn ?? null),
          sqlValue(s.name),
          sqlValue(s.className),
          sqlValue(s.gender),
          sqlValue(s.roomId ?? null),
          sqlValue(s.roomName ?? null),
          sqlValue(s.seatNumber ?? null),
          sqlValue(s.participantNo ?? null),
        ].join(', ') +
        ');'
    );
  }
  lines.push('');

  // 4. TABLE exam_schedules
  lines.push('CREATE TABLE IF NOT EXISTS exam_schedules (');
  lines.push('  id VARCHAR(128) PRIMARY KEY,');
  lines.push('  day_name VARCHAR(64) NOT NULL,');
  lines.push('  exam_date VARCHAR(128) NOT NULL,');
  lines.push('  exam_time VARCHAR(128) NOT NULL,');
  lines.push('  subject VARCHAR(255) NOT NULL,');
  lines.push('  grade VARCHAR(128) NOT NULL,');
  lines.push('  room_notes VARCHAR(255)');
  lines.push(');');
  lines.push('DELETE FROM exam_schedules;');
  for (const sch of schedules) {
    lines.push(
      'INSERT INTO exam_schedules (id, day_name, exam_date, exam_time, subject, grade, room_notes) VALUES (' +
        [
          sqlValue(sch.id),
          sqlValue(sch.day),
          sqlValue(sch.date),
          sqlValue(sch.time),
          sqlValue(sch.subject),
          sqlValue(sch.grade),
          sqlValue(sch.roomNotes ?? null),
        ].join(', ') +
        ');'
    );
  }
  lines.push('');

  // 5. TABLE exam_journals
  lines.push('CREATE TABLE IF NOT EXISTS exam_journals (');
  lines.push('  room_id VARCHAR(128) PRIMARY KEY,');
  lines.push('  signature_city VARCHAR(255),');
  lines.push('  signature_date_text VARCHAR(255),');
  lines.push('  sessions_json TEXT NOT NULL');
  lines.push(');');
  lines.push('DELETE FROM exam_journals;');
  for (const [roomId, rec] of Object.entries(journals)) {
    lines.push(
      'INSERT INTO exam_journals (room_id, signature_city, signature_date_text, sessions_json) VALUES (' +
        [
          sqlValue(rec.roomId || roomId),
          sqlValue(rec.signatureCity ?? ''),
          sqlValue(rec.signatureDateText ?? ''),
          sqlValue(JSON.stringify(rec.sessions || {})),
        ].join(', ') +
        ');'
    );
  }
  lines.push('');

  // 6. TABLE exam_handovers
  lines.push('CREATE TABLE IF NOT EXISTS exam_handovers (');
  lines.push('  record_key VARCHAR(255) PRIMARY KEY,');
  lines.push('  room_id VARCHAR(128) NOT NULL,');
  lines.push('  day_key VARCHAR(128) NOT NULL,');
  lines.push('  document_number VARCHAR(255),');
  lines.push('  record_json TEXT NOT NULL');
  lines.push(');');
  lines.push('DELETE FROM exam_handovers;');
  for (const [key, rec] of Object.entries(handovers)) {
    lines.push(
      'INSERT INTO exam_handovers (record_key, room_id, day_key, document_number, record_json) VALUES (' +
        [
          sqlValue(key),
          sqlValue(rec.roomId),
          sqlValue(rec.dayKey),
          sqlValue(rec.documentNumber ?? ''),
          sqlValue(JSON.stringify(rec)),
        ].join(', ') +
        ');'
    );
  }
  lines.push('');

  const filename = `backup-sisprak-ujian-${getBackupTimestampSlug()}.sql`;
  triggerFileDownload(filename, lines.join('\n'), 'application/sql;charset=utf-8');
  return filename;
}

// ============================================================
// NORMALIZATION & VALIDATION HELPERS
// ============================================================

const VALID_SORT_METHODS: SortMethod[] = [
  'class-order',
  'nis-cross-class',
  'nis-asc',
  'nis-desc',
  'nis-odd-even',
];

const VALID_PAPER_SIZES: PaperSize[] = ['a4', 'f4', 'legal', 'letter'];

function normalizeSettings(raw: unknown): ExamSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<ExamSettings>) : {};
  const sortMethod = VALID_SORT_METHODS.includes(obj.sortMethod as SortMethod)
    ? (obj.sortMethod as SortMethod)
    : defaultExamSettings.sortMethod;
  const paperSize = VALID_PAPER_SIZES.includes(obj.paperSize as PaperSize)
    ? (obj.paperSize as PaperSize)
    : defaultExamSettings.paperSize;

  return {
    ...defaultExamSettings,
    ...obj,
    sortMethod,
    paperSize,
    defaultRoomCapacity: Number(obj.defaultRoomCapacity) || defaultExamSettings.defaultRoomCapacity,
    defaultRoomColumns: Number(obj.defaultRoomColumns) || defaultExamSettings.defaultRoomColumns,
    maxSeatRule: Number(obj.maxSeatRule) || defaultExamSettings.maxSeatRule,
    uniformCapacityMode:
      typeof obj.uniformCapacityMode === 'boolean'
        ? obj.uniformCapacityMode
        : defaultExamSettings.uniformCapacityMode,
  };
}

function normalizeRooms(raw: unknown[]): Room[] {
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((r, idx) => ({
      id: String(r.id ?? `room-restored-${idx + 1}`),
      name: String(r.name ?? `Ruang ${idx + 1}`),
      code: String(r.code ?? `R-${String(idx + 1).padStart(2, '0')}`),
      capacity: Math.max(1, Number(r.capacity) || 20),
      columns: Math.max(1, Number(r.columns ?? r.columns_count) || 4),
      building: String(r.building ?? ''),
      invigilator1: String(r.invigilator1 ?? ''),
      invigilator2: r.invigilator2 ? String(r.invigilator2) : undefined,
    }));
}

function normalizeStudents(raw: unknown[]): Student[] {
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((s, idx) => {
      const genderRaw = String(s.gender ?? 'L').toUpperCase();
      const gender: 'L' | 'P' = genderRaw === 'P' ? 'P' : 'L';
      const seatRaw = s.seatNumber ?? s.seat_number;
      const seatNum =
        seatRaw !== null && seatRaw !== undefined && seatRaw !== '' && Number.isFinite(Number(seatRaw))
          ? Number(seatRaw)
          : undefined;
      const roomIdRaw = s.roomId ?? s.room_id;
      const roomNameRaw = s.roomName ?? s.room_name;
      const partNoRaw = s.participantNo ?? s.participant_no;

      return {
        id: String(s.id ?? `std-restored-${idx + 1}`),
        nis: String(s.nis ?? ''),
        nisn: s.nisn !== null && s.nisn !== undefined && s.nisn !== '' ? String(s.nisn) : undefined,
        name: String(s.name ?? `Peserta ${idx + 1}`),
        className: String(s.className ?? s.class_name ?? ''),
        gender,
        roomId: roomIdRaw !== null && roomIdRaw !== undefined && roomIdRaw !== '' ? String(roomIdRaw) : undefined,
        roomName:
          roomNameRaw !== null && roomNameRaw !== undefined && roomNameRaw !== ''
            ? String(roomNameRaw)
            : undefined,
        seatNumber: seatNum,
        participantNo:
          partNoRaw !== null && partNoRaw !== undefined && partNoRaw !== ''
            ? String(partNoRaw)
            : undefined,
      };
    });
}

function normalizeSchedules(raw: unknown[]): ExamScheduleItem[] {
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((sch, idx) => {
      const notesRaw = sch.roomNotes ?? sch.room_notes;
      return {
        id: String(sch.id ?? `sch-restored-${idx + 1}`),
        day: String(sch.day ?? sch.day_name ?? ''),
        date: String(sch.date ?? sch.exam_date ?? ''),
        time: String(sch.time ?? sch.exam_time ?? ''),
        subject: String(sch.subject ?? ''),
        grade: String(sch.grade ?? 'Semua Kelas'),
        roomNotes:
          notesRaw !== null && notesRaw !== undefined && notesRaw !== '' ? String(notesRaw) : undefined,
      };
    });
}

// ============================================================
// JSON BACKUP PARSER
// ============================================================

export function parseBackupJsonText(text: string): ParsedBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File JSON tidak valid atau formatnya rusak.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Isi file JSON tidak sesuai struktur backup SISPRAK.');
  }

  const root = parsed as Record<string, unknown>;
  const dataNode =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const hasKnownKey =
    'settings' in dataNode ||
    'rooms' in dataNode ||
    'students' in dataNode ||
    'schedules' in dataNode;

  if (!hasKnownKey) {
    throw new Error(
      'File JSON tidak memiliki data ujian (settings, rooms, students, atau schedules).'
    );
  }

  const warnings: string[] = [];
  const settings = normalizeSettings(dataNode.settings);
  const rooms = Array.isArray(dataNode.rooms) ? normalizeRooms(dataNode.rooms) : [];
  const students = Array.isArray(dataNode.students) ? normalizeStudents(dataNode.students) : [];
  const schedules = Array.isArray(dataNode.schedules)
    ? normalizeSchedules(dataNode.schedules)
    : [];
  const journals =
    dataNode.journals && typeof dataNode.journals === 'object' && !Array.isArray(dataNode.journals)
      ? (dataNode.journals as Record<string, DailyRoomJournalRecord>)
      : {};
  const handovers =
    dataNode.handovers && typeof dataNode.handovers === 'object' && !Array.isArray(dataNode.handovers)
      ? (dataNode.handovers as Record<string, HandoverBeritaAcaraRecord>)
      : {};

  if (!Array.isArray(dataNode.rooms)) warnings.push('Data ruangan tidak ditemukan (diisi kosong).');
  if (!Array.isArray(dataNode.students)) warnings.push('Data siswa tidak ditemukan (diisi kosong).');
  if (!Array.isArray(dataNode.schedules)) warnings.push('Data jadwal tidak ditemukan (diisi kosong).');

  return {
    sourceFormat: 'json',
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : undefined,
    data: {
      settings,
      rooms,
      students,
      schedules,
      journals,
      handovers,
    },
    counts: {
      students: students.length,
      rooms: rooms.length,
      schedules: schedules.length,
      journals: Object.keys(journals).length,
      handovers: Object.keys(handovers).length,
    },
    warnings,
  };
}

// ============================================================
// SQL BACKUP PARSER (ANSI SQL Statements & INSERT INTO)
// ============================================================

type SqlScalar = string | number | boolean | null;

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inBacktick) {
      current += ch;
      if (ch === '`') {
        inBacktick = false;
      }
      i += 1;
      continue;
    }

    // Line comment --
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripIdentifierQuotes(ident: string): string {
  const t = ident.trim();
  // Support schema.table -> take last segment
  const parts = t.split('.');
  const last = parts[parts.length - 1].trim();
  if (
    (last.startsWith('"') && last.endsWith('"')) ||
    (last.startsWith('`') && last.endsWith('`')) ||
    (last.startsWith('[') && last.endsWith(']'))
  ) {
    return last.slice(1, -1).trim();
  }
  return last;
}

function parseSqlValuesSection(valuesText: string): SqlScalar[][] {
  const rows: SqlScalar[][] = [];
  let i = 0;
  const len = valuesText.length;

  const skipWs = () => {
    while (i < len && /\s/.test(valuesText[i])) i += 1;
  };

  while (i < len) {
    skipWs();
    if (i >= len) break;
    if (valuesText[i] === ',') {
      i += 1;
      skipWs();
    }
    if (i >= len || valuesText[i] !== '(') break;
    i += 1; // consume '('

    const row: SqlScalar[] = [];
    while (i < len) {
      skipWs();
      if (i >= len) break;
      if (valuesText[i] === ')') {
        i += 1;
        break;
      }

      if (valuesText[i] === "'") {
        i += 1; // skip opening quote
        let str = '';
        while (i < len) {
          if (valuesText[i] === "'" && valuesText[i + 1] === "'") {
            str += "'";
            i += 2;
          } else if (valuesText[i] === "'") {
            i += 1;
            break;
          } else {
            str += valuesText[i];
            i += 1;
          }
        }
        row.push(str);
      } else {
        // Read bare literal until ',' or ')'
        let raw = '';
        while (i < len && valuesText[i] !== ',' && valuesText[i] !== ')') {
          raw += valuesText[i];
          i += 1;
        }
        const token = raw.trim();
        const upper = token.toUpperCase();
        if (upper === 'NULL' || token === '') {
          row.push(null);
        } else if (upper === 'TRUE') {
          row.push(true);
        } else if (upper === 'FALSE') {
          row.push(false);
        } else if (/^-?\d+(\.\d+)?$/.test(token)) {
          row.push(Number(token));
        } else {
          row.push(token);
        }
      }

      skipWs();
      if (valuesText[i] === ',') {
        i += 1;
      } else if (valuesText[i] === ')') {
        i += 1;
        break;
      }
    }

    rows.push(row);
  }

  return rows;
}

const DEFAULT_TABLE_COLUMNS: Record<string, string[]> = {
  exam_settings: [
    'id',
    'school_name',
    'activity_name',
    'academic_year',
    'sort_method',
    'paper_size',
    'headmaster',
    'committee_head',
    'settings_json',
  ],
  exam_rooms: [
    'id',
    'name',
    'code',
    'capacity',
    'columns_count',
    'building',
    'invigilator1',
    'invigilator2',
  ],
  exam_students: [
    'id',
    'nis',
    'nisn',
    'name',
    'class_name',
    'gender',
    'room_id',
    'room_name',
    'seat_number',
    'participant_no',
  ],
  exam_schedules: ['id', 'day_name', 'exam_date', 'exam_time', 'subject', 'grade', 'room_notes'],
  exam_journals: ['room_id', 'signature_city', 'signature_date_text', 'sessions_json'],
  exam_handovers: ['record_key', 'room_id', 'day_key', 'document_number', 'record_json'],
};

export function parseBackupSqlText(text: string): ParsedBackupResult {
  const exportedAtMatch = text.match(/^--\s*Exported At\s*:\s*(.+)$/im);
  const exportedAt = exportedAtMatch ? exportedAtMatch[1].trim() : undefined;

  const statements = splitSqlStatements(text);
  const recognizedTables = new Set<string>();
  const rowsByTable: Record<string, Record<string, SqlScalar>[]> = {
    exam_settings: [],
    exam_rooms: [],
    exam_students: [],
    exam_schedules: [],
    exam_journals: [],
    exam_handovers: [],
  };

  for (const stmt of statements) {
    // Track CREATE TABLE / DELETE FROM so empty tables are recognized
    const ddlMatch = stmt.match(
      /^(?:CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|DELETE\s+FROM\s+|TRUNCATE\s+(?:TABLE\s+)?)([^\s(]+)/i
    );
    if (ddlMatch) {
      const tableName = stripIdentifierQuotes(ddlMatch[1]).toLowerCase();
      if (tableName in rowsByTable) {
        recognizedTables.add(tableName);
        if (/^(?:DELETE|TRUNCATE)/i.test(stmt)) {
          rowsByTable[tableName] = [];
        }
      }
      continue;
    }

    // Match INSERT INTO table [(col1, col2, ...)] VALUES (...)
    const insertMatch = stmt.match(
      /^INSERT\s+(?:INTO\s+)?([^\s(]+)\s*(?:\(([^)]*)\))?\s*VALUES\s*([\s\S]+)$/i
    );
    if (!insertMatch) continue;

    const tableName = stripIdentifierQuotes(insertMatch[1]).toLowerCase();
    if (!(tableName in rowsByTable)) continue;
    recognizedTables.add(tableName);

    const cols = insertMatch[2]
      ? insertMatch[2].split(',').map((c) => stripIdentifierQuotes(c).toLowerCase())
      : DEFAULT_TABLE_COLUMNS[tableName];

    const parsedRows = parseSqlValuesSection(insertMatch[3]);
    for (const values of parsedRows) {
      const rowObj: Record<string, SqlScalar> = {};
      cols.forEach((colName, idx) => {
        rowObj[colName] = idx < values.length ? values[idx] : null;
      });
      rowsByTable[tableName].push(rowObj);
    }
  }

  if (recognizedTables.size === 0) {
    throw new Error(
      'File SQL tidak dikenali sebagai backup SISPRAK Ruang Ujian (tidak ada tabel exam_settings, exam_rooms, exam_students, atau exam_schedules).'
    );
  }

  const warnings: string[] = [];

  // Reconstruct settings
  let settingsObj: Record<string, unknown> = {};
  const settingsRow = rowsByTable.exam_settings[0];
  if (settingsRow) {
    if (typeof settingsRow.settings_json === 'string' && settingsRow.settings_json.trim()) {
      try {
        settingsObj = JSON.parse(settingsRow.settings_json);
      } catch {
        warnings.push('Sebagian JSON pengaturan dalam SQL gagal diurai; memakai kolom standar.');
      }
    }
    if (typeof settingsRow.school_name === 'string' && settingsRow.school_name) {
      settingsObj.schoolName = settingsRow.school_name;
    }
    if (typeof settingsRow.activity_name === 'string' && settingsRow.activity_name) {
      settingsObj.activityName = settingsRow.activity_name;
      settingsObj.examTitle = settingsRow.activity_name;
    }
    if (typeof settingsRow.academic_year === 'string' && settingsRow.academic_year) {
      settingsObj.academicYear = settingsRow.academic_year;
    }
    if (typeof settingsRow.sort_method === 'string' && settingsRow.sort_method) {
      settingsObj.sortMethod = settingsRow.sort_method;
    }
    if (typeof settingsRow.paper_size === 'string' && settingsRow.paper_size) {
      settingsObj.paperSize = settingsRow.paper_size;
    }
    if (typeof settingsRow.headmaster === 'string' && settingsRow.headmaster) {
      settingsObj.headmaster = settingsRow.headmaster;
    }
    if (typeof settingsRow.committee_head === 'string' && settingsRow.committee_head) {
      settingsObj.committeeHead = settingsRow.committee_head;
    }
  } else {
    warnings.push('Tabel exam_settings tidak ditemukan dalam SQL; menggunakan pengaturan bawaan.');
  }
  const settings = normalizeSettings(settingsObj);

  // Reconstruct rooms, students, schedules
  const rooms = normalizeRooms(rowsByTable.exam_rooms);
  const students = normalizeStudents(rowsByTable.exam_students);
  const schedules = normalizeSchedules(rowsByTable.exam_schedules);

  // Reconstruct journals
  const journals: Record<string, DailyRoomJournalRecord> = {};
  for (const row of rowsByTable.exam_journals) {
    const roomId = row.room_id ? String(row.room_id) : '';
    if (!roomId) continue;
    let sessions: DailyRoomJournalRecord['sessions'] = {};
    if (typeof row.sessions_json === 'string' && row.sessions_json.trim()) {
      try {
        sessions = JSON.parse(row.sessions_json);
      } catch {
        sessions = {};
      }
    }
    journals[roomId] = {
      roomId,
      signatureCity: row.signature_city ? String(row.signature_city) : '',
      signatureDateText: row.signature_date_text ? String(row.signature_date_text) : '',
      sessions,
    };
  }

  // Reconstruct handovers
  const handovers: Record<string, HandoverBeritaAcaraRecord> = {};
  for (const row of rowsByTable.exam_handovers) {
    const key = row.record_key ? String(row.record_key) : '';
    if (!key) continue;
    if (typeof row.record_json === 'string' && row.record_json.trim()) {
      try {
        const parsedRec = JSON.parse(row.record_json) as HandoverBeritaAcaraRecord;
        handovers[key] = parsedRec;
      } catch {
        // skip malformed record_json
      }
    }
  }

  return {
    sourceFormat: 'sql',
    exportedAt,
    data: {
      settings,
      rooms,
      students,
      schedules,
      journals,
      handovers,
    },
    counts: {
      students: students.length,
      rooms: rooms.length,
      schedules: schedules.length,
      journals: Object.keys(journals).length,
      handovers: Object.keys(handovers).length,
    },
    warnings,
  };
}

export async function parseBackupFile(file: File): Promise<ParsedBackupResult> {
  const text = await file.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('File backup kosong.');
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBackupJsonText(trimmed);
  }
  if (
    lowerName.endsWith('.sql') ||
    /^(?:--|\/\*|CREATE\s+TABLE|INSERT\s+INTO|DELETE\s+FROM)/i.test(trimmed)
  ) {
    return parseBackupSqlText(trimmed);
  }

  throw new Error('Format file tidak didukung. Gunakan file backup berekstensi .json atau .sql.');
}

export function persistDocumentExtrasFromBackup(data: ExamBackupData): void {
  saveJournalRecords(data.journals || {});
  saveHandoverRecords(data.handovers || {});
}

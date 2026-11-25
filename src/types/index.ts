export interface Student {
  id: string;
  nis: string;
  nisn?: string;
  name: string;
  className: string;
  gender: 'L' | 'P';
  // Allocation results
  roomId?: string;
  roomName?: string;
  seatNumber?: number;
  participantNo?: string;
  // Student pas foto (Data URL optimized for cards & PDF)
  photoUrl?: string;
  photoDriveFileId?: string;
  photoFileName?: string;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  capacity: number;
  columns: number;
  building: string;
  invigilator1: string;
  invigilator1Nip?: string;
  invigilator2?: string;
  invigilator2Nip?: string;
}

export interface ExamScheduleItem {
  id: string;
  day: string;
  date: string;
  time: string;
  subject: string;
  grade: string;
  roomNotes?: string;
}

export type SortMethod = 'class-order' | 'nis-cross-class' | 'nis-asc' | 'nis-desc' | 'nis-odd-even';

export interface DailyRoomInvigilatorAssignment {
  invigilator1: string;
  invigilator1Nip?: string;
  invigilator2?: string;
  invigilator2Nip?: string;
}

export type PaperSize = 'a4' | 'f4' | 'legal' | 'letter';

export interface ExamSettings {
  // Kop Surat Identitas
  governmentName: string;
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  schoolWebsite: string;
  postalCode: string;
  logoLeftPemda: string;
  logoRightSchool: string;

  // Ujian Info
  examTitle: string;
  activityName: string;
  academicYear: string;
  examDate: string;
  examSession: string;
  participantPrefix: string;
  sortMethod: SortMethod;

  // Pejabat Penandatangan, Tempat & Tanggal Dokumen
  headmaster: string;
  headmasterNip: string;
  committeeHead: string;
  committeeNip: string;
  signatureCity?: string;
  signatureDate?: string;

  // Aturan Kursi Ruang & Banyaknya Ruang
  defaultRoomCapacity: number;
  defaultRoomColumns: number;
  maxSeatRule: number;
  uniformCapacityMode: boolean;
  targetRoomCount?: number;
  maxRoomsAllowed?: number;
  roomDistributionMode?: 'fill-first' | 'even-distribution';
  invigilatorsPerRoom?: number;

  // Daftar Pengawas Per Hari Per Ruang (legacy / fallback, key: `${roomId}::${dayKey}`)
  dailyInvigilators?: Record<string, DailyRoomInvigilatorAssignment>;

  // Daftar Pengawas Per Hari Per Ruang Per Sesi (key: `${roomId}::${dayKey}::${scheduleId}`)
  sessionInvigilators?: Record<string, string>;
  sessionInvigilatorNips?: Record<string, string>;

  // Konfigurasi Pembagian Berdasarkan Urutan Kelas
  customClassOrder?: string[];
  classSortInside?: 'nis-asc' | 'name-asc';
  classFillPolicy?: 'continuous' | 'separate-room';

  // Warna Kartu Meja Tiap Kelas (key: className, value: color preset id)
  classColors?: Record<string, string>;

  // Warna Kartu Peserta Ujian per Tingkat Kelas (key: gradeLevel, value: color preset id)
  gradeColors?: Record<string, string>;

  // Upload Tanda Tangan Pejabat & Stempel Sekolah (Data URL gambar)
  headmasterSignature?: string;
  committeeSignature?: string;
  schoolStamp?: string;

  // Link Folder Google Drive untuk Foto Siswa per Kelas (key: className, value: Drive URL)
  classDrivePhotoLinks?: Record<string, string>;

  // Pilihan Ukuran Kertas Cetak (PDF & Print)
  paperSize?: PaperSize;
}

export interface AllocationSummary {
  totalStudents: number;
  allocatedStudents: number;
  unallocatedStudents: number;
  totalRooms: number;
  totalCapacity: number;
  remainingCapacity: number;
  roomBreakdowns: {
    room: Room;
    allocatedCount: number;
    occupancyRate: number;
    nisMin?: string;
    nisMax?: string;
    classCounts?: { className: string; count: number }[];
  }[];
}

export interface ExamDayGroup {
  dayKey: string;
  dayNumber: number;
  day: string;
  date: string;
  label: string;
  sessions: ExamScheduleItem[];
}

export interface JournalSessionEntry {
  scheduleId: string;
  invigilatorName: string;
  presentCount: string;
  absentCount: string;
  absentNumbers: string;
  absentDetails?: string;
  notes: string;
}

export interface DailyRoomJournalRecord {
  roomId: string;
  signatureCity: string;
  signatureDateText: string;
  sessions: Record<string, JournalSessionEntry>;
}

export type HandoverDirectionMode = 'both' | 'to-invigilator' | 'to-committee';

export interface HandoverSessionEntry {
  scheduleId: string;
  questionCopies: string;
  answerSheetCopies: string;
  returnedFilledSheets: string;
  returnedUnusedSheets: string;
  returnedQuestionCopies: string;
  notes: string;
}

export interface HandoverBeritaAcaraRecord {
  roomId: string;
  dayKey: string;
  documentNumber: string;
  committeeOfficerOut: string; // Petugas panitia saat menyerahkan ke pengawas
  committeeOfficerIn: string;  // Petugas panitia saat menerima kembali dari pengawas
  invigilator1: string;
  invigilator2: string;
  handoverOutTime: string;     // Jam Panitia -> Pengawas
  handoverInTime: string;      // Jam Pengawas -> Panitia
  reserveCopies: number;       // Cadangan soal/LJK per ruang
  sealStatusOut: string;       // Kondisi segel saat diambil
  sealStatusIn: string;        // Kondisi berkas saat dikembalikan
  notesOut: string;
  notesIn: string;
  sessionInvigilators?: Record<string, string>;
  sessions: Record<string, HandoverSessionEntry>;
}


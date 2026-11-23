import * as XLSX from 'xlsx';
import {
  Student,
  Room,
  ExamSettings,
  ExamScheduleItem,
  DailyRoomInvigilatorAssignment,
} from '../types';
import {
  buildRoomClassMatrix,
  buildCirculationSchedule,
  CirculationPattern,
} from './circulation';
import {
  buildExamDayGroups,
  getRoomDayInvigilators,
  makeRoomDayKey,
} from './examDocuments';

/**
 * Exports complete exam room allocation to Excel (.xlsx) with multiple organized sheets:
 * 1. Rekapitulasi Alokasi (Summary)
 * 2. Pengawas Per Hari (Daily Invigilators per Room)
 * 3. Master Seluruh Siswa (Master list)
 * 4. Individual sheets for each room with signature lines
 */
export function exportAllocationToExcel(
  students: Student[],
  rooms: Room[],
  settings: ExamSettings,
  schedules: ExamScheduleItem[] = []
): void {
  const wb = XLSX.utils.book_new();

  // --- SHEET 1: REKAPITULASI ALOKASI ---
  const rekapData: (string | number)[][] = [
    [settings.schoolName],
    [settings.examTitle],
    [`Tahun Ajaran: ${settings.academicYear} | Tanggal: ${settings.examDate}`],
    [],
    ['REKAPITULASI PEMBAGIAN RUANG UJIAN'],
    [],
    [
      'No',
      'Kode',
      'Nama Ruang',
      'Lokasi / Gedung',
      'Kapasitas',
      'Terisi',
      'Sisa Kursi',
      'Pengawas Ruang',
      'Rentang NIS',
    ],
  ];

  let totalCap = 0;
  let totalFilled = 0;

  rooms.forEach((room, idx) => {
    const roomStudents = students.filter((s) => s.roomId === room.id);
    const filled = roomStudents.length;
    const remaining = Math.max(0, room.capacity - filled);
    totalCap += room.capacity;
    totalFilled += filled;

    const nisList = roomStudents.map((s) => s.nis).sort();
    const nisRange =
      nisList.length > 0 ? `${nisList[0]} s/d ${nisList[nisList.length - 1]}` : '-';

    rekapData.push([
      idx + 1,
      room.code,
      room.name,
      room.building,
      room.capacity,
      filled,
      remaining,
      room.invigilator1,
      nisRange,
    ]);
  });

  rekapData.push([]);
  rekapData.push([
    '',
    'TOTAL',
    `${rooms.length} Ruangan`,
    '',
    totalCap,
    totalFilled,
    Math.max(0, totalCap - totalFilled),
    '',
    '',
  ]);

  const wsRekap = XLSX.utils.aoa_to_sheet(rekapData);
  // Column widths
  wsRekap['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 16 },
    { wch: 22 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 28 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekapitulasi');

  // --- SHEET 1A: DAFTAR PENGAWAS PER HARI PER RUANG ---
  const dayGroups = buildExamDayGroups(schedules);
  const invigilatorSheetData: (string | number)[][] = [
    [settings.schoolName],
    [`DAFTAR PENGAWAS RUANG PER HARI - ${settings.activityName || settings.examTitle}`],
    [`Tahun Pelajaran: ${settings.academicYear}`],
    [],
    [
      'No',
      'Kode',
      'Nama Ruang',
      'Lokasi / Gedung',
      ...dayGroups.map((dg) => `Hari ${dg.dayNumber} (${dg.day}, ${dg.date})`),
    ],
  ];

  rooms.forEach((room, idx) => {
    invigilatorSheetData.push([
      idx + 1,
      room.code,
      room.name,
      room.building,
      ...dayGroups.map((dg) => {
        const dayInv = getRoomDayInvigilators(room, dg.dayKey, settings);
        return dayInv.invigilator1 || '-';
      }),
    ]);
  });

  const wsInvigilators = XLSX.utils.aoa_to_sheet(invigilatorSheetData);
  wsInvigilators['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 15 },
    { wch: 22 },
    ...dayGroups.map(() => ({ wch: 30 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsInvigilators, 'Pengawas Per Hari');

  // --- SHEET 1B: MATRIKS SIRKULASI RUANG & KELAS ---
  const circMatrix = buildRoomClassMatrix(students, rooms, settings.customClassOrder);
  const circSheetData: (string | number)[][] = [
    [settings.schoolName],
    [`PEMBAGIAN SIRKULASI PESERTA TIAP RUANG DAN KELAS - ${settings.activityName || settings.examTitle}`],
    [`Tahun Pelajaran: ${settings.academicYear} | Tanggal: ${settings.examDate}`],
    [],
    [
      'No',
      'Kode',
      'Nama Ruang',
      'Lokasi',
      ...circMatrix.classes,
      'L',
      'P',
      'Total Terisi',
      'Kapasitas',
      'Sisa Kursi',
      'Rentang No. Peserta',
    ],
  ];

  circMatrix.rows.forEach((row, idx) => {
    circSheetData.push([
      idx + 1,
      row.room.code,
      row.room.name,
      row.room.building,
      ...circMatrix.classes.map((cls) => row.byClass[cls]?.count || 0),
      row.male,
      row.female,
      row.total,
      row.room.capacity,
      row.remainingSeats,
      row.participantMin && row.participantMax
        ? `${row.participantMin} s/d ${row.participantMax}`
        : '-',
    ]);
  });

  circSheetData.push([
    '',
    'TOTAL',
    `${rooms.length} Ruang`,
    '',
    ...circMatrix.classes.map((cls) => circMatrix.classTotals[cls]?.allocated || 0),
    circMatrix.grandTotalMale,
    circMatrix.grandTotalFemale,
    circMatrix.grandTotalAllocated,
    circMatrix.grandTotalCapacity,
    circMatrix.grandTotalRemaining,
    '',
  ]);

  const wsCirc = XLSX.utils.aoa_to_sheet(circSheetData);
  wsCirc['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 15 },
    { wch: 22 },
    ...circMatrix.classes.map(() => ({ wch: 12 })),
    { wch: 6 },
    { wch: 6 },
    { wch: 12 },
    { wch: 11 },
    { wch: 11 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCirc, 'Sirkulasi Ruang-Kelas');

  // --- SHEET 2: MASTER SELURUH SISWA ---
  const masterHeaders = [
    'No',
    'Nomor Peserta',
    'NIS',
    'NISN',
    'Nama Lengkap Siswa',
    'L/P',
    'Kelas',
    'Ruang Ujian',
    'No Meja',
  ];

  const masterRows = students.map((s, idx) => [
    idx + 1,
    s.participantNo || 'Belum Dialokasikan',
    s.nis,
    s.nisn || '-',
    s.name,
    s.gender,
    s.className,
    s.roomName || 'Belum Ada',
    s.seatNumber ? `Meja ${String(s.seatNumber).padStart(2, '0')}` : '-',
  ]);

  const masterData = [
    [settings.schoolName],
    [`MASTER DATA PESERTA UJIAN - ${settings.examTitle}`],
    [],
    masterHeaders,
    ...masterRows,
  ];

  const wsMaster = XLSX.utils.aoa_to_sheet(masterData);
  wsMaster['!cols'] = [
    { wch: 5 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 32 },
    { wch: 6 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMaster, 'Master Peserta');

  // --- SHEET 3..N: PER RUANGAN (DAFTAR HADIR RESMI) ---
  rooms.forEach((room) => {
    const roomStudents = students
      .filter((s) => s.roomId === room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    const roomSheetName = room.name.replace(/[^a-zA-Z0-9]/g, ' ').trim().slice(0, 30);

    const roomHeader: (string | number)[][] = [
      [settings.schoolName],
      [settings.examTitle],
      [`DAFTAR HADIR & PESERTA UJIAN - ${room.name.toUpperCase()}`],
      [`Lokasi: ${room.building} | Pengawas Ruang: ${room.invigilator1}`],
      [`Tanggal: ${settings.examDate} | Sesi: ${settings.examSession}`],
      [],
      [
        'No',
        'No Kursi',
        'No Peserta',
        'NIS',
        'Nama Lengkap Siswa',
        'L/P',
        'Kelas',
        'Tanda Tangan Ganjil',
        'Tanda Tangan Genap',
        'Keterangan',
      ],
    ];

    const capacity = Math.max(1, room.capacity);
    for (let seat = 1; seat <= capacity; seat++) {
      const student = roomStudents.find((s) => s.seatNumber === seat);
      const isOdd = seat % 2 !== 0;

      if (student) {
        roomHeader.push([
          seat,
          seat,
          student.participantNo || '-',
          student.nis,
          student.name,
          student.gender,
          student.className,
          isOdd ? `${seat}. ....................` : '',
          !isOdd ? `${seat}. ....................` : '',
          'Hadir',
        ]);
      } else {
        roomHeader.push([
          seat,
          seat,
          '-',
          '-',
          '[ KURSI KOSONG / TERSEDIA ]',
          '-',
          '-',
          '--------------------',
          '--------------------',
          'Kosong',
        ]);
      }
    }

    // Add signature space
    roomHeader.push([]);
    roomHeader.push([]);
    roomHeader.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Pengawas Ruang,',
    ]);
    roomHeader.push([]);
    roomHeader.push([]);
    roomHeader.push([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `( ${room.invigilator1} )`,
    ]);

    const wsRoom = XLSX.utils.aoa_to_sheet(roomHeader);
    wsRoom['!cols'] = [
      { wch: 5 },
      { wch: 10 },
      { wch: 16 },
      { wch: 12 },
      { wch: 30 },
      { wch: 6 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRoom, roomSheetName);
  });

  // Save Excel file
  const fileName = `Alokasi_Ruang_Ujian_${settings.schoolName.replace(/\s+/g, '_').slice(0, 20)}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exports dedicated Participant Circulation report (Room x Class Matrix, Per-Class Breakdown, and Daily Rotation Schedule) to Excel
 */
export function exportCirculationToExcel(
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
  const wb = XLSX.utils.book_new();
  const matrix = buildRoomClassMatrix(students, rooms, settings.customClassOrder);

  // Sheet 1: Matriks Ruang x Kelas
  const matrixData: (string | number)[][] = [
    [settings.schoolName],
    [`MATRIKS PEMBAGIAN SIRKULASI PESERTA TIAP RUANG DAN KELAS`],
    [`${settings.activityName || settings.examTitle} | Tahun Pelajaran ${settings.academicYear}`],
    [],
    [
      'No',
      'Kode',
      'Nama Ruang',
      'Lokasi / Gedung',
      ...matrix.classes,
      'L',
      'P',
      'Terisi',
      'Kapasitas',
      'Sisa',
      'Rentang No. Peserta',
    ],
  ];

  matrix.rows.forEach((row, idx) => {
    matrixData.push([
      idx + 1,
      row.room.code,
      row.room.name,
      row.room.building,
      ...matrix.classes.map((cls) => row.byClass[cls]?.count || 0),
      row.male,
      row.female,
      row.total,
      row.room.capacity,
      row.remainingSeats,
      row.participantMin && row.participantMax
        ? `${row.participantMin} s/d ${row.participantMax}`
        : '-',
    ]);
  });

  matrixData.push([
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
  ]);

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixData);
  wsMatrix['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 15 },
    { wch: 22 },
    ...matrix.classes.map(() => ({ wch: 12 })),
    { wch: 6 },
    { wch: 6 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matriks Ruang x Kelas');

  // Sheet 2: Rekapitulasi Sirkulasi per Kelas
  const classData: (string | number)[][] = [
    [settings.schoolName],
    ['REKAPITULASI SEBARAN SIRKULASI PER KELAS'],
    [],
    ['No', 'Kelas / Rombel', 'L', 'P', 'Total Siswa', 'Teralokasi', 'Belum Alokasi', 'Sebaran Ruang & Meja'],
  ];

  matrix.classSummaries.forEach((cs, idx) => {
    const dist =
      cs.roomDistributions.length > 0
        ? cs.roomDistributions
            .map((rd) => {
              const seatRange =
                rd.seatMin !== undefined && rd.seatMax !== undefined
                  ? `Meja ${String(rd.seatMin).padStart(2, '0')}-${String(rd.seatMax).padStart(2, '0')}`
                  : '';
              return `${rd.room.name}: ${rd.count} siswa (${seatRange})`;
            })
            .join(' | ')
        : 'Belum dialokasikan';

    classData.push([
      idx + 1,
      cs.className,
      cs.male,
      cs.female,
      cs.totalStudents,
      cs.allocatedStudents,
      cs.unallocatedStudents,
      dist,
    ]);
  });

  const wsClass = XLSX.utils.aoa_to_sheet(classData);
  wsClass['!cols'] = [
    { wch: 5 },
    { wch: 16 },
    { wch: 6 },
    { wch: 6 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, wsClass, 'Sirkulasi per Kelas');

  // Sheet 3: Jadwal Sirkulasi / Rotasi Hari (if enabled)
  if (options?.includeRotation) {
    const pattern = options.pattern || 'fixed';
    const rotationDays = buildCirculationSchedule(matrix, schedules, pattern, options.dayCount);
    const rotData: (string | number)[][] = [
      [settings.schoolName],
      ['JADWAL SIRKULASI / ROTASI PESERTA PER HARI UJIAN'],
      [],
      ['Hari', 'Tanggal', 'Mata Pelajaran', ...rooms.map((r) => `${r.name} (${r.code})`)],
    ];

    rotationDays.forEach((day) => {
      rotData.push([
        day.dayLabel,
        day.dateLabel,
        day.subjects.join(', '),
        ...day.roomAssignments.map(
          (ra) => `${ra.sourceGroupLabel} (${ra.studentCount} org) - ${ra.classBreakdownText} [${ra.seatShiftNote}]`
        ),
      ]);
    });

    const wsRot = XLSX.utils.aoa_to_sheet(rotData);
    wsRot['!cols'] = [
      { wch: 12 },
      { wch: 18 },
      { wch: 30 },
      ...rooms.map(() => ({ wch: 36 })),
    ];
    XLSX.utils.book_append_sheet(wb, wsRot, 'Jadwal Rotasi Hari');
  }

  XLSX.writeFile(
    wb,
    `Sirkulasi_Peserta_Ruang_Kelas_${settings.academicYear.replace('/', '-')}_${Date.now()}.xlsx`
  );
}

/**
 * Downloads a clean Excel template for importing students
 */
export function exportStudentTemplateExcel(): void {
  const wb = XLSX.utils.book_new();
  const templateData = [
    ['NIS', 'Nama Lengkap', 'Kelas', 'Jenis Kelamin (L/P)', 'NISN (Opsional)'],
    ['240101', 'Ahmad Dhani Prakoso', 'X MIPA 1', 'L', '0089100001'],
    ['240102', 'Bunga Citra Lestari', 'X MIPA 1', 'P', '0089100002'],
    ['240103', 'Cahya Ramadhani', 'X MIPA 1', 'L', '0089100003'],
    ['240201', 'Dewi Sartika Putri', 'X MIPA 2', 'P', '0089100004'],
    ['240202', 'Eko Prasetyo Utomo', 'X MIPA 2', 'L', '0089100005'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(templateData);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
  XLSX.writeFile(wb, 'Template_Data_Siswa_Ujian.xlsx');
}

/**
 * Parses uploaded Excel or CSV file into Student array
 */
export async function parseStudentsFromExcel(file: File): Promise<Student[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
  });

  if (!rawRows || rawRows.length < 2) {
    throw new Error('File Excel tidak memiliki data atau baris header.');
  }

  // Find header row indices
  const headerRow = (rawRows[0] || []).map((h) => String(h).trim().toLowerCase());
  
  let nisIdx = headerRow.findIndex((h) => h.includes('nis') && !h.includes('nisn'));
  if (nisIdx === -1) nisIdx = headerRow.findIndex((h) => h.includes('nis'));
  const nisnIdx = headerRow.findIndex((h) => h.includes('nisn'));
  const nameIdx = headerRow.findIndex((h) => h.includes('nama'));
  const classIdx = headerRow.findIndex((h) => h.includes('kelas') || h.includes('rombel'));
  const genderIdx = headerRow.findIndex((h) => h.includes('kelamin') || h.includes('jk') || h.includes('gender'));

  if (nisIdx === -1 && nameIdx === -1) {
    throw new Error('Kolom NIS dan Nama Siswa tidak ditemukan pada baris judul file Excel.');
  }

  const students: Student[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawNis = nisIdx !== -1 ? String(row[nisIdx] || '').trim() : '';
    const rawName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
    if (!rawNis && !rawName) continue; // Skip empty row

    const rawClass = classIdx !== -1 ? String(row[classIdx] || '').trim() : 'Umum';
    const rawGender = genderIdx !== -1 ? String(row[genderIdx] || '').trim().toUpperCase() : 'L';
    const gender: 'L' | 'P' = rawGender.startsWith('P') || rawGender === 'PEREMPUAN' || rawGender === 'W' ? 'P' : 'L';
    const rawNisn = nisnIdx !== -1 ? String(row[nisnIdx] || '').trim() : undefined;

    students.push({
      id: `std-upload-${Date.now()}-${r}`,
      nis: rawNis || `NIS-${r}`,
      nisn: rawNisn,
      name: rawName || `Siswa ${r}`,
      className: rawClass || 'Kelas X',
      gender,
    });
  }

  return students;
}

/**
 * Exports / downloads Excel template for Daily Room Invigilators (Per Ruang x Per Hari Ujian).
 * Pre-filled with currently saved invigilators so users can easily edit offline and re-import.
 */
export function exportInvigilatorsMatrixExcel(
  rooms: Room[],
  schedules: ExamScheduleItem[],
  settings: ExamSettings
): void {
  const wb = XLSX.utils.book_new();
  const dayGroups = buildExamDayGroups(schedules);

  const sheetData: (string | number)[][] = [
    [settings.schoolName],
    [`TEMPLATE & DAFTAR PENGAWAS RUANG PER HARI - ${settings.activityName || settings.examTitle}`],
    [`Tahun Pelajaran: ${settings.academicYear} | Edit nama pengawas di kolom Hari 1..N lalu klik Impor Excel`],
    [],
    [
      'Kode Ruang',
      'Nama Ruang',
      'Lokasi / Gedung',
      ...dayGroups.map((dg) => `Hari ${dg.dayNumber} (${dg.day}, ${dg.date})`),
    ],
  ];

  rooms.forEach((room) => {
    sheetData.push([
      room.code,
      room.name,
      room.building,
      ...dayGroups.map((dg) => getRoomDayInvigilators(room, dg.dayKey, settings).invigilator1 || ''),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 24 },
    ...dayGroups.map(() => ({ wch: 30 })),
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Pengawas Per Hari');

  const guideData: (string | number)[][] = [
    ['PETUNJUK PENGISIAN & IMPOR DAFTAR PENGAWAS RUANG'],
    [],
    ['1. Gunakan sheet "Pengawas Per Hari" sebagai template utama.'],
    ['2. Jangan mengubah kolom Kode Ruang (R01, R02, dst) atau Nama Ruang agar sistem dapat mencocokkan ruangan dengan tepat.'],
    ['3. Isi nama lengkap beserta gelar pengawas pada kolom Hari 1, Hari 2, dst sesuai jadwal ujian.'],
    ['4. Jika 1 kolom saja ("Pengawas") yang diunggah dari file sederhana, sistem akan otomatis menerapkannya ke seluruh hari ujian.'],
    ['5. Simpan file (.xlsx / .xls / .csv) lalu klik tombol "Impor Excel" pada panel Input Pengawas Ruang.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');

  XLSX.writeFile(
    wb,
    `Template_Pengawas_Ruang_${settings.academicYear.replace('/', '-')}_${Date.now()}.xlsx`
  );
}

export interface InvigilatorImportResult {
  dailyMap: Record<string, DailyRoomInvigilatorAssignment>;
  updatedRooms: Room[];
  matchedRooms: number;
  updatedCells: number;
  unmatchedLabels: string[];
}

/**
 * Parses uploaded Excel or CSV file containing invigilator assignments per room and day.
 */
export async function parseInvigilatorsFromExcel(
  file: File,
  rooms: Room[],
  schedules: ExamScheduleItem[],
  settings: ExamSettings
): Promise<InvigilatorImportResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const preferredSheet =
    workbook.SheetNames.find((n) => n.toLowerCase().includes('pengawas')) ||
    workbook.SheetNames[0];
  const worksheet = workbook.Sheets[preferredSheet];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
  });

  if (!rawRows || rawRows.length < 2) {
    throw new Error('File Excel kosong atau tidak memiliki baris data pengawas.');
  }

  // Locate header row within first 10 rows
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const cells = (rawRows[r] || []).map((c) => String(c).trim().toLowerCase());
    const hasRoomCol = cells.some(
      (c) =>
        c === 'kode' ||
        c.includes('kode ruang') ||
        c.includes('nama ruang') ||
        c === 'ruang' ||
        c.includes('ruangan')
    );
    const hasDayOrInvCol = cells.some(
      (c) => c.includes('hari') || c.includes('pengawas')
    );
    if (hasRoomCol && hasDayOrInvCol) {
      headerRowIdx = r;
      break;
    }
  }

  // Fallback to first non-empty row with >= 2 cells
  if (headerRowIdx === -1) {
    headerRowIdx = rawRows.findIndex(
      (row) => (row || []).filter((c) => String(c).trim() !== '').length >= 2
    );
  }

  if (headerRowIdx === -1 || headerRowIdx >= rawRows.length - 1) {
    throw new Error(
      'Baris judul kolom (Kode Ruang / Nama Ruang & Hari / Pengawas) tidak ditemukan di file.'
    );
  }

  const headerCells = (rawRows[headerRowIdx] || []).map((c) => String(c).trim());
  const headerLower = headerCells.map((c) => c.toLowerCase());

  const codeColIdx = headerLower.findIndex(
    (c) => c === 'kode' || c.includes('kode ruang') || c === 'kd ruang'
  );
  const nameColIdx = headerLower.findIndex(
    (c) =>
      c.includes('nama ruang') ||
      c === 'ruang' ||
      c === 'ruangan' ||
      c.includes('ruang ujian')
  );

  if (codeColIdx === -1 && nameColIdx === -1) {
    throw new Error(
      'Kolom "Kode Ruang" atau "Nama Ruang" tidak ditemukan pada baris judul file.'
    );
  }

  const dayGroups = buildExamDayGroups(schedules);

  // Map each dayGroup.dayKey -> column index in Excel
  const dayColMap = new Map<string, number>();
  const usedCols = new Set<number>();
  if (codeColIdx !== -1) usedCols.add(codeColIdx);
  if (nameColIdx !== -1) usedCols.add(nameColIdx);

  // Exclude obvious metadata columns like No, Lokasi/Gedung
  const metaColIndices = new Set<number>();
  headerLower.forEach((h, idx) => {
    if (
      h === 'no' ||
      h === 'no.' ||
      h.includes('lokasi') ||
      h.includes('gedung') ||
      h.includes('kapasitas')
    ) {
      metaColIndices.add(idx);
    }
  });

  // Pass 1: Match by "Hari N" or date string
  dayGroups.forEach((dg) => {
    let foundIdx = headerLower.findIndex((h, idx) => {
      if (usedCols.has(idx) || metaColIndices.has(idx)) return false;
      const dayNumMatch = h.match(/hari\s*(?:ke-)?(\d+)/i);
      if (dayNumMatch && Number(dayNumMatch[1]) === dg.dayNumber) return true;
      if (dg.date && dg.date !== '-' && h.includes(dg.date.toLowerCase())) return true;
      return false;
    });

    if (foundIdx !== -1) {
      dayColMap.set(dg.dayKey, foundIdx);
      usedCols.add(foundIdx);
    }
  });

  // Pass 2: Check if there is a single generic "Pengawas" column (apply to all days)
  const genericInvColIdx = headerLower.findIndex(
    (h, idx) =>
      !usedCols.has(idx) &&
      !metaColIndices.has(idx) &&
      (h.includes('pengawas') || h.includes('nama pengawas'))
  );

  // Pass 3: Fallback sequential remaining columns for unmatched days
  if (dayColMap.size === 0 && genericInvColIdx === -1) {
    const candidateCols: number[] = [];
    for (let c = 0; c < headerLower.length; c++) {
      if (!usedCols.has(c) && !metaColIndices.has(c) && headerLower[c] !== '') {
        candidateCols.push(c);
      }
    }
    dayGroups.forEach((dg, idx) => {
      if (idx < candidateCols.length) {
        dayColMap.set(dg.dayKey, candidateCols[idx]);
      }
    });
  } else if (dayColMap.size === 0 && genericInvColIdx !== -1) {
    dayGroups.forEach((dg) => {
      dayColMap.set(dg.dayKey, genericInvColIdx);
    });
  }

  if (dayColMap.size === 0) {
    throw new Error(
      'Kolom pengawas per hari (misal: "Hari 1", "Hari 2", atau "Pengawas") tidak ditemukan.'
    );
  }

  const nextDailyMap: Record<string, DailyRoomInvigilatorAssignment> = {
    ...(settings.dailyInvigilators || {}),
  };

  const extractDigits = (str: string) => {
    const m = str.match(/\d+/);
    return m ? String(parseInt(m[0], 10)) : '';
  };

  let matchedRooms = 0;
  let updatedCells = 0;
  const unmatchedLabels: string[] = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawCode = codeColIdx !== -1 ? String(row[codeColIdx] || '').trim() : '';
    const rawName = nameColIdx !== -1 ? String(row[nameColIdx] || '').trim() : '';

    if (!rawCode && !rawName) continue;
    if (rawCode.toLowerCase() === 'total' || rawName.toLowerCase().startsWith('total')) {
      continue;
    }

    // Find matching room
    const matchedRoom =
      rooms.find((rm) => rawCode && rm.code.trim().toLowerCase() === rawCode.toLowerCase()) ||
      rooms.find((rm) => rawName && rm.name.trim().toLowerCase() === rawName.toLowerCase()) ||
      rooms.find((rm) => {
        const dRoom = extractDigits(rm.code || rm.name);
        const dInput = extractDigits(rawCode || rawName);
        return Boolean(dRoom && dInput && dRoom === dInput);
      });

    if (!matchedRoom) {
      unmatchedLabels.push(rawCode || rawName);
      continue;
    }

    matchedRooms += 1;
    dayGroups.forEach((dg) => {
      const colIdx = dayColMap.get(dg.dayKey);
      if (colIdx === undefined) return;
      const val = String(row[colIdx] ?? '').trim();
      const key = makeRoomDayKey(matchedRoom.id, dg.dayKey);
      nextDailyMap[key] = {
        invigilator1: val,
      };
      updatedCells += 1;
    });
  }

  if (matchedRooms === 0) {
    throw new Error(
      'Tidak ada baris ruang yang cocok dengan daftar ruang ujian aktif. Pastikan Kode Ruang (contoh: R01) atau Nama Ruang (contoh: Ruang 01) sesuai.'
    );
  }

  const firstDayKey = dayGroups[0]?.dayKey;
  const updatedRooms = rooms.map((rm) => {
    if (!firstDayKey) return rm;
    const day1 = nextDailyMap[makeRoomDayKey(rm.id, firstDayKey)];
    if (!day1) return rm;
    return {
      ...rm,
      invigilator1: day1.invigilator1 || rm.invigilator1,
      invigilator2: undefined,
    };
  });

  return {
    dailyMap: nextDailyMap,
    updatedRooms,
    matchedRooms,
    updatedCells,
    unmatchedLabels,
  };
}


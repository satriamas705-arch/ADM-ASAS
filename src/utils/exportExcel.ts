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
  extractCityFromSettings,
  extractSignatureDateFromSettings,
  getRoomDaySessionInvigilator,
  getRoomDaySessionInvigilatorNip,
  getSessionDisplayLabel,
  makeRoomDayKey,
  makeRoomDaySessionKey,
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
      'NIP Pengawas',
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
      room.invigilator1Nip || '-',
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
    '',
  ]);
  rekapData.push([]);
  rekapData.push(['', 'Mengetahui,', '', '', '', '', '', '', `${extractCityFromSettings(settings)}, ${extractSignatureDateFromSettings(settings)}`]);
  rekapData.push(['', 'Kepala Sekolah', '', '', '', '', '', '', 'Ketua Panitia Ujian']);
  rekapData.push([]);
  rekapData.push([]);
  rekapData.push(['', settings.headmaster, '', '', '', '', '', '', settings.committeeHead]);
  rekapData.push(['', `NIP. ${settings.headmasterNip || '-'}`, '', '', '', '', '', '', `NIP. ${settings.committeeNip || '-'}`]);

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
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekapitulasi');

  // --- SHEET 1A: DAFTAR PENGAWAS PER HARI, RUANG & SESI ---
  const dayGroups = buildExamDayGroups(schedules);
  const invSlots = dayGroups.flatMap((dg) =>
    dg.sessions.map((sch, sIdx) => ({
      dg,
      sch,
      sIdx,
      header: `H${dg.dayNumber} ${getSessionDisplayLabel(sch, sIdx)} (${sch.subject} | ${dg.day}, ${dg.date} ${sch.time})`,
    }))
  );

  const invigilatorSheetData: (string | number)[][] = [
    [settings.schoolName],
    [`DAFTAR PENGAWAS RUANG PER HARI & SESI - ${settings.activityName || settings.examTitle}`],
    [`Tahun Ajaran: ${settings.academicYear}`],
    [],
    [
      'No',
      'Kode',
      'Nama Ruang',
      'Lokasi / Gedung',
      ...invSlots.map((slot) => slot.header),
    ],
  ];

  rooms.forEach((room, idx) => {
    invigilatorSheetData.push([
      idx + 1,
      room.code,
      room.name,
      room.building,
      ...invSlots.map((slot) => {
        const name =
          getRoomDaySessionInvigilator(room, slot.dg.dayKey, slot.sch.id, settings) || '-';
        const nip = getRoomDaySessionInvigilatorNip(room, slot.dg.dayKey, slot.sch.id, settings);
        return nip ? `${name} (NIP. ${nip})` : name;
      }),
    ]);
  });

  const wsInvigilators = XLSX.utils.aoa_to_sheet(invigilatorSheetData);
  wsInvigilators['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 15 },
    { wch: 22 },
    ...invSlots.map(() => ({ wch: 30 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsInvigilators, 'Pengawas Per Hari & Sesi');

  // --- SHEET 1B: MATRIKS SIRKULASI RUANG & KELAS ---
  const circMatrix = buildRoomClassMatrix(students, rooms, settings.customClassOrder);
  const circSheetData: (string | number)[][] = [
    [settings.schoolName],
    [`PEMBAGIAN SIRKULASI PESERTA TIAP RUANG DAN KELAS - ${settings.activityName || settings.examTitle}`],
    [`Tahun Ajaran: ${settings.academicYear} | Tanggal: ${settings.examDate}`],
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
      [
        `Lokasi: ${room.building} | Pengawas Ruang: ${room.invigilator1}${room.invigilator1Nip ? ` (NIP. ${room.invigilator1Nip})` : ''}`,
      ],
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
      'Mengetahui,',
      '',
      '',
      '',
      '',
      '',
      `${extractCityFromSettings(settings)}, ${extractSignatureDateFromSettings(settings)}`,
    ]);
    roomHeader.push([
      '',
      'Ketua Panitia Ujian,',
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
      `${settings.committeeHead}`,
      '',
      '',
      '',
      '',
      '',
      `( ${room.invigilator1} )`,
    ]);
    roomHeader.push([
      '',
      `NIP. ${settings.committeeNip || '-'}`,
      '',
      '',
      '',
      '',
      '',
      `NIP. ${room.invigilator1Nip || '-'}`,
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
    [`${settings.activityName || settings.examTitle} | Tahun Ajaran ${settings.academicYear}`],
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
  matrixData.push([]);
  matrixData.push(['', 'Mengetahui,', '', '', '', `${extractCityFromSettings(settings)}, ${extractSignatureDateFromSettings(settings)}`]);
  matrixData.push(['', 'Kepala Sekolah', '', '', '', 'Ketua Panitia Ujian']);
  matrixData.push([]);
  matrixData.push([]);
  matrixData.push(['', settings.headmaster, '', '', '', settings.committeeHead]);
  matrixData.push(['', `NIP. ${settings.headmasterNip || '-'}`, '', '', '', `NIP. ${settings.committeeNip || '-'}`]);

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
 * Exports / downloads Excel template for Room Invigilators (Per Hari x Per Ruang x Per Sesi Ujian).
 * Pre-filled with currently saved invigilators so users can easily edit offline and re-import.
 */
export function exportInvigilatorsMatrixExcel(
  rooms: Room[],
  schedules: ExamScheduleItem[],
  settings: ExamSettings
): void {
  const wb = XLSX.utils.book_new();
  const dayGroups = buildExamDayGroups(schedules);
  const invSlots = dayGroups.flatMap((dg) =>
    dg.sessions.map((sch, sIdx) => ({
      dg,
      sch,
      sIdx,
      header: `Hari ${dg.dayNumber} - Sesi ${sIdx + 1} (${sch.subject} | ${dg.day}, ${dg.date} ${sch.time})`,
    }))
  );

  const sheetData: (string | number)[][] = [
    [settings.schoolName],
    [
      `TEMPLATE & DAFTAR PENGAWAS RUANG PER HARI & SESI - ${settings.activityName || settings.examTitle}`,
    ],
    [
      `Tahun Ajaran: ${settings.academicYear} | Edit nama & NIP pengawas di tiap kolom Hari & Sesi lalu klik Impor Excel`,
    ],
    [],
    [
      'Kode Ruang',
      'Nama Ruang',
      'Lokasi / Gedung',
      ...invSlots.flatMap((slot) => [
        slot.header,
        `NIP Pengawas Hari ${slot.dg.dayNumber} - Sesi ${slot.sIdx + 1}`,
      ]),
    ],
  ];

  rooms.forEach((room) => {
    sheetData.push([
      room.code,
      room.name,
      room.building,
      ...invSlots.flatMap((slot) => [
        getRoomDaySessionInvigilator(room, slot.dg.dayKey, slot.sch.id, settings) || '',
        getRoomDaySessionInvigilatorNip(room, slot.dg.dayKey, slot.sch.id, settings) || '',
      ]),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 24 },
    ...invSlots.flatMap(() => [{ wch: 30 }, { wch: 24 }]),
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Pengawas Per Sesi');

  const guideData: (string | number)[][] = [
    ['PETUNJUK PENGISIAN & IMPOR DAFTAR PENGAWAS RUANG (PER HARI, RUANG & SESI)'],
    [],
    ['1. Gunakan sheet "Pengawas Per Sesi" sebagai template utama.'],
    [
      '2. Jangan mengubah kolom Kode Ruang (R01, R02, dst) atau Nama Ruang agar sistem dapat mencocokkan ruangan dengan tepat.',
    ],
    [
      '3. Isi nama lengkap beserta gelar pengawas dan NIP Pengawas (opsional) pada setiap pasangan kolom Hari & Sesi.',
    ],
    [
      '4. Kompatibilitas mundur: file dengan kolom per hari saja (Hari 1, Hari 2) atau tanpa kolom NIP tetap dapat diimpor seperti biasa.',
    ],
    [
      '5. Simpan file (.xlsx / .xls / .csv) lalu klik tombol "Impor Excel" pada panel Input Pengawas Ruang.',
    ],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 105 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');

  XLSX.writeFile(
    wb,
    `Template_Pengawas_Ruang_Per_Sesi_${settings.academicYear.replace('/', '-')}_${Date.now()}.xlsx`
  );
}

export interface InvigilatorImportResult {
  dailyMap: Record<string, DailyRoomInvigilatorAssignment>;
  sessionMap: Record<string, string>;
  sessionNipMap: Record<string, string>;
  updatedRooms: Room[];
  matchedRooms: number;
  updatedCells: number;
  unmatchedLabels: string[];
}

/**
 * Parses uploaded Excel or CSV file containing invigilator assignments per room, day, and session.
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
      (c) =>
        c.includes('hari') ||
        c.includes('sesi') ||
        c.includes('pengawas') ||
        /^h\d+/i.test(c)
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
      'Baris judul kolom (Kode Ruang / Nama Ruang & Hari / Sesi / Pengawas) tidak ditemukan di file.'
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
  const slots = dayGroups.flatMap((dg) =>
    dg.sessions.map((sch, sIdx) => ({
      dg,
      sch,
      sIdx,
      slotId: `${dg.dayKey}::${sch.id}`,
    }))
  );

  // Map slotId -> Excel column index
  const slotColMap = new Map<string, number>();
  const usedCols = new Set<number>();
  if (codeColIdx !== -1) usedCols.add(codeColIdx);
  if (nameColIdx !== -1) usedCols.add(nameColIdx);

  // Exclude obvious metadata & NIP columns from name matching
  const metaColIndices = new Set<number>();
  const nipColIndices = new Set<number>();
  headerLower.forEach((h, idx) => {
    if (h.includes('nip')) {
      nipColIndices.add(idx);
      metaColIndices.add(idx);
      return;
    }
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

  const matchesDayHeader = (h: string, dg: (typeof dayGroups)[number]): boolean => {
    const dayNumMatch = h.match(/(?:hari\s*(?:ke-)?|^h|\bh)(\d+)/i);
    if (dayNumMatch && Number(dayNumMatch[1]) === dg.dayNumber) return true;
    if (dg.date && dg.date !== '-' && h.includes(dg.date.toLowerCase())) return true;
    return false;
  };

  const matchesSessionHeader = (h: string, sIdx: number, sch: ExamScheduleItem): boolean => {
    const sessNumMatch = h.match(/(?:sesi\s*|\bs)(\d+)\b/i);
    if (sessNumMatch && Number(sessNumMatch[1]) === sIdx + 1) return true;
    const notes = (sch.roomNotes || '').trim().toLowerCase();
    if (notes && h.includes(notes)) return true;
    const subj = (sch.subject || '').trim().toLowerCase();
    if (subj && h.includes(subj)) return true;
    return false;
  };

  // Pass 1: Match exact Day + Session columns (names)
  slots.forEach((slot) => {
    const foundIdx = headerLower.findIndex((h, idx) => {
      if (usedCols.has(idx) || metaColIndices.has(idx)) return false;
      return matchesDayHeader(h, slot.dg) && matchesSessionHeader(h, slot.sIdx, slot.sch);
    });
    if (foundIdx !== -1) {
      slotColMap.set(slot.slotId, foundIdx);
      usedCols.add(foundIdx);
    }
  });

  // Pass 2: Match legacy Day-only columns (apply to all unmatched sessions on that day)
  dayGroups.forEach((dg) => {
    const anySlotMatchedForDay = dg.sessions.some((sch) =>
      slotColMap.has(`${dg.dayKey}::${sch.id}`)
    );
    if (anySlotMatchedForDay) return;

    const dayOnlyIdx = headerLower.findIndex((h, idx) => {
      if (usedCols.has(idx) || metaColIndices.has(idx)) return false;
      return matchesDayHeader(h, dg);
    });

    if (dayOnlyIdx !== -1) {
      dg.sessions.forEach((sch) => {
        slotColMap.set(`${dg.dayKey}::${sch.id}`, dayOnlyIdx);
      });
      usedCols.add(dayOnlyIdx);
    }
  });

  // Pass 3: Check if there is a generic "Pengawas" column (apply to all remaining slots)
  if (slotColMap.size === 0) {
    const genericInvColIdx = headerLower.findIndex(
      (h, idx) =>
        !usedCols.has(idx) &&
        !metaColIndices.has(idx) &&
        (h.includes('pengawas') || h.includes('nama pengawas'))
    );

    if (genericInvColIdx !== -1) {
      slots.forEach((slot) => {
        slotColMap.set(slot.slotId, genericInvColIdx);
      });
    } else {
      // Pass 4: Fallback sequential remaining columns
      const candidateCols: number[] = [];
      for (let c = 0; c < headerLower.length; c++) {
        if (!usedCols.has(c) && !metaColIndices.has(c) && headerLower[c] !== '') {
          candidateCols.push(c);
        }
      }

      if (candidateCols.length === dayGroups.length && slots.length !== dayGroups.length) {
        // Legacy sequential per-day columns
        dayGroups.forEach((dg, dIdx) => {
          if (dIdx < candidateCols.length) {
            dg.sessions.forEach((sch) => {
              slotColMap.set(`${dg.dayKey}::${sch.id}`, candidateCols[dIdx]);
            });
          }
        });
      } else {
        slots.forEach((slot, idx) => {
          if (idx < candidateCols.length) {
            slotColMap.set(slot.slotId, candidateCols[idx]);
          }
        });
      }
    }
  }

  if (slotColMap.size === 0) {
    throw new Error(
      'Kolom pengawas per hari & sesi (misal: "Hari 1 - Sesi 1", "Hari 1", atau "Pengawas") tidak ditemukan.'
    );
  }

  // Match optional NIP columns (Day+Session NIP, Day-only NIP, or generic NIP Pengawas)
  const slotNipColMap = new Map<string, number>();
  const usedNipCols = new Set<number>();

  slots.forEach((slot) => {
    const foundIdx = headerLower.findIndex((h, idx) => {
      if (!nipColIndices.has(idx) || usedNipCols.has(idx)) return false;
      return matchesDayHeader(h, slot.dg) && matchesSessionHeader(h, slot.sIdx, slot.sch);
    });
    if (foundIdx !== -1) {
      slotNipColMap.set(slot.slotId, foundIdx);
      usedNipCols.add(foundIdx);
    }
  });

  dayGroups.forEach((dg) => {
    const anyNipMatched = dg.sessions.some((sch) =>
      slotNipColMap.has(`${dg.dayKey}::${sch.id}`)
    );
    if (anyNipMatched) return;

    const dayOnlyNipIdx = headerLower.findIndex((h, idx) => {
      if (!nipColIndices.has(idx) || usedNipCols.has(idx)) return false;
      return matchesDayHeader(h, dg);
    });
    if (dayOnlyNipIdx !== -1) {
      dg.sessions.forEach((sch) => {
        slotNipColMap.set(`${dg.dayKey}::${sch.id}`, dayOnlyNipIdx);
      });
      usedNipCols.add(dayOnlyNipIdx);
    }
  });

  if (slotNipColMap.size === 0 && nipColIndices.size > 0) {
    const genericNipColIdx = Array.from(nipColIndices).find((idx) => !usedNipCols.has(idx));
    if (genericNipColIdx !== undefined) {
      slots.forEach((slot) => {
        slotNipColMap.set(slot.slotId, genericNipColIdx);
      });
    }
  }

  const nextSessionMap: Record<string, string> = {
    ...(settings.sessionInvigilators || {}),
  };
  const nextSessionNipMap: Record<string, string> = {
    ...(settings.sessionInvigilatorNips || {}),
  };
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
      let firstSessionVal: string | undefined;
      let firstSessionNip: string | undefined;
      dg.sessions.forEach((sch, sIdx) => {
        const slotId = `${dg.dayKey}::${sch.id}`;
        const colIdx = slotColMap.get(slotId);
        const nipColIdx = slotNipColMap.get(slotId);
        const sessKey = makeRoomDaySessionKey(matchedRoom.id, dg.dayKey, sch.id);

        if (colIdx !== undefined) {
          const val = String(row[colIdx] ?? '').trim();
          nextSessionMap[sessKey] = val;
          if (sIdx === 0) firstSessionVal = val;
          updatedCells += 1;
        }
        if (nipColIdx !== undefined) {
          const nipVal = String(row[nipColIdx] ?? '').trim();
          nextSessionNipMap[sessKey] = nipVal;
          if (sIdx === 0) firstSessionNip = nipVal;
        }
      });
      if (firstSessionVal !== undefined) {
        const existingDaily = nextDailyMap[makeRoomDayKey(matchedRoom.id, dg.dayKey)];
        nextDailyMap[makeRoomDayKey(matchedRoom.id, dg.dayKey)] = {
          invigilator1: firstSessionVal,
          invigilator1Nip:
            firstSessionNip !== undefined
              ? firstSessionNip || undefined
              : existingDaily?.invigilator1Nip,
        };
      }
    });
  }

  if (matchedRooms === 0) {
    throw new Error(
      'Tidak ada baris ruang yang cocok dengan daftar ruang ujian aktif. Pastikan Kode Ruang (contoh: R01) atau Nama Ruang (contoh: Ruang 01) sesuai.'
    );
  }

  const firstDayKey = dayGroups[0]?.dayKey;
  const firstSchId = dayGroups[0]?.sessions[0]?.id;
  const updatedRooms = rooms.map((rm) => {
    if (!firstDayKey) return rm;
    const sessVal = firstSchId
      ? nextSessionMap[makeRoomDaySessionKey(rm.id, firstDayKey, firstSchId)]
      : undefined;
    const sessNipVal = firstSchId
      ? nextSessionNipMap[makeRoomDaySessionKey(rm.id, firstDayKey, firstSchId)]
      : undefined;
    const day1Entry = nextDailyMap[makeRoomDayKey(rm.id, firstDayKey)];
    const day1Val = sessVal !== undefined ? sessVal : day1Entry?.invigilator1;
    const day1Nip = sessNipVal !== undefined ? sessNipVal : day1Entry?.invigilator1Nip;
    if (day1Val === undefined && day1Nip === undefined) return rm;
    return {
      ...rm,
      invigilator1: day1Val || rm.invigilator1,
      invigilator1Nip: day1Nip !== undefined ? day1Nip || undefined : rm.invigilator1Nip,
      invigilator2: undefined,
    };
  });

  return {
    dailyMap: nextDailyMap,
    sessionMap: nextSessionMap,
    sessionNipMap: nextSessionNipMap,
    updatedRooms,
    matchedRooms,
    updatedCells,
    unmatchedLabels,
  };
}


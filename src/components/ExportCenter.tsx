import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  FileText,
  DoorOpen,
  CreditCard,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Repeat,
  ClipboardList,
  Tag,
  Grid,
  UserCheck,
} from 'lucide-react';
import { Student, Room, ExamSettings, ExamScheduleItem, PaperSize } from '../types';
import {
  exportAllocationToExcel,
  exportCirculationToExcel,
  exportStudentTemplateExcel,
} from '../utils/exportExcel';
import {
  PAPER_SIZE_OPTIONS,
  getPaperSizeSpec,
  exportAttendancePdfForTarget,
  exportBundledAttendancePdfForTargets,
  exportAllSubjectsAttendancePdfForTargets,
  exportAttendance2PdfForTarget,
  exportBundledAttendance2PdfForTargets,
  exportDoorPosterPdf,
  exportExamCardsPdf,
  exportDeskCardsPdf,
  exportSchedulePdf,
  exportCirculationPdf,
  exportDistributionMatrixPdf,
  exportInvigilatorSchedulePdf,
  exportInvigilatorAttendancePdf,
} from '../utils/exportPdf';
import { buildClassColorMap } from '../utils/classColors';
import {
  AttendanceGroupingMode,
  AttendanceTarget,
  buildExamDayGroups,
  getOrderedClassNames,
  getOrderedClassNamesInRoom,
  getRoomClassPairs,
} from '../utils/examDocuments';

interface ExportCenterProps {
  students: Student[];
  rooms: Room[];
  settings: ExamSettings;
  schedules?: ExamScheduleItem[];
  onUpdateSettings?: (newSettings: ExamSettings) => void;
}

export const ExportCenter: React.FC<ExportCenterProps> = ({
  students,
  rooms,
  settings,
  schedules = [],
  onUpdateSettings,
}) => {
  const orderedClasses = useMemo(
    () => getOrderedClassNames(students, settings.customClassOrder),
    [students, settings.customClassOrder]
  );
  const examDayGroups = useMemo(() => buildExamDayGroups(schedules), [schedules]);

  // Daftar Hadir 1 state
  const [attendance1Mode, setAttendance1Mode] = useState<AttendanceGroupingMode>('per-room-class');
  const [selectedRoomForAttendance, setSelectedRoomForAttendance] = useState<string>('ALL');
  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState<string>('ALL');
  const [selectedScheduleForAttendance, setSelectedScheduleForAttendance] = useState<string>(
    schedules[0]?.id || 'ALL_SUBJECTS'
  );

  // Daftar Hadir 2 state
  const [attendance2Mode, setAttendance2Mode] = useState<AttendanceGroupingMode>('per-room-class');
  const [selectedRoomForAttendance2, setSelectedRoomForAttendance2] = useState<string>('ALL');
  const [selectedClassForAttendance2, setSelectedClassForAttendance2] = useState<string>('ALL');

  const [useDailyInvigilatorsInAttendance, setUseDailyInvigilatorsInAttendance] =
    useState<boolean>(true);

  const [selectedRoomForDoor, setSelectedRoomForDoor] = useState<string>(rooms[0]?.id || '');
  const [selectedRoomForCards, setSelectedRoomForCards] = useState<string>('ALL');
  const [selectedRoomForDeskCards, setSelectedRoomForDeskCards] = useState<string>('ALL');
  const [selectedClassForDeskCards, setSelectedClassForDeskCards] = useState<string>('ALL');
  const [deskCardsPerPage, setDeskCardsPerPage] = useState<8 | 10>(8);
  const [deskCardColorStyle, setDeskCardColorStyle] = useState<'full' | 'header'>('full');
  const [invigilatorAttendanceMode, setInvigilatorAttendanceMode] = useState<
    'multi-day' | 'per-day'
  >('multi-day');
  const [selectedInvigilatorDayKey, setSelectedInvigilatorDayKey] = useState<string>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const classColorMap = useMemo(
    () => buildClassColorMap(orderedClasses, settings.classColors),
    [orderedClasses, settings.classColors]
  );

  const [localPaperSize, setLocalPaperSize] = useState<PaperSize>(settings.paperSize || 'a4');
  const activePaperSize: PaperSize = settings.paperSize || localPaperSize;
  const activePaperSpec = getPaperSizeSpec(activePaperSize);
  const effectiveSettings = useMemo<ExamSettings>(
    () => ({ ...settings, paperSize: activePaperSize }),
    [settings, activePaperSize]
  );

  const handleSelectPaperSize = (paperSize: PaperSize) => {
    setLocalPaperSize(paperSize);
    if (onUpdateSettings) {
      onUpdateSettings({ ...settings, paperSize });
    }
    showSuccess(`Ukuran kertas cetak diatur ke ${getPaperSizeSpec(paperSize).label}.`);
  };

  const allocatedCount = students.filter((s) => s.roomId).length;
  const isAllocated = allocatedCount > 0;

  const showSuccess = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Handlers
  const handleExportExcel = () => {
    try {
      exportAllocationToExcel(students, rooms, settings, schedules);
      showSuccess('File Excel (.xlsx) berhasil diunduh dengan lembar Rekapitulasi, Pengawas Per Hari & Sesi, dan Per-Ruangan!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Excel: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const resolveTargets = (
    mode: AttendanceGroupingMode,
    roomIdFilter: string,
    classFilter: string
  ): AttendanceTarget[] => {
    if (mode === 'per-room') {
      const targetRooms =
        roomIdFilter === 'ALL' ? rooms : rooms.filter((r) => r.id === roomIdFilter);
      return targetRooms.map((room) => ({ mode: 'per-room', room }));
    }

    if (mode === 'per-class') {
      const targetClasses =
        classFilter === 'ALL' ? orderedClasses : orderedClasses.filter((c) => c === classFilter);
      return targetClasses.map((className) => ({ mode: 'per-class', className }));
    }

    // per-room-class
    const targetRooms =
      roomIdFilter === 'ALL' ? rooms : rooms.filter((r) => r.id === roomIdFilter);
    const pairs = getRoomClassPairs(targetRooms, students, settings.customClassOrder).filter(
      (p) => classFilter === 'ALL' || p.className === classFilter
    );
    if (pairs.length > 0) {
      return pairs.map(({ room, className }) => ({
        mode: 'per-room-class',
        room,
        className,
      }));
    }
    return targetRooms.map((room) => ({
      mode: 'per-room-class',
      room,
      className: classFilter === 'ALL' ? orderedClasses[0] || '-' : classFilter,
    }));
  };

  const handleExportAttendancePdf = () => {
    try {
      const selectedSchedule = schedules.find((s) => s.id === selectedScheduleForAttendance);
      const attendanceOpts = selectedSchedule
        ? {
            dayDateText: `${selectedSchedule.day}, ${selectedSchedule.date}`,
            subjectText: selectedSchedule.subject,
            useDailyInvigilators: useDailyInvigilatorsInAttendance,
            schedule: selectedSchedule,
          }
        : {
            useDailyInvigilators: useDailyInvigilatorsInAttendance,
          };

      const targets = resolveTargets(
        attendance1Mode,
        selectedRoomForAttendance,
        selectedClassForAttendance
      );

      if (targets.length === 0) {
        showSuccess('Tidak ada data ruang/kelas untuk diekspor.');
        return;
      }

      if (selectedScheduleForAttendance === 'ALL_SUBJECTS') {
        exportAllSubjectsAttendancePdfForTargets(targets, students, effectiveSettings, schedules, {
          useDailyInvigilators: useDailyInvigilatorsInAttendance,
        });
        showSuccess(`Bundel PDF Daftar Hadir (${targets.length} lembar × semua mapel) berhasil diunduh!`);
      } else if (targets.length === 1) {
        exportAttendancePdfForTarget(targets[0], students, effectiveSettings, attendanceOpts);
        showSuccess('Daftar Hadir PDF berhasil diunduh!');
      } else {
        exportBundledAttendancePdfForTargets(
          targets,
          students,
          effectiveSettings,
          attendanceOpts,
          'Daftar_Hadir_Gabungan'
        );
        showSuccess(`File PDF Daftar Hadir (${targets.length} lembar) berhasil digabung dan diunduh!`);
      }
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportAttendance2Pdf = () => {
    try {
      const targets = resolveTargets(
        attendance2Mode,
        selectedRoomForAttendance2,
        selectedClassForAttendance2
      );

      if (targets.length === 0) {
        showSuccess('Tidak ada data ruang/kelas untuk diekspor.');
        return;
      }

      if (targets.length === 1) {
        exportAttendance2PdfForTarget(targets[0], examDayGroups, students, effectiveSettings);
        showSuccess('Daftar Hadir 2 PDF berhasil diunduh!');
      } else {
        exportBundledAttendance2PdfForTargets(
          targets,
          examDayGroups,
          students,
          effectiveSettings,
          'Bundel_Daftar_Hadir_2'
        );
        showSuccess(`Bundel PDF Daftar Hadir 2 (${targets.length} lembar) berhasil diunduh!`);
      }
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Daftar Hadir 2 PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportDoorPosterPdf = () => {
    try {
      const targetRoom = rooms.find((r) => r.id === selectedRoomForDoor);
      if (targetRoom) {
        exportDoorPosterPdf(targetRoom, students, effectiveSettings);
        showSuccess(`Tempelan Pintu PDF untuk ${targetRoom.name} berhasil diunduh!`);
      }
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportCardsPdf = () => {
    try {
      const roomId = selectedRoomForCards === 'ALL' ? undefined : selectedRoomForCards;
      exportExamCardsPdf(students, effectiveSettings, schedules, roomId);
      showSuccess(`Kartu Peserta Ujian (${activePaperSpec.shortLabel}) berhasil diunduh!`);
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Kartu Peserta: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportDeskCardsPdf = () => {
    try {
      exportDeskCardsPdf(students, rooms, effectiveSettings, {
        roomIdFilter: selectedRoomForDeskCards,
        classFilter: selectedClassForDeskCards,
        cardsPerPage: deskCardsPerPage,
        colorStyle: deskCardColorStyle,
      });
      showSuccess('Kartu Meja Peserta dengan warna berbeda tiap kelas berhasil diunduh (PDF)!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Kartu Meja: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportSchedulePdf = () => {
    try {
      exportSchedulePdf(schedules, effectiveSettings);
      showSuccess('Jadwal Pelaksanaan Ujian resmi berhasil diunduh dalam format PDF!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Jadwal PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportCirculationPdf = () => {
    try {
      exportCirculationPdf(students, rooms, effectiveSettings, schedules, {
        includeRotation: true,
        pattern: 'rotate-room-forward',
      });
      showSuccess('Laporan Pembagian Sirkulasi Peserta Tiap Ruang & Kelas (PDF) berhasil diunduh!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Sirkulasi PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportCirculationExcel = () => {
    try {
      exportCirculationToExcel(students, rooms, settings, schedules, {
        includeRotation: true,
        pattern: 'rotate-room-forward',
      });
      showSuccess('Laporan Pembagian Sirkulasi Peserta Tiap Ruang & Kelas (Excel) berhasil diunduh!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Sirkulasi Excel: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportDistributionMatrixPdf = () => {
    try {
      exportDistributionMatrixPdf(students, rooms, effectiveSettings);
      showSuccess('Matriks Distribusi Peserta Ruang × Kelas (PDF) berhasil diunduh!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Matriks Distribusi PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportInvigilatorSchedulePdf = () => {
    try {
      exportInvigilatorSchedulePdf(rooms, schedules, effectiveSettings);
      showSuccess('Daftar Tugas Pengawas Ruang (PDF) berhasil diunduh!');
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Daftar Pengawas PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportInvigilatorAttendancePdf = () => {
    try {
      exportInvigilatorAttendancePdf(rooms, schedules, effectiveSettings, {
        mode: invigilatorAttendanceMode,
        dayKey: invigilatorAttendanceMode === 'per-day' ? selectedInvigilatorDayKey : undefined,
      });
      showSuccess(
        invigilatorAttendanceMode === 'multi-day'
          ? 'Daftar Hadir & Tanda Tangan Pengawas Multi-Hari (PDF) berhasil diunduh!'
          : 'Daftar Hadir & Tanda Tangan Pengawas Per Hari (PDF) berhasil diunduh!'
      );
    } catch (e: unknown) {
      showSuccess('Gagal mengekspor Daftar Hadir Pengawas PDF: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <style media="print">{`@page { size: ${activePaperSpec.widthMm}mm ${activePaperSpec.heightMm}mm; margin: 10mm; }`}</style>
      {/* Header */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Pusat Ekspor &amp; Pencetakan Dokumen
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Unduh laporan rekapitulasi, daftar hadir resmi, kartu ujian, dan tempelan pintu dalam format Excel dan PDF
          </p>
        </div>

        <button
          onClick={handleBrowserPrint}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
        >
          <Printer className="w-3.5 h-3.5 text-slate-500" />
          <span>Cetak Halaman Ini</span>
        </button>
      </div>

      {/* Paper Size Selector Bar */}
      <div className="print:hidden bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-slate-700" />
            <span>Pilihan Ukuran Kertas Cetak (PDF &amp; Browser Print)</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Diterapkan otomatis ke seluruh dokumen PDF (Daftar Hadir, Kartu Ujian, Kartu Meja, Jadwal, Matriks, dan Daftar Pengawas).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(PAPER_SIZE_OPTIONS) as PaperSize[]).map((key) => {
            const spec = PAPER_SIZE_OPTIONS[key];
            const isSelected = activePaperSize === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectPaperSize(key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md border transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {spec.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Success Notification */}
      {statusMessage && (
        <div className="print:hidden bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {!isAllocated && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <p className="font-semibold">Perhatian: Siswa belum dialokasikan ke ruangan!</p>
            <p className="mt-0.5 text-xs text-amber-800">
              Silakan jalankan fitur "Pembagian Otomatis" di tab Dashboard terlebih dahulu agar nomor kursi, ruang, dan nomor peserta terisi sebelum melakukan ekspor.
            </p>
          </div>
        </div>
      )}

      {/* 2-Column Export Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* EXCEL EXPORT SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Ekspor Format Excel (.xlsx)</h2>
                <p className="text-xs text-slate-500">
                  Workbook lengkap multi-sheet untuk pengolahan data panitia
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-2 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">File Excel mencakup lembar kerja:</p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-600">
                <li>
                  <strong className="text-slate-800">Sheet Rekapitulasi, Pengawas &amp; Sirkulasi:</strong> Ringkasan daya tampung, matriks distribusi Ruang &times; Kelas, jadwal pengawas per hari &amp; sesi, serta rentang NIS.
                </li>
                <li>
                  <strong className="text-slate-800">Sheet Master Data:</strong> Seluruh {students.length} siswa dengan nomor peserta dan ruangan.
                </li>
                <li>
                  <strong className="text-slate-800">Sheet Tiap Ruangan ({rooms.length} Sheet):</strong> Daftar hadir per ruang dilengkapi format kolom tanda tangan.
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              onClick={exportStudentTemplateExcel}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors"
            >
              Unduh Template Siswa
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Excel Lengkap (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* PDF ATTENDANCE LIST 1 SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Daftar Hadir Ujian (PDF)</h2>
                <p className="text-xs text-slate-500">
                  Daftar hadir &amp; nilai per ruang / per kelas / kombinasi ruang &amp; kelas
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pengelompokan Lembar:
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                  {(
                    [
                      { id: 'per-room-class', label: 'Ruang & Kelas' },
                      { id: 'per-room', label: 'Per Ruang' },
                      { id: 'per-class', label: 'Per Kelas' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAttendance1Mode(opt.id)}
                      className={`py-1.5 px-2 text-2xs font-bold rounded transition-colors ${
                        attendance1Mode === opt.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {attendance1Mode !== 'per-class' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Ruangan:
                  </label>
                  <select
                    value={selectedRoomForAttendance}
                    onChange={(e) => {
                      setSelectedRoomForAttendance(e.target.value);
                      setSelectedClassForAttendance('ALL');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">Semua Ruangan ({rooms.length} Ruang)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code}) - {r.building}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {attendance1Mode !== 'per-room' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Kelas:
                  </label>
                  <select
                    value={selectedClassForAttendance}
                    onChange={(e) => setSelectedClassForAttendance(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">Semua Kelas</option>
                    {(attendance1Mode === 'per-room-class' && selectedRoomForAttendance !== 'ALL'
                      ? getOrderedClassNamesInRoom(
                          students,
                          selectedRoomForAttendance,
                          settings.customClassOrder
                        )
                      : orderedClasses
                    ).map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilih Mata Pelajaran / Jadwal:
                </label>
                <select
                  value={selectedScheduleForAttendance}
                  onChange={(e) => setSelectedScheduleForAttendance(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                >
                  <option value="ALL_SUBJECTS">Semua Mata Pelajaran (Bundel Lengkap)</option>
                  {schedules.map((sch) => (
                    <option key={sch.id} value={sch.id}>
                      {sch.day}, {sch.date} — {sch.subject}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useDailyInvigilatorsInAttendance}
                  onChange={(e) => setUseDailyInvigilatorsInAttendance(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>Isi nama Pengawas otomatis sesuai jadwal Per Hari, Ruang &amp; Sesi</span>
              </label>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-slate-600">
                Format <strong>2 spasi</strong> ({activePaperSpec.shortLabel}, {settings.schoolName}): kolom No, No. Peserta, Nama Peserta, Tanda Tangan zig-zag, Nilai + Rata-rata, serta TTD Pengawas &amp; Guru Mapel.
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportAttendancePdf}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Daftar Hadir PDF</span>
            </button>
          </div>
        </div>

        {/* PDF ATTENDANCE 2 (MULTI-DAY) SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Hadir 2 — Rekap Harian (PDF)
                </h2>
                <p className="text-xs text-slate-500">
                  Matriks presensi multi-hari ({examDayGroups.length} hari) per ruang &amp; per kelas
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pengelompokan Lembar:
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                  {(
                    [
                      { id: 'per-room-class', label: 'Ruang & Kelas' },
                      { id: 'per-room', label: 'Per Ruang' },
                      { id: 'per-class', label: 'Per Kelas' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAttendance2Mode(opt.id)}
                      className={`py-1.5 px-2 text-2xs font-bold rounded transition-colors ${
                        attendance2Mode === opt.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {attendance2Mode !== 'per-class' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Ruangan:
                  </label>
                  <select
                    value={selectedRoomForAttendance2}
                    onChange={(e) => {
                      setSelectedRoomForAttendance2(e.target.value);
                      setSelectedClassForAttendance2('ALL');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">Semua Ruangan ({rooms.length} Ruang)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code}) - {r.building}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {attendance2Mode !== 'per-room' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Kelas:
                  </label>
                  <select
                    value={selectedClassForAttendance2}
                    onChange={(e) => setSelectedClassForAttendance2(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">Semua Kelas</option>
                    {(attendance2Mode === 'per-room-class' && selectedRoomForAttendance2 !== 'ALL'
                      ? getOrderedClassNamesInRoom(
                          students,
                          selectedRoomForAttendance2,
                          settings.customClassOrder
                        )
                      : orderedClasses
                    ).map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-slate-600">
                Format Landscape {activePaperSpec.shortLabel}: kolom No, No. Peserta, Nama Peserta, dan kolom <strong>Hari, tanggal</strong> otomatis dari jadwal ujian dilengkapi baris <strong>Jumlah hadir</strong> &amp; <strong>Paraf Pengawas</strong>.
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportAttendance2Pdf}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Daftar Hadir 2 PDF</span>
            </button>
          </div>
        </div>

        {/* PDF DOOR POSTER SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                <DoorOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Tempelan Pintu Ruang (PDF)</h2>
                <p className="text-xs text-slate-500">
                  Daftar peserta untuk ditempel di depan pintu masuk ruangan ujian
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilih Ruang Ujian:
                </label>
                <select
                  value={selectedRoomForDoor}
                  onChange={(e) => setSelectedRoomForDoor(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) - {r.building}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-slate-600">
                Ukuran teks besar dan kontras tinggi memudahkan siswa memeriksa nomor kursi, nomor peserta, dan nama dari luar ruangan sebelum memasuki kelas.
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportDoorPosterPdf}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Tempelan Pintu PDF</span>
            </button>
          </div>
        </div>

        {/* PDF STUDENT EXAM CARDS SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Kartu Peserta Ujian (PDF)</h2>
                <p className="text-xs text-slate-500">
                  Kartu resmi per siswa siap potong (2 kartu per lembar kertas {activePaperSpec.shortLabel})
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cetak Untuk:
                </label>
                <select
                  value={selectedRoomForCards}
                  onChange={(e) => setSelectedRoomForCards(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                >
                  <option value="ALL">Seluruh Siswa Teralokasi ({allocatedCount} Kartu)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Hanya {r.name} ({students.filter((s) => s.roomId === r.id).length} Siswa)
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-slate-600">
                Fokus pada identitas siswa (NIS/NISN, nama, kelas, ruang &amp; nomor meja), pas foto 2x3, jadwal ujian bergaris tabel tegas dengan <strong>kolom paraf pengawas ruang</strong>, dan batas gunting resmi.
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportCardsPdf}
              disabled={!isAllocated}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Kartu Peserta PDF</span>
            </button>
          </div>
        </div>

        {/* PDF DESK CARDS (KARTU MEJA WARNA PER KELAS) SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Kartu Meja Peserta (PDF)
                </h2>
                <p className="text-xs text-slate-500">
                  Label nomor meja siap tempel dengan warna berbeda tiap kelas ({deskCardsPerPage} kartu/hal)
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Ruang:
                  </label>
                  <select
                    value={selectedRoomForDeskCards}
                    onChange={(e) => setSelectedRoomForDeskCards(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">Semua Ruang ({allocatedCount} Siswa)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({students.filter((s) => s.roomId === r.id).length} Siswa)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Kelas:
                  </label>
                  <select
                    value={selectedClassForDeskCards}
                    onChange={(e) => setSelectedClassForDeskCards(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">Semua Kelas ({orderedClasses.length})</option>
                    {orderedClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kepadatan Cetak:
                  </label>
                  <select
                    value={deskCardsPerPage}
                    onChange={(e) => setDeskCardsPerPage(Number(e.target.value) === 10 ? 10 : 8)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value={8}>8 Kartu / Halaman {activePaperSpec.shortLabel} (2 &times; 4)</option>
                    <option value={10}>10 Kartu / Halaman {activePaperSpec.shortLabel} (2 &times; 5)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Gaya Warna:
                  </label>
                  <select
                    value={deskCardColorStyle}
                    onChange={(e) =>
                      setDeskCardColorStyle(e.target.value === 'header' ? 'header' : 'full')
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="full">Kartu Penuh Berwarna</option>
                    <option value="header">Header &amp; Bingkai Berwarna</option>
                  </select>
                </div>
              </div>

              {/* Class Color Legend */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1.5">
                <p className="text-2xs font-bold text-slate-700 uppercase tracking-wider">
                  Warna Otomatis Tiap Kelas:
                </p>
                <div className="flex flex-wrap gap-2">
                  {orderedClasses.map((cls) => {
                    const theme = classColorMap[cls];
                    return (
                      <span
                        key={cls}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-2xs font-bold ${theme.badgeBgClass} ${theme.badgeTextClass} ${theme.borderClass}`}
                      >
                        <span className={`w-2 h-2 rounded-xs ${theme.swatchClass}`} />
                        <span>{cls}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportDeskCardsPdf}
              disabled={!isAllocated}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Kartu Meja PDF</span>
            </button>
          </div>
        </div>

        {/* PDF EXAM SCHEDULE SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Jadwal Pelaksanaan Ujian (PDF)</h2>
                <p className="text-xs text-slate-500">
                  Dokumen resmi jadwal ujian dengan Kop Surat, dual logo, dan pengesahan
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-slate-600 space-y-1">
                <p>
                  Memuat seluruh daftar <strong className="text-slate-900">{schedules.length} mata pelajaran</strong>, hari/tanggal, jam/sesi ujian, dan kolom tanda tangan resmi Kepala Sekolah serta Ketua Panitia Ujian.
                </p>
                <p className="text-2xs text-slate-500 font-mono">
                  {settings.activityName || settings.examTitle} &middot; TP {settings.academicYear}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportSchedulePdf}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Jadwal Ujian PDF</span>
            </button>
          </div>
        </div>

        {/* PARTICIPANT CIRCULATION PER ROOM & CLASS SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                <Repeat className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Sirkulasi Peserta Tiap Ruang & Kelas
                </h2>
                <p className="text-xs text-slate-500">
                  Matriks silang Ruang &times; Kelas, sebaran per rombel, dan jadwal rotasi harian
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p>
                Memuat tabel matriks jumlah peserta <strong className="text-slate-900">Ruang &times; Kelas</strong> beserta rincian L/P, rentang nomor peserta, sebaran tiap kelas, serta jadwal sirkulasi rotasi ruang per hari ujian.
              </p>
              <p className="text-2xs text-slate-500 font-mono">
                Format Landscape A4 Resmi (PDF) &amp; Multi-Sheet Workbook (.xlsx)
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              onClick={handleExportCirculationExcel}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Unduh Excel</span>
            </button>
            <button
              onClick={handleExportCirculationPdf}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Sirkulasi PDF</span>
            </button>
          </div>
        </div>

        {/* MATRIKS DISTRIBUSI PESERTA (PDF) SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-800">
                <Grid className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Matriks Distribusi Peserta (PDF)
                </h2>
                <p className="text-xs text-slate-500">
                  Cetak khusus tabel matriks distribusi Ruang &times; Kelas dengan Kop Surat resmi
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p>
                Menampilkan rekap jumlah peserta tiap kelas di setiap ruang, jumlah L/P, kapasitas, sisa kursi, rentang nomor peserta, serta pengesahan Kepala Sekolah dan Ketua Panitia.
              </p>
              <p className="text-2xs text-slate-500 font-mono">
                Format Landscape A4 · Garis Tabel Tebal &amp; Siap Tempel / Arsip Panitia
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              onClick={handleExportDistributionMatrixPdf}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Matriks Distribusi PDF</span>
            </button>
          </div>
        </div>

        {/* DAFTAR PENGAWAS & TANDA TANGAN KEHADIRAN (PDF) SECTION */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Pengawas &amp; Kehadiran (PDF)
                </h2>
                <p className="text-xs text-slate-500">
                  Daftar tugas pengawas ruang dan lembar tanda tangan kehadiran pengawas
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Format Daftar Hadir &amp; TTD Pengawas:
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
                  <button
                    type="button"
                    onClick={() => setInvigilatorAttendanceMode('multi-day')}
                    className={`py-1.5 px-2 text-2xs font-bold rounded transition-colors ${
                      invigilatorAttendanceMode === 'multi-day'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Matriks Multi-Hari ({examDayGroups.length}H)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvigilatorAttendanceMode('per-day')}
                    className={`py-1.5 px-2 text-2xs font-bold rounded transition-colors ${
                      invigilatorAttendanceMode === 'per-day'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Lembar Per Hari ({activePaperSpec.shortLabel} Portrait)
                  </button>
                </div>
              </div>

              {invigilatorAttendanceMode === 'per-day' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Hari Ujian:
                  </label>
                  <select
                    value={selectedInvigilatorDayKey}
                    onChange={(e) => setSelectedInvigilatorDayKey(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="ALL">
                      Semua Hari Ujian (Bundel {examDayGroups.length} Lembar)
                    </option>
                    {examDayGroups.map((dg) => (
                      <option key={dg.dayKey} value={dg.dayKey}>
                        Hari {dg.dayNumber}: {dg.day}, {dg.date}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-slate-600">
                Tersedia 2 dokumen resmi: <strong>Daftar Tugas Pengawas Ruang</strong> (jadwal Ruang &times; Hari &times; Sesi) dan <strong>Daftar Hadir &amp; Tanda Tangan Pengawas</strong> (kolom TTD basah &amp; paraf Ketua Panitia).
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              onClick={handleExportInvigilatorSchedulePdf}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Daftar Tugas Pengawas</span>
            </button>
            <button
              onClick={handleExportInvigilatorAttendancePdf}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Daftar Hadir &amp; TTD PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

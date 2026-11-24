import React from 'react';
import { Calendar, Edit3, RotateCcw, Eraser, UserCheck } from 'lucide-react';
import { Student, ExamSettings, ExamScheduleItem, ExamDayGroup } from '../types';
import {
  AttendanceTarget,
  extractCityFromSettings,
  extractSignatureDateFromSettings,
  formatAttendanceTargetHeading,
  getScheduleRoomInvigilators,
} from '../utils/examDocuments';

export interface AttendanceSheetConfig {
  scheduleId: string;
  dayDateText: string;
  subjectText: string;
  cityLabel: string;
  dateLine: string;
  invigilatorName: string;
  subjectTeacherName: string;
}

interface AttendanceControlBarProps {
  target: AttendanceTarget;
  schedules: ExamScheduleItem[];
  settings: ExamSettings;
  config: AttendanceSheetConfig;
  onChangeConfig: (updated: AttendanceSheetConfig) => void;
  onResetConfig: () => void;
  isEditing: boolean;
  onToggleEditing: () => void;
  studentsCount: number;
}

export const AttendanceControlBar: React.FC<AttendanceControlBarProps> = ({
  target,
  schedules,
  settings,
  config,
  onChangeConfig,
  onResetConfig,
  isEditing,
  onToggleEditing,
  studentsCount,
}) => {
  const activeSchedule = schedules.find((s) => s.id === config.scheduleId);

  const handleSelectSchedule = (scheduleId: string) => {
    const found = schedules.find((s) => s.id === scheduleId);
    if (found) {
      const autoInv =
        target.mode !== 'per-class' && config.invigilatorName.trim() !== ''
          ? getScheduleRoomInvigilators(target.room, found, settings).invigilator1
          : config.invigilatorName;
      onChangeConfig({
        ...config,
        scheduleId: found.id,
        dayDateText: `${found.day}, ${found.date}`,
        subjectText: found.subject,
        invigilatorName: autoInv,
      });
    }
  };

  const handleFillDailyInvigilator = () => {
    if (target.mode === 'per-class') return;
    const inv = getScheduleRoomInvigilators(target.room, activeSchedule, settings).invigilator1;
    onChangeConfig({
      ...config,
      invigilatorName: inv,
    });
  };

  return (
    <div className="print:hidden bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="font-bold text-slate-900">
            {formatAttendanceTargetHeading(target)}
          </span>
          {target.mode !== 'per-class' && (
            <span className="text-slate-400">({target.room.name})</span>
          )}
          <span className="text-slate-300">|</span>
          <span className="font-mono font-semibold text-slate-800">
            {studentsCount} Peserta
          </span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-700">Mapel / Jadwal:</span>
            <select
              value={config.scheduleId}
              onChange={(e) => handleSelectSchedule(e.target.value)}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none max-w-[260px]"
            >
              {schedules.map((sch) => (
                <option key={sch.id} value={sch.id}>
                  {sch.day}, {sch.date} — {sch.subject}
                </option>
              ))}
              {schedules.length === 0 && (
                <option value="custom">Input Manual Hari & Mata Pelajaran</option>
              )}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleEditing}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border transition-colors ${
            isEditing
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>{isEditing ? 'Tutup Form Edit Daftar Hadir' : 'Edit Hari, Mapel & TTD'}</span>
        </button>
      </div>

      {isEditing && (
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xs text-slate-500">
              Sesuaikan keterangan Hari/Tanggal, Mata Pelajaran, Kota/Tanggal TTD, atau Nama Pengawas &amp; Guru Mapel. Kosongkan nama agar tampil sebagai garis tanda tangan tulis tangan.
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {target.mode !== 'per-class' && (
                <button
                  type="button"
                  onClick={handleFillDailyInvigilator}
                  className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors"
                  title="Isi Nama Pengawas sesuai jadwal Per Hari, Ruang & Sesi"
                >
                  <UserCheck className="w-3 h-3" />
                  <span>Isi Pengawas (Hari, Ruang &amp; Sesi)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    invigilatorName: '',
                    subjectTeacherName: '',
                  })
                }
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
              >
                <Eraser className="w-3 h-3" />
                <span>Garis Kosong TTD</span>
              </button>
              <button
                type="button"
                onClick={onResetConfig}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Hari, tanggal
              </label>
              <input
                type="text"
                value={config.dayDateText}
                onChange={(e) => onChangeConfig({ ...config, dayDateText: e.target.value })}
                placeholder="Senin, 20 April 2026"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Mata Pelajaran
              </label>
              <input
                type="text"
                value={config.subjectText}
                onChange={(e) => onChangeConfig({ ...config, subjectText: e.target.value })}
                placeholder="Ilmu Pengetahuan Alam"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Kota Tanda Tangan
              </label>
              <input
                type="text"
                value={config.cityLabel}
                onChange={(e) => onChangeConfig({ ...config, cityLabel: e.target.value })}
                placeholder="Kemranjen"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Tanggal / Garis TTD (Kanan)
              </label>
              <input
                type="text"
                value={config.dateLine}
                onChange={(e) => onChangeConfig({ ...config, dateLine: e.target.value })}
                placeholder="_____________________"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Nama Pengawas (Kosong = Garis TTD)
              </label>
              <input
                type="text"
                value={config.invigilatorName}
                onChange={(e) => onChangeConfig({ ...config, invigilatorName: e.target.value })}
                placeholder="Kosongkan untuk garis tulis tangan"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Nama Guru Mapel (Kosong = Garis TTD)
              </label>
              <input
                type="text"
                value={config.subjectTeacherName}
                onChange={(e) =>
                  onChangeConfig({ ...config, subjectTeacherName: e.target.value })
                }
                placeholder="Kosongkan untuk garis tulis tangan"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ExamAttendanceSheetProps {
  target: AttendanceTarget;
  targetStudents: Student[];
  settings: ExamSettings;
  config: AttendanceSheetConfig;
}

export const ExamAttendanceSheet: React.FC<ExamAttendanceSheetProps> = ({
  target,
  targetStudents,
  settings,
  config,
}) => {
  const cityLabel = (config.cityLabel || extractCityFromSettings(settings)).trim();
  const dateLine = (
    config.dateLine || extractSignatureDateFromSettings(settings, '_____________________')
  ).trim();
  const invigilatorDisplay = config.invigilatorName.trim() || '_________________________';
  const teacherDisplay = config.subjectTeacherName.trim() || '_________________________';

  const fallbackCount =
    target.mode === 'per-room' ? Math.max(1, Math.min(target.room.capacity || 20, 20)) : 15;

  const displayRows: Array<{ no: number; participantNo: string; name: string }> =
    targetStudents.length > 0
      ? targetStudents.map((st, idx) => ({
          no: idx + 1,
          participantNo: st.participantNo || st.nis,
          name: st.name.toUpperCase(),
        }))
      : Array.from({ length: fallbackCount }).map((_, idx) => ({
          no: idx + 1,
          participantNo: '',
          name: '',
        }));

  return (
    <div className="space-y-4 text-black">
      {/* Header matching uploaded Daftar Hadir 1 image */}
      <div className="text-center space-y-0.5 leading-tight">
        <h2 className="text-sm font-bold text-black uppercase tracking-tight">
          DAFTAR HADIR PESERTA {(settings.examTitle || 'UJIAN SEKOLAH').toUpperCase()}
        </h2>
        <h3 className="text-sm font-bold text-black uppercase tracking-tight">
          {(settings.schoolName || 'NAMA SEKOLAH').toUpperCase()}
        </h3>
        <p className="text-xs font-bold text-black">
          Tahun Ajaran {settings.academicYear}
        </p>
        <p className="text-base font-extrabold text-black pt-0.5 tracking-wide uppercase">
          {formatAttendanceTargetHeading(target)}
        </p>
      </div>

      {/* Metadata lines with underlined values (2 spasi) */}
      <div className="space-y-3.5 text-xs text-black pt-1.5 pb-2">
        <div className="flex items-end leading-relaxed">
          <span className="w-36 shrink-0">Hari, tanggal</span>
          <span className="w-72 border-b border-black pb-1 font-normal">
            : {config.dayDateText}
          </span>
        </div>
        <div className="flex items-end leading-relaxed">
          <span className="w-36 shrink-0">Mata Pelajaran</span>
          <span className="w-72 border-b border-black pb-1 font-normal">
            : {config.subjectText}
          </span>
        </div>
      </div>

      {/* Attendance + Nilai Table (2 spasi) */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs text-black">
          <thead>
            <tr className="bg-white font-bold text-center">
              <th className="border border-black py-2 px-1.5 w-9">No</th>
              <th className="border border-black py-2 px-2 w-28">No. Peserta</th>
              <th className="border border-black py-2 px-2">Nama Peserta</th>
              <th className="border border-black py-2 px-2 w-48">Tanda Tangan</th>
              <th className="border border-black py-2 px-2 w-20">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const isOdd = row.no % 2 !== 0;
              return (
                <tr key={row.no} className="bg-white leading-loose">
                  <td className="border border-black py-2.5 px-1.5 text-center">
                    {row.no}
                  </td>
                  <td className="border border-black py-2.5 px-2 text-center">
                    {row.participantNo}
                  </td>
                  <td className="border border-black py-2.5 px-2 text-left uppercase">
                    {row.name}
                  </td>
                  <td
                    className={`border border-black py-2.5 px-2 ${
                      isOdd ? 'text-left' : 'text-center'
                    }`}
                  >
                    {row.no}
                  </td>
                  <td className="border border-black py-2.5 px-2 text-center">
                    &nbsp;
                  </td>
                </tr>
              );
            })}
            {/* Bottom Rata-rata row */}
            <tr className="bg-white leading-loose">
              <td
                colSpan={4}
                className="border border-black py-2.5 px-2 text-center font-bold"
              >
                Rata-rata
              </td>
              <td className="border border-black py-2.5 px-2 text-center">
                &nbsp;
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bottom Signatures: Left Pengawas, Right City + Date + Guru Mapel (2 spasi) */}
      <div className="pt-6 grid grid-cols-2 text-xs text-black leading-relaxed">
        <div className="pl-6">
          <p className="invisible">Spacer</p>
          <p>Pengawas</p>
          <div className="h-16" />
          <p>{invigilatorDisplay}</p>
        </div>
        <div className="pl-12">
          <p>
            {cityLabel}, {dateLine}
          </p>
          <p>Guru Mapel</p>
          <div className="h-16" />
          <p>{teacherDisplay}</p>
        </div>
      </div>
    </div>
  );
};

interface ExamAttendance2SheetProps {
  target: AttendanceTarget;
  dayGroups: ExamDayGroup[];
  targetStudents: Student[];
  settings: ExamSettings;
}

/**
 * Daftar Hadir 2 (Rekap Harian Multi-Hari, mendukung Per Ruang / Per Kelas / Per Ruang & Kelas)
 * Sesuai gambar acuan: No | No. Peserta | Nama Peserta | Hari, tanggal (kolom tiap hari) + Jumlah hadir + Paraf Pengawas
 */
export const ExamAttendance2Sheet: React.FC<ExamAttendance2SheetProps> = ({
  target,
  dayGroups,
  targetStudents,
  settings,
}) => {
  const fallbackCount =
    target.mode === 'per-room' ? Math.max(1, Math.min(target.room.capacity || 20, 20)) : 15;

  const displayRows: Array<{ no: number; participantNo: string; name: string }> =
    targetStudents.length > 0
      ? targetStudents.map((st, idx) => ({
          no: idx + 1,
          participantNo: st.participantNo || st.nis,
          name: st.name.toUpperCase(),
        }))
      : Array.from({ length: fallbackCount }).map((_, idx) => ({
          no: idx + 1,
          participantNo: '',
          name: '',
        }));

  return (
    <div className="space-y-3 text-black">
      {/* Header matching uploaded Daftar Hadir 2 image */}
      <div className="text-center space-y-0.5 leading-tight">
        <h2 className="text-sm font-bold text-black uppercase tracking-tight">
          DAFTAR HADIR PESERTA {(settings.examTitle || 'UJIAN SEKOLAH').toUpperCase()}
        </h2>
        <p className="text-xs font-bold text-black">
          Tahun Ajaran {settings.academicYear}
        </p>
        <p className="text-base font-extrabold text-black pt-0.5 tracking-wide uppercase">
          {formatAttendanceTargetHeading(target)}
        </p>
      </div>

      {/* Multi-day Attendance Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs text-black">
          <thead>
            <tr className="bg-white font-bold text-center">
              <th rowSpan={2} className="border border-black py-1.5 px-1.5 w-8 align-middle">
                No
              </th>
              <th rowSpan={2} className="border border-black py-1.5 px-2 w-24 align-middle">
                No. Peserta
              </th>
              <th rowSpan={2} className="border border-black py-1.5 px-2 align-middle">
                Nama Peserta
              </th>
              <th
                colSpan={Math.max(1, dayGroups.length)}
                className="border border-black py-1 px-1.5 align-middle"
              >
                Hari, tanggal
              </th>
            </tr>
            <tr className="bg-white font-normal text-center text-2xs">
              {dayGroups.map((dg) => (
                <th
                  key={dg.dayKey}
                  className="border border-black py-1 px-1 min-w-[74px] align-middle leading-snug"
                >
                  {dg.day},<br />
                  {dg.date}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.no} className="bg-white">
                <td className="border border-black py-1 px-1.5 text-center">
                  {row.no}
                </td>
                <td className="border border-black py-1 px-2 text-center">
                  {row.participantNo}
                </td>
                <td className="border border-black py-1 px-2 text-left uppercase">
                  {row.name}
                </td>
                {dayGroups.map((dg) => (
                  <td key={dg.dayKey} className="border border-black py-1 px-1 text-center">
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}

            {/* Summary Row 1: Jumlah hadir (thick top border matching screenshot) */}
            <tr className="bg-white border-t-2 border-black">
              <td
                colSpan={3}
                className="border border-black border-t-2 py-1.5 px-2 text-center font-bold"
              >
                Jumlah hadir
              </td>
              {dayGroups.map((dg) => (
                <td
                  key={dg.dayKey}
                  className="border border-black border-t-2 py-1.5 px-1 text-center"
                >
                  &nbsp;
                </td>
              ))}
            </tr>

            {/* Summary Row 2: Paraf Pengawas */}
            <tr className="bg-white">
              <td
                colSpan={3}
                className="border border-black py-3.5 px-2 text-center font-bold align-middle"
              >
                Paraf Pengawas
              </td>
              {dayGroups.map((dg) => (
                <td key={dg.dayKey} className="border border-black py-3.5 px-1 text-center">
                  &nbsp;
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

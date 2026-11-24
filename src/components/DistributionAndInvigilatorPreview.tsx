import React from 'react';
import { Calendar, ClipboardCheck, Users } from 'lucide-react';
import { ExamDayGroup, ExamScheduleItem, ExamSettings, Room, Student } from '../types';
import { buildRoomClassMatrix } from '../utils/circulation';
import {
  buildUniqueInvigilatorsSummary,
  extractCityFromSettings,
  extractSignatureDateFromSettings,
  getRoomDaySessionInvigilator,
  getSessionDisplayLabel,
} from '../utils/examDocuments';
import { OfficialSignatureGraphic } from './OfficialSignatureGraphic';

export type InvigilatorSubMode = 'schedule' | 'attendance-multi' | 'attendance-day';

interface DistributionMatrixSheetProps {
  students: Student[];
  rooms: Room[];
  settings: ExamSettings;
}

export const DistributionMatrixSheet: React.FC<DistributionMatrixSheetProps> = ({
  students,
  rooms,
  settings,
}) => {
  const matrix = React.useMemo(
    () => buildRoomClassMatrix(students, rooms, settings.customClassOrder),
    [students, rooms, settings.customClassOrder]
  );

  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);

  return (
    <div className="space-y-4 text-black">
      {/* Header Title */}
      <div className="text-center space-y-0.5">
        <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-black">
          MATRIKS DISTRIBUSI PESERTA TIAP RUANG DAN KELAS
        </h2>
        <p className="text-xs font-semibold uppercase text-slate-900">
          {settings.activityName || settings.examTitle} &mdash; TAHUN AJARAN{' '}
          {settings.academicYear}
        </p>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-black bg-slate-50 px-3 py-2 text-2xs">
        <div>
          <span className="text-slate-600 block uppercase font-semibold">Total Ruang</span>
          <strong className="font-mono tabular-nums text-xs text-black">
            {rooms.length} Ruang
          </strong>
        </div>
        <div>
          <span className="text-slate-600 block uppercase font-semibold">Rombel Aktif</span>
          <strong className="font-mono tabular-nums text-xs text-black">
            {matrix.classes.length} Kelas
          </strong>
        </div>
        <div>
          <span className="text-slate-600 block uppercase font-semibold">
            Peserta Teralokasi
          </span>
          <strong className="font-mono tabular-nums text-xs text-black">
            {matrix.grandTotalAllocated} / {matrix.grandTotalStudents} (L: {matrix.grandTotalMale}, P:{' '}
            {matrix.grandTotalFemale})
          </strong>
        </div>
        <div>
          <span className="text-slate-600 block uppercase font-semibold">Kapasitas Total</span>
          <strong className="font-mono tabular-nums text-xs text-black">
            {matrix.grandTotalCapacity} Kursi (Sisa {matrix.grandTotalRemaining})
          </strong>
        </div>
      </div>

      {/* Full Distribution Matrix Table with crisp black borders */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-2xs text-black">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="border border-black px-1.5 py-2 text-center w-8">No</th>
              <th className="border border-black px-2 py-2 text-center w-14">Kode</th>
              <th className="border border-black px-2 py-2 text-left min-w-[95px]">
                Ruang Ujian
              </th>
              <th className="border border-black px-2 py-2 text-left min-w-[95px]">
                Lokasi / Gedung
              </th>
              {matrix.classes.map((cls) => (
                <th
                  key={cls}
                  className="border border-black px-1.5 py-2 text-center whitespace-nowrap"
                >
                  {cls}
                </th>
              ))}
              <th className="border border-black px-1.5 py-2 text-center w-8 bg-slate-900">L</th>
              <th className="border border-black px-1.5 py-2 text-center w-8 bg-slate-900">P</th>
              <th className="border border-black px-1.5 py-2 text-center w-10 bg-slate-900">Jml</th>
              <th className="border border-black px-1.5 py-2 text-center w-10 bg-slate-900">Kap</th>
              <th className="border border-black px-1.5 py-2 text-center w-10 bg-slate-900">Sisa</th>
              <th className="border border-black px-2 py-2 text-center min-w-[130px]">
                Rentang No. Peserta
              </th>
            </tr>
          </thead>

          <tbody>
            {matrix.rows.map((row, idx) => {
              const pRange =
                row.participantMin && row.participantMax
                  ? `${row.participantMin} s/d ${row.participantMax}`
                  : '-';
              return (
                <tr key={row.room.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-center font-mono font-bold">
                    {row.room.code}
                  </td>
                  <td className="border border-black px-2 py-1.5 font-bold">{row.room.name}</td>
                  <td className="border border-black px-2 py-1.5 text-slate-800">
                    {row.room.building}
                  </td>
                  {matrix.classes.map((cls) => {
                    const cnt = row.byClass[cls]?.count || 0;
                    return (
                      <td
                        key={cls}
                        className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums font-semibold"
                      >
                        {cnt > 0 ? cnt : '-'}
                      </td>
                    );
                  })}
                  <td className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums">
                    {row.male}
                  </td>
                  <td className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums">
                    {row.female}
                  </td>
                  <td className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums font-bold">
                    {row.total}
                  </td>
                  <td className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums">
                    {row.room.capacity}
                  </td>
                  <td className="border border-black px-1.5 py-1.5 text-center font-mono tabular-nums">
                    {row.remainingSeats}
                  </td>
                  <td className="border border-black px-2 py-1.5 text-center font-mono tabular-nums whitespace-nowrap">
                    {pRange}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-slate-200 font-bold text-black">
              <td colSpan={4} className="border border-black px-2 py-2 text-right uppercase">
                TOTAL KESELURUHAN ({rooms.length} RUANG)
              </td>
              {matrix.classes.map((cls) => (
                <td
                  key={cls}
                  className="border border-black px-1.5 py-2 text-center font-mono tabular-nums"
                >
                  {matrix.classTotals[cls]?.allocated || 0}
                </td>
              ))}
              <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                {matrix.grandTotalMale}
              </td>
              <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                {matrix.grandTotalFemale}
              </td>
              <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                {matrix.grandTotalAllocated}
              </td>
              <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                {matrix.grandTotalCapacity}
              </td>
              <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                {matrix.grandTotalRemaining}
              </td>
              <td className="border border-black px-2 py-2 text-center font-mono">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Signatures */}
      <div className="pt-6 grid grid-cols-2 gap-8 text-xs text-center text-black">
        <div>
          <p>Mengetahui,</p>
          <p className="font-semibold">Kepala Sekolah</p>
          <OfficialSignatureGraphic
            signatureUrl={settings.headmasterSignature}
            stampUrl={settings.schoolStamp}
            heightClass="h-14"
          />
          <p className="font-bold underline">{settings.headmaster}</p>
          <p className="text-2xs font-mono">NIP. {settings.headmasterNip || '-'}</p>
        </div>

        <div>
          <p>
            {cityLabel}, {dateLabel}
          </p>
          <p className="font-semibold">Ketua Panitia Ujian</p>
          <OfficialSignatureGraphic
            signatureUrl={settings.committeeSignature}
            heightClass="h-14"
          />
          <p className="font-bold underline">{settings.committeeHead}</p>
          <p className="text-2xs font-mono">NIP. {settings.committeeNip || '-'}</p>
        </div>
      </div>
    </div>
  );
};

interface InvigilatorControlBarProps {
  subMode: InvigilatorSubMode;
  onChangeSubMode: (mode: InvigilatorSubMode) => void;
  dayGroups: ExamDayGroup[];
  selectedDayKey: string;
  onSelectDayKey: (dayKey: string) => void;
}

export const InvigilatorControlBar: React.FC<InvigilatorControlBarProps> = ({
  subMode,
  onChangeSubMode,
  dayGroups,
  selectedDayKey,
  onSelectDayKey,
}) => {
  return (
    <div className="print:hidden bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <ClipboardCheck className="w-4 h-4 text-slate-600" />
          <span>Jenis Lembar Pengawas:</span>
        </span>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => onChangeSubMode('schedule')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              subMode === 'schedule'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Daftar Tugas Pengawas (Jadwal)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubMode('attendance-multi')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              subMode === 'attendance-multi'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Daftar Hadir &amp; TTD (Multi-Hari)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeSubMode('attendance-day')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              subMode === 'attendance-day'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Daftar Hadir &amp; TTD (Per Hari)</span>
          </button>
        </div>
      </div>

      {subMode === 'attendance-day' && dayGroups.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Pilih Hari Ujian:</label>
          <select
            value={selectedDayKey}
            onChange={(e) => onSelectDayKey(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
          >
            {dayGroups.map((dg) => (
              <option key={dg.dayKey} value={dg.dayKey}>
                Hari {dg.dayNumber}: {dg.day}, {dg.date}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

interface InvigilatorScheduleAndAttendanceSheetProps {
  rooms: Room[];
  schedules: ExamScheduleItem[];
  dayGroups: ExamDayGroup[];
  selectedDayGroup?: ExamDayGroup;
  settings: ExamSettings;
  subMode: InvigilatorSubMode;
}

export const InvigilatorScheduleAndAttendanceSheet: React.FC<
  InvigilatorScheduleAndAttendanceSheetProps
> = ({ rooms, dayGroups, selectedDayGroup, settings, subMode }) => {
  const cityLabel = extractCityFromSettings(settings);
  const dateLabel = extractSignatureDateFromSettings(settings);

  const uniqueInvigilators = React.useMemo(
    () => buildUniqueInvigilatorsSummary(rooms, dayGroups, settings),
    [rooms, dayGroups, settings]
  );

  // MODE A: DAFTAR TUGAS PENGAWAS RUANG (RUANG x HARI x SESI)
  if (subMode === 'schedule') {
    const totalSessionsCount = dayGroups.reduce((acc, dg) => acc + dg.sessions.length, 0);
    return (
      <div className="space-y-4 text-black">
        <div className="text-center space-y-0.5">
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-black">
            DAFTAR TUGAS PENGAWAS RUANG UJIAN
          </h2>
          <p className="text-xs font-semibold uppercase text-slate-900">
            {settings.activityName || settings.examTitle} &mdash; TAHUN AJARAN{' '}
            {settings.academicYear}
          </p>
        </div>

        <div className="border border-black bg-slate-50 px-3 py-2 text-2xs font-semibold text-center text-black">
          Jumlah Ruang: {rooms.length} Ruang &nbsp;|&nbsp; Jumlah Hari Ujian: {dayGroups.length}{' '}
          Hari ({totalSessionsCount} Sesi) &nbsp;|&nbsp; Rasio: 1 Pengawas / Ruang / Sesi
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-black text-2xs text-black">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th rowSpan={2} className="border border-black px-1.5 py-2 text-center w-8 align-middle">
                  No
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2 text-center w-14 align-middle">
                  Kode
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2 text-left min-w-[85px] align-middle">
                  Nama Ruang
                </th>
                <th rowSpan={2} className="border border-black px-2 py-2 text-left min-w-[85px] align-middle">
                  Lokasi / Gedung
                </th>
                {dayGroups.map((dg) => (
                  <th
                    key={dg.dayKey}
                    colSpan={Math.max(1, dg.sessions.length)}
                    className="border border-black px-2 py-1 text-center"
                  >
                    <span className="block font-bold">Hari {dg.dayNumber}</span>
                    <span className="block font-normal text-[10px]">
                      {dg.day}, {dg.date}
                    </span>
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-700 text-white">
                {dayGroups.map((dg) =>
                  dg.sessions.map((sch, sIdx) => (
                    <th
                      key={`${dg.dayKey}-${sch.id}`}
                      className="border border-black px-1.5 py-1 text-center min-w-[100px]"
                    >
                      <span className="block font-bold text-[10px]">
                        {getSessionDisplayLabel(sch, sIdx)}
                      </span>
                      <span className="block font-normal text-[9px] text-slate-200 truncate max-w-[125px] mx-auto">
                        {sch.subject}
                      </span>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room, idx) => (
                <tr key={room.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="border border-black px-2 py-2 text-center font-mono font-bold">
                    {room.code}
                  </td>
                  <td className="border border-black px-2 py-2 font-bold">{room.name}</td>
                  <td className="border border-black px-2 py-2">{room.building}</td>
                  {dayGroups.map((dg) =>
                    dg.sessions.map((sch) => {
                      const invName =
                        getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings) || '-';
                      return (
                        <td
                          key={`${dg.dayKey}-${sch.id}`}
                          className="border border-black px-1.5 py-2 text-left"
                        >
                          {invName}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-6 grid grid-cols-2 gap-8 text-xs text-center text-black">
          <div>
            <p>Mengetahui,</p>
            <p className="font-semibold">Kepala Sekolah</p>
            <OfficialSignatureGraphic
              signatureUrl={settings.headmasterSignature}
              stampUrl={settings.schoolStamp}
              heightClass="h-14"
            />
            <p className="font-bold underline">{settings.headmaster}</p>
            <p className="text-2xs font-mono">NIP. {settings.headmasterNip || '-'}</p>
          </div>

          <div>
            <p>
              {cityLabel}, {dateLabel}
            </p>
            <p className="font-semibold">Ketua Panitia Ujian</p>
            <OfficialSignatureGraphic
              signatureUrl={settings.committeeSignature}
              heightClass="h-14"
            />
            <p className="font-bold underline">{settings.committeeHead}</p>
            <p className="text-2xs font-mono">NIP. {settings.committeeNip || '-'}</p>
          </div>
        </div>
      </div>
    );
  }

  // MODE B: DAFTAR HADIR & TANDA TANGAN PENGAWAS (MULTI-HARI LANDSCAPE MATRIX)
  if (subMode === 'attendance-multi') {
    return (
      <div className="space-y-4 text-black">
        <div className="text-center space-y-0.5">
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-black">
            DAFTAR HADIR DAN TANDA TANGAN PENGAWAS UJIAN
          </h2>
          <p className="text-xs font-semibold uppercase text-slate-900">
            {settings.activityName || settings.examTitle} &mdash; TAHUN AJARAN{' '}
            {settings.academicYear}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-black text-2xs text-black">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th rowSpan={2} className="border border-black px-1.5 py-2 text-center w-8">
                  No
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-2.5 py-2 text-left min-w-[170px]"
                >
                  Nama Pengawas Ruang
                </th>
                <th
                  rowSpan={2}
                  className="border border-black px-2 py-2 text-center min-w-[85px]"
                >
                  Ruang Tugas
                </th>
                <th
                  colSpan={Math.max(1, dayGroups.length)}
                  className="border border-black px-2 py-1.5 text-center"
                >
                  Hari, Tanggal &amp; Tanda Tangan Kehadiran
                </th>
              </tr>
              <tr className="bg-slate-800 text-white">
                {dayGroups.map((dg) => (
                  <th
                    key={dg.dayKey}
                    className="border border-black px-2 py-1.5 text-center min-w-[95px]"
                  >
                    <span className="block font-bold">Hari {dg.dayNumber}</span>
                    <span className="block font-normal text-[10px]">
                      {dg.day}, {dg.date}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uniqueInvigilators.map((item, idx) => (
                <tr key={`${item.name}-${idx}`} className="bg-white">
                  <td className="border border-black px-1.5 py-2 text-center font-mono tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="border border-black px-2.5 py-2 font-bold">{item.name}</td>
                  <td className="border border-black px-2 py-2 text-center font-mono">
                    {item.roomLabels.join(', ')}
                  </td>
                  {dayGroups.map((dg) => {
                    const assignedCodes = item.dayRoomMap[dg.dayKey];
                    if (!assignedCodes || assignedCodes.length === 0) {
                      return (
                        <td
                          key={dg.dayKey}
                          className="border border-black px-2 py-2 h-10 text-center text-slate-400"
                        >
                          &mdash;
                        </td>
                      );
                    }
                    return (
                      <td
                        key={dg.dayKey}
                        className="border border-black px-1.5 py-1 h-10 align-bottom text-right"
                      >
                        {!item.isPlaceholder && (
                          <span className="text-[9px] font-mono text-slate-500">
                            ({assignedCodes.join(',')})
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-t-black bg-slate-50 font-bold">
                <td colSpan={3} className="border border-black px-2 py-2 text-center">
                  Jumlah Pengawas Hadir
                </td>
                {dayGroups.map((dg) => (
                  <td key={dg.dayKey} className="border border-black px-2 py-2" />
                ))}
              </tr>
              <tr className="bg-white font-bold">
                <td colSpan={3} className="border border-black px-2 py-3 text-center">
                  Paraf Ketua Panitia
                </td>
                {dayGroups.map((dg) => (
                  <td key={dg.dayKey} className="border border-black px-2 py-3 h-10" />
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="pt-5 flex justify-end text-xs text-center text-black pr-8">
          <div>
            <p>
              {cityLabel}, {dateLabel}
            </p>
            <p className="font-semibold">Ketua Panitia Ujian,</p>
            <OfficialSignatureGraphic
              signatureUrl={settings.committeeSignature}
              stampUrl={settings.schoolStamp}
              heightClass="h-14"
            />
            <p className="font-bold underline">{settings.committeeHead}</p>
            <p className="text-2xs font-mono">NIP. {settings.committeeNip || '-'}</p>
          </div>
        </div>
      </div>
    );
  }

  // MODE C: DAFTAR HADIR & TANDA TANGAN PENGAWAS PER HARI & SESI (PORTRAIT A4)
  const activeDay = selectedDayGroup || dayGroups[0];
  const daySessions = activeDay?.sessions || [];
  const hasMultipleSessions = daySessions.length > 1;
  const subjSummary = activeDay
    ? activeDay.sessions
        .map((s, idx) => `${getSessionDisplayLabel(s, idx)}: ${s.subject} (${s.time})`)
        .join('  |  ')
    : '-';

  let rowCounter = 0;

  return (
    <div className="space-y-4 text-black">
      <div className="text-center space-y-0.5">
        <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-black">
          DAFTAR HADIR &amp; TANDA TANGAN PENGAWAS UJIAN
        </h2>
        <p className="text-xs font-semibold uppercase text-slate-900">
          {settings.activityName || settings.examTitle} &mdash; TAHUN AJARAN{' '}
          {settings.academicYear}
        </p>
      </div>

      {/* Metadata Info Box */}
      <div className="border border-black bg-slate-50 px-3.5 py-2.5 text-xs space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="w-28 font-semibold text-slate-700 shrink-0">Hari / Tanggal</span>
          <span>:</span>
          <span className="font-bold text-black">
            {activeDay ? `Hari ke-${activeDay.dayNumber} — ${activeDay.day}, ${activeDay.date}` : '-'}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="w-28 font-semibold text-slate-700 shrink-0">Sesi &amp; Mapel</span>
          <span>:</span>
          <span className="font-bold text-black">{subjSummary}</span>
        </div>
      </div>

      {/* Per-Day × Per-Session Signature Table with crisp black grid */}
      <table className="w-full border-collapse border border-black text-xs text-black">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="border border-black px-2 py-2 text-center w-10">No</th>
            <th className="border border-black px-2 py-2 text-center w-16">Kode</th>
            <th className="border border-black px-2.5 py-2 text-left w-28">Ruang Ujian</th>
            {hasMultipleSessions && (
              <th className="border border-black px-2 py-2 text-left w-32">Sesi / Mapel</th>
            )}
            <th className="border border-black px-2.5 py-2 text-left">Nama Pengawas Ruang</th>
            <th className="border border-black px-2 py-2 text-center w-20">Jam Hadir</th>
            <th className="border border-black px-2.5 py-2 text-center w-36">Tanda Tangan</th>
            <th className="border border-black px-2 py-2 text-center w-14">Ket.</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            if (!activeDay || daySessions.length === 0) {
              rowCounter += 1;
              const no = rowCounter;
              const isOdd = no % 2 !== 0;
              return (
                <tr key={room.id} className="bg-white">
                  <td className="border border-black px-2 py-2.5 text-center font-mono tabular-nums">
                    {no}
                  </td>
                  <td className="border border-black px-2 py-2.5 text-center font-mono font-bold">
                    {room.code}
                  </td>
                  <td className="border border-black px-2.5 py-2.5">{room.name}</td>
                  <td className="border border-black px-2.5 py-2.5 font-bold">
                    {room.invigilator1 || '-'}
                  </td>
                  <td className="border border-black px-2 py-2.5 text-center font-mono" />
                  <td
                    className={`border border-black px-2.5 py-2.5 h-10 align-middle font-mono text-2xs ${
                      isOdd ? 'text-left' : 'text-center'
                    }`}
                  >
                    {no}.
                  </td>
                  <td className="border border-black px-2 py-2.5 text-center" />
                </tr>
              );
            }

            return daySessions.map((sch, sIdx) => {
              rowCounter += 1;
              const no = rowCounter;
              const isOdd = no % 2 !== 0;
              const invName =
                getRoomDaySessionInvigilator(room, activeDay.dayKey, sch.id, settings) || '-';
              return (
                <tr key={`${room.id}-${sch.id}`} className="bg-white">
                  <td className="border border-black px-2 py-2 text-center font-mono tabular-nums">
                    {no}
                  </td>
                  {sIdx === 0 && (
                    <>
                      <td
                        rowSpan={daySessions.length}
                        className="border border-black px-2 py-2 text-center font-mono font-bold align-middle"
                      >
                        {room.code}
                      </td>
                      <td
                        rowSpan={daySessions.length}
                        className="border border-black px-2.5 py-2 align-middle font-semibold"
                      >
                        {room.name}
                      </td>
                    </>
                  )}
                  {hasMultipleSessions && (
                    <td className="border border-black px-2 py-2 text-2xs leading-tight">
                      <span className="font-bold block">{getSessionDisplayLabel(sch, sIdx)}</span>
                      <span className="text-slate-600 block truncate max-w-[125px]">
                        {sch.subject}
                      </span>
                    </td>
                  )}
                  <td className="border border-black px-2.5 py-2 font-bold">{invName}</td>
                  <td className="border border-black px-2 py-2 text-center font-mono" />
                  <td
                    className={`border border-black px-2.5 py-2 h-10 align-middle font-mono text-2xs ${
                      isOdd ? 'text-left' : 'text-center'
                    }`}
                  >
                    {no}.
                  </td>
                  <td className="border border-black px-2 py-2 text-center" />
                </tr>
              );
            });
          })}
        </tbody>
      </table>

      <div className="pt-6 flex justify-end text-xs text-center text-black pr-8">
        <div>
          <p>
            {cityLabel}, {(settings.signatureDate || '').trim() || activeDay?.date || dateLabel}
          </p>
          <p className="font-semibold">Ketua Panitia Ujian,</p>
          <OfficialSignatureGraphic
            signatureUrl={settings.committeeSignature}
            stampUrl={settings.schoolStamp}
            heightClass="h-14"
          />
          <p className="font-bold underline">{settings.committeeHead}</p>
          <p className="text-2xs font-mono">NIP. {settings.committeeNip || '-'}</p>
        </div>
      </div>
    </div>
  );
};

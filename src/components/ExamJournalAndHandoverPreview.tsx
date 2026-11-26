import React from 'react';
import {
  Calendar,
  Edit3,
  Check,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  FileCheck2,
  Copy,
  UserCheck,
  Eraser,
} from 'lucide-react';
import {
  Room,
  Student,
  ExamSettings,
  ExamDayGroup,
  DailyRoomJournalRecord,
  HandoverBeritaAcaraRecord,
  HandoverDirectionMode,
} from '../types';
import { OfficialSignatureGraphic } from './OfficialSignatureGraphic';
import {
  extractCityFromSettings,
  extractSignatureDateFromSettings,
  formatRoomNumberLabel,
  getRoomDaySessionEntries,
  getRoomDaySessionInvigilator,
  getRoomDaySessionInvigilatorNip,
  getRoomDaySessionSummaryLabel,
} from '../utils/examDocuments';

interface JournalControlBarProps {
  room: Room;
  dayGroups: ExamDayGroup[];
  settings: ExamSettings;
  record: DailyRoomJournalRecord;
  onChangeRecord: (updated: DailyRoomJournalRecord) => void;
  onResetRecord: () => void;
  onApplyCityToAllRooms: () => void;
  blankMode: boolean;
  onToggleBlankMode: (val: boolean) => void;
  isEditing: boolean;
  onToggleEditing: () => void;
  roomStudentsCount: number;
}

export const JournalControlBar: React.FC<JournalControlBarProps> = ({
  room,
  dayGroups,
  settings,
  record,
  onChangeRecord,
  onResetRecord,
  onApplyCityToAllRooms,
  blankMode,
  onToggleBlankMode,
  isEditing,
  onToggleEditing,
  roomStudentsCount,
}) => {
  const updateSession = (
    scheduleId: string,
    field: 'invigilatorName' | 'presentCount' | 'absentCount' | 'absentNumbers' | 'notes',
    value: string
  ) => {
    const existing = record.sessions[scheduleId] || {
      scheduleId,
      invigilatorName: '',
      presentCount: '',
      absentCount: '',
      absentNumbers: '',
      notes: '',
    };
    onChangeRecord({
      ...record,
      sessions: {
        ...record.sessions,
        [scheduleId]: {
          ...existing,
          [field]: value,
        },
      },
    });
  };

  const handleFillDefaultInvigilator = () => {
    const updatedSessions = { ...record.sessions };
    for (const dg of dayGroups) {
      for (const sch of dg.sessions) {
        const sessInv = getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings);
        const existing = updatedSessions[sch.id] || {
          scheduleId: sch.id,
          invigilatorName: '',
          presentCount: '',
          absentCount: '',
          absentNumbers: '',
          notes: '',
        };
        updatedSessions[sch.id] = {
          ...existing,
          invigilatorName: sessInv || '',
        };
      }
    }
    onChangeRecord({ ...record, sessions: updatedSessions });
  };

  const handleClearInvigilators = () => {
    const updatedSessions = { ...record.sessions };
    for (const dg of dayGroups) {
      for (const sch of dg.sessions) {
        const existing = updatedSessions[sch.id] || {
          scheduleId: sch.id,
          invigilatorName: '',
          presentCount: '',
          absentCount: '',
          absentNumbers: '',
          notes: '',
        };
        updatedSessions[sch.id] = {
          ...existing,
          invigilatorName: '',
        };
      }
    }
    onChangeRecord({ ...record, sessions: updatedSessions });
  };

  return (
    <div className="print:hidden bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
      {/* Row 1: Summary & Mode Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="font-bold text-slate-900">
            RUANG : {formatRoomNumberLabel(room)}
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Mencakup <strong className="font-mono text-slate-900">{dayGroups.length} Hari</strong> &middot;{' '}
            <strong className="font-mono text-slate-900">{roomStudentsCount} Peserta</strong> (Harus Hadir)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Blank vs Filled toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-2xs font-semibold">
            <button
              type="button"
              onClick={() => onToggleBlankMode(false)}
              className={`px-2.5 py-1 rounded transition-colors ${
                !blankMode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Mode Terisi
            </button>
            <button
              type="button"
              onClick={() => onToggleBlankMode(true)}
              className={`px-2.5 py-1 rounded transition-colors ${
                blankMode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Formulir Kosong (Cetak)
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleEditing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border transition-colors ${
              isEditing
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Tutup Form Edit Jurnal' : 'Isi / Edit Jurnal & Pengawas'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Editor Panel */}
      {isEditing && (
        <div className="pt-3 border-t border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-700">
              Mengedit Jurnal Harian: <strong className="text-slate-900">{room.name} ({room.code})</strong> &middot;{' '}
              Harus Hadir: <strong>{roomStudentsCount} siswa</strong>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleFillDefaultInvigilator}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors"
                title="Isi kolom Nama Pengawas seluruh mapel sesuai jadwal Pengawas Per Hari, Ruang & Sesi"
              >
                <UserCheck className="w-3 h-3" />
                <span>Isi Pengawas Per Sesi Otomatis</span>
              </button>
              <button
                type="button"
                onClick={handleClearInvigilators}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
              >
                <Eraser className="w-3 h-3" />
                <span>Kosongkan Pengawas</span>
              </button>
              <button
                type="button"
                onClick={onApplyCityToAllRooms}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 rounded-md transition-colors"
                title="Terapkan kota & garis tanggal tanda tangan Kepala Sekolah ke semua ruang"
              >
                <Copy className="w-3 h-3" />
                <span>Terapkan Kota TTD ke Semua Ruang</span>
              </button>
              <button
                type="button"
                onClick={onResetRecord}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Signature Place & Date Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Tempat / Kota Tanda Tangan (Kepala Sekolah)
              </label>
              <input
                type="text"
                value={record.signatureCity}
                onChange={(e) => onChangeRecord({ ...record, signatureCity: e.target.value })}
                placeholder="Contoh: Kemranjen / Jakarta"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Tanggal / Garis Tanda Tangan
              </label>
              <input
                type="text"
                value={record.signatureDateText}
                onChange={(e) => onChangeRecord({ ...record, signatureDateText: e.target.value })}
                placeholder="_____________________ atau 20 Oktober 2026"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Full Multi-Day Per-Subject Input Table */}
          <div className="border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-1.5 px-2 text-center w-10">No</th>
                  <th className="py-1.5 px-2.5 w-36">Hari, Tgl</th>
                  <th className="py-1.5 px-2.5">Mata Pelajaran</th>
                  <th className="py-1.5 px-2.5 w-44">Nama Pengawas</th>
                  <th className="py-1.5 px-2 text-center w-20">Tdk Hadir (Jml)</th>
                  <th className="py-1.5 px-2 text-center w-28">Nomor Peserta</th>
                  <th className="py-1.5 px-2 text-center w-20">Jml. Hadir</th>
                  <th className="py-1.5 px-2.5 w-28">Ket.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dayGroups.map((dg) =>
                  dg.sessions.map((sch, sIdx) => {
                    const entry = record.sessions[sch.id];
                    return (
                      <tr key={sch.id} className="hover:bg-slate-50/70">
                        {sIdx === 0 && (
                          <>
                            <td
                              rowSpan={dg.sessions.length}
                              className="py-1.5 px-2 text-center font-mono font-bold bg-slate-50/50 border-r border-slate-200 align-middle"
                            >
                              {dg.dayNumber}
                            </td>
                            <td
                              rowSpan={dg.sessions.length}
                              className="py-1.5 px-2.5 text-2xs font-semibold text-slate-800 bg-slate-50/50 border-r border-slate-200 align-middle"
                            >
                              {dg.day}, {dg.date}
                            </td>
                          </>
                        )}
                        <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                          {sch.subject}
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="Input nama pengawas..."
                            value={entry?.invigilatorName || ''}
                            onChange={(e) => updateSession(sch.id, 'invigilatorName', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="0"
                            value={entry?.absentCount || ''}
                            onChange={(e) => updateSession(sch.id, 'absentCount', e.target.value)}
                            className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="No. peserta"
                            value={entry?.absentNumbers || ''}
                            onChange={(e) => updateSession(sch.id, 'absentNumbers', e.target.value)}
                            className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder={String(roomStudentsCount)}
                            value={entry?.presentCount || ''}
                            onChange={(e) => updateSession(sch.id, 'presentCount', e.target.value)}
                            className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="Lancar"
                            value={entry?.notes || ''}
                            onChange={(e) => updateSession(sch.id, 'notes', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-2xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Perubahan langsung tersimpan & tampil di pratinjau A4 maupun file PDF. (Pilih "Mode Terisi" agar isian tercetak, atau "Formulir Kosong" untuk cetak siap tulis tangan).
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

interface HandoverControlBarProps {
  room: Room;
  dayGroups: ExamDayGroup[];
  selectedDayGroup: ExamDayGroup;
  onSelectDayKey: (dayKey: string) => void;
  record: HandoverBeritaAcaraRecord;
  onChangeRecord: (updated: HandoverBeritaAcaraRecord) => void;
  onResetRecord: () => void;
  onApplyOfficerToAllRooms: () => void;
  directionMode: HandoverDirectionMode;
  onChangeDirectionMode: (mode: HandoverDirectionMode) => void;
  blankMode: boolean;
  onToggleBlankMode: (val: boolean) => void;
  isEditing: boolean;
  onToggleEditing: () => void;
  roomStudentsCount: number;
}

export const HandoverControlBar: React.FC<HandoverControlBarProps> = ({
  room,
  dayGroups,
  selectedDayGroup,
  onSelectDayKey,
  record,
  onChangeRecord,
  onResetRecord,
  onApplyOfficerToAllRooms,
  directionMode,
  onChangeDirectionMode,
  blankMode,
  onToggleBlankMode,
  isEditing,
  onToggleEditing,
  roomStudentsCount,
}) => {
  const updateSession = (
    scheduleId: string,
    field:
      | 'questionCopies'
      | 'answerSheetCopies'
      | 'returnedFilledSheets'
      | 'returnedUnusedSheets'
      | 'returnedQuestionCopies'
      | 'notes',
    value: string
  ) => {
    const existing = record.sessions[scheduleId] || {
      scheduleId,
      questionCopies: '',
      answerSheetCopies: '',
      returnedFilledSheets: '',
      returnedUnusedSheets: '',
      returnedQuestionCopies: '',
      notes: '',
    };
    onChangeRecord({
      ...record,
      sessions: {
        ...record.sessions,
        [scheduleId]: {
          ...existing,
          [field]: value,
        },
      },
    });
  };

  return (
    <div className="print:hidden bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
      {/* Row 1: Day Selector + Direction Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1 mr-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            Hari Ujian:
          </span>
          {dayGroups.map((dg) => (
            <button
              key={dg.dayKey}
              type="button"
              onClick={() => onSelectDayKey(dg.dayKey)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                dg.dayKey === selectedDayGroup.dayKey
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Hari {dg.dayNumber}: {dg.day} ({dg.date})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-2xs font-semibold">
            <button
              type="button"
              onClick={() => onToggleBlankMode(false)}
              className={`px-2.5 py-1 rounded transition-colors ${
                !blankMode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Mode Terisi
            </button>
            <button
              type="button"
              onClick={() => onToggleBlankMode(true)}
              className={`px-2.5 py-1 rounded transition-colors ${
                blankMode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Formulir Kosong (Tulis Tangan)
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleEditing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border transition-colors ${
              isEditing
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Tutup Form Edit BA' : 'Isi / Edit Serah Terima'}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Handover Direction Selector */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        <span className="text-2xs font-bold text-slate-600 uppercase tracking-wide">
          Arah Berita Acara:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChangeDirectionMode('both')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
              directionMode === 'both'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>2 Arah Lengkap (Panitia ⇄ Pengawas)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeDirectionMode('to-invigilator')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
              directionMode === 'to-invigilator'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Panitia → Pengawas (Pengambilan)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeDirectionMode('to-committee')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
              directionMode === 'to-committee'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Pengawas → Panitia (Pengembalian)</span>
          </button>
        </div>
      </div>

      {/* Collapsible Handover Editor */}
      {isEditing && (
        <div className="pt-3 border-t border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-700">
              Mengedit BA Serah Terima: <strong className="text-slate-900">{room.name} ({room.code})</strong> &middot;{' '}
              <strong>{selectedDayGroup.label}</strong> (Peserta: {roomStudentsCount} siswa)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onApplyOfficerToAllRooms}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 rounded-md transition-colors"
                title="Terapkan nama petugas panitia, jam serah terima, dan cadangan naskah ke semua ruang dan hari"
              >
                <Copy className="w-3 h-3" />
                <span>Terapkan Petugas & Jam ke Semua Ruang</span>
              </button>
              <button
                type="button"
                onClick={onResetRecord}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Core Handover Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">Nomor Berita Acara</label>
              <input
                type="text"
                value={record.documentNumber}
                onChange={(e) => onChangeRecord({ ...record, documentNumber: e.target.value })}
                className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">
                Cadangan Naskah / LJU per Ruang
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={record.reserveCopies}
                onChange={(e) => {
                  const res = Math.max(0, parseInt(e.target.value, 10) || 0);
                  const newTotal = String(roomStudentsCount + res);
                  const updatedSessions = { ...record.sessions };
                  for (const sch of selectedDayGroup.sessions) {
                    const prev = updatedSessions[sch.id] || {
                      scheduleId: sch.id,
                      questionCopies: newTotal,
                      answerSheetCopies: newTotal,
                      returnedFilledSheets: '',
                      returnedUnusedSheets: '',
                      returnedQuestionCopies: '',
                      notes: '',
                    };
                    updatedSessions[sch.id] = {
                      ...prev,
                      questionCopies: newTotal,
                      answerSheetCopies: newTotal,
                    };
                  }
                  onChangeRecord({ ...record, reserveCopies: res, sessions: updatedSessions });
                }}
                className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-600 mb-1">Pengawas Ruang</label>
              <input
                type="text"
                value={record.invigilator1}
                onChange={(e) => onChangeRecord({ ...record, invigilator1: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Stage I & Stage II Officers & Timestamps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
              <span className="text-2xs font-bold text-slate-800 uppercase block">
                Tahap I: Panitia → Pengawas (Pengambilan)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-2xs text-slate-600 mb-0.5">Petugas Panitia (Menyerahkan)</label>
                  <input
                    type="text"
                    value={record.committeeOfficerOut}
                    onChange={(e) => onChangeRecord({ ...record, committeeOfficerOut: e.target.value })}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-2xs text-slate-600 mb-0.5">Waktu Pengambilan</label>
                  <input
                    type="text"
                    value={record.handoverOutTime}
                    onChange={(e) => onChangeRecord({ ...record, handoverOutTime: e.target.value })}
                    className="w-full px-2 py-1 bg-white font-mono border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-2xs text-slate-600 mb-0.5">Kondisi Segel Amplop</label>
                <input
                  type="text"
                  value={record.sealStatusOut}
                  onChange={(e) => onChangeRecord({ ...record, sealStatusOut: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-2xs text-slate-600 mb-0.5">Catatan Pengambilan</label>
                <input
                  type="text"
                  value={record.notesOut}
                  onChange={(e) => onChangeRecord({ ...record, notesOut: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-teal-50/50 border border-teal-200 rounded-md p-3 space-y-2">
              <span className="text-2xs font-bold text-teal-900 uppercase block">
                Tahap II: Pengawas → Panitia (Pengembalian)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-2xs text-slate-600 mb-0.5">Petugas Panitia (Menerima)</label>
                  <input
                    type="text"
                    value={record.committeeOfficerIn}
                    onChange={(e) => onChangeRecord({ ...record, committeeOfficerIn: e.target.value })}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-2xs text-slate-600 mb-0.5">Waktu Pengembalian</label>
                  <input
                    type="text"
                    value={record.handoverInTime}
                    onChange={(e) => onChangeRecord({ ...record, handoverInTime: e.target.value })}
                    className="w-full px-2 py-1 bg-white font-mono border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-2xs text-slate-600 mb-0.5">Kondisi Berkas Pengembalian</label>
                <input
                  type="text"
                  value={record.sealStatusIn}
                  onChange={(e) => onChangeRecord({ ...record, sealStatusIn: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-2xs text-slate-600 mb-0.5">Catatan Pengembalian</label>
                <input
                  type="text"
                  value={record.notesIn}
                  onChange={(e) => onChangeRecord({ ...record, notesIn: e.target.value })}
                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Per-Session Quantities Editor */}
          <div className="border border-slate-200 rounded-md overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-1.5 px-2.5">Mata Pelajaran</th>
                  <th className="py-1.5 px-2 text-center w-24">Soal Diambil</th>
                  <th className="py-1.5 px-2 text-center w-24">LJU Diambil</th>
                  <th className="py-1.5 px-2 text-center w-24">LJU Terisi</th>
                  <th className="py-1.5 px-2 text-center w-24">LJU Sisa</th>
                  <th className="py-1.5 px-2 text-center w-24">Soal Kembali</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {selectedDayGroup.sessions.map((sch) => {
                  const entry = record.sessions[sch.id];
                  return (
                    <tr key={sch.id}>
                      <td className="py-1.5 px-2.5 font-semibold text-slate-900">
                        {sch.subject}
                        <span className="block text-2xs font-normal text-slate-500">{sch.time}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={entry?.questionCopies || ''}
                          onChange={(e) => updateSession(sch.id, 'questionCopies', e.target.value)}
                          className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={entry?.answerSheetCopies || ''}
                          onChange={(e) => updateSession(sch.id, 'answerSheetCopies', e.target.value)}
                          className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          placeholder={String(roomStudentsCount)}
                          value={entry?.returnedFilledSheets || ''}
                          onChange={(e) => updateSession(sch.id, 'returnedFilledSheets', e.target.value)}
                          className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          placeholder={String(record.reserveCopies)}
                          value={entry?.returnedUnusedSheets || ''}
                          onChange={(e) => updateSession(sch.id, 'returnedUnusedSheets', e.target.value)}
                          className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          placeholder={entry?.questionCopies || ''}
                          value={entry?.returnedQuestionCopies || ''}
                          onChange={(e) => updateSession(sch.id, 'returnedQuestionCopies', e.target.value)}
                          className="w-full px-2 py-1 text-center font-mono border border-slate-300 rounded"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

interface ExamJournalSheetProps {
  room: Room;
  dayGroups: ExamDayGroup[];
  roomStudents: Student[];
  settings: ExamSettings;
  record: DailyRoomJournalRecord;
  blankMode: boolean;
}

export const ExamJournalSheet: React.FC<ExamJournalSheetProps> = ({
  room,
  dayGroups,
  roomStudents,
  settings,
  record,
  blankMode,
}) => {
  const cityLabel = (record.signatureCity || extractCityFromSettings(settings)).trim();
  const dateLine = (
    record.signatureDateText || extractSignatureDateFromSettings(settings, '_____________________')
  ).trim();

  const totalSessionRows = dayGroups.reduce((acc, dg) => acc + Math.max(1, dg.sessions.length), 0);
  const journalRowPrintClass = totalSessionRows > 10 ? 'print:py-1 print:text-[10.5px]' : 'print:py-1.5';

  return (
    <div className="space-y-3 print:space-y-2 text-black">
      {/* Document Title matching uploaded image */}
      <div className="text-center pb-1 print:pb-0.5">
        <h2 className="text-sm font-bold text-black tracking-tight uppercase">
          JURNAL HARIAN {(settings.examTitle || 'UJIAN SEKOLAH').toUpperCase()}
        </h2>
        <p className="text-xs font-medium text-black">
          Tahun Ajaran {settings.academicYear}
        </p>
      </div>

      {/* Room Label (RUANG : 01) */}
      <div className="text-xs font-bold text-black tracking-wide">
        RUANG : {formatRoomNumberLabel(room)}
      </div>

      {/* Official Table Matching Uploaded Image Exactly */}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse border border-black text-xs text-black">
          <thead>
            <tr className="bg-[#d9d9d9] text-black font-bold text-center">
              <th rowSpan={3} className="border border-black px-1.5 py-1.5 w-8 align-middle">
                No.
              </th>
              <th rowSpan={3} className="border border-black px-2 py-1.5 w-28 align-middle">
                Hari, tgl
              </th>
              <th rowSpan={3} className="border border-black px-2 py-1.5 align-middle">
                Mata Pelajaran
              </th>
              <th rowSpan={3} className="border border-black px-2 py-1.5 w-32 align-middle">
                Nama Pengawas
              </th>
              <th colSpan={4} className="border border-black px-1.5 py-1 align-middle">
                Peserta
              </th>
              <th rowSpan={3} className="border border-black px-2 py-1.5 w-16 align-middle">
                Paraf
              </th>
              <th rowSpan={3} className="border border-black px-2 py-1.5 w-16 align-middle">
                Ket.
              </th>
            </tr>
            <tr className="bg-[#d9d9d9] text-black font-bold text-center text-2xs">
              <th rowSpan={2} className="border border-black px-1 py-1 w-12 align-middle leading-tight">
                Harus
                <br />
                Hadir
              </th>
              <th colSpan={2} className="border border-black px-1 py-1 align-middle">
                Tidak Hadir
              </th>
              <th rowSpan={2} className="border border-black px-1 py-1 w-12 align-middle leading-tight">
                Jml.
                <br />
                Hadir
              </th>
            </tr>
            <tr className="bg-[#d9d9d9] text-black font-bold text-center text-2xs">
              <th className="border border-black px-1 py-0.5 w-9">Jml</th>
              <th className="border border-black px-1 py-0.5 w-16">Nomor</th>
            </tr>
          </thead>

          <tbody>
            {dayGroups.map((dg) =>
              dg.sessions.map((sch, sIdx) => {
                const entry = record.sessions[sch.id];
                return (
                  <tr key={sch.id} className="text-xs">
                    {sIdx === 0 && (
                      <>
                        <td
                          rowSpan={dg.sessions.length}
                          className={`border border-black px-1.5 py-2 ${journalRowPrintClass} text-center align-middle`}
                        >
                          {dg.dayNumber}
                        </td>
                        <td
                          rowSpan={dg.sessions.length}
                          className={`border border-black px-2 py-2 ${journalRowPrintClass} text-left align-middle leading-snug`}
                        >
                          {dg.day},<br />
                          {dg.date}
                        </td>
                      </>
                    )}
                    <td className={`border border-black px-2 py-2 ${journalRowPrintClass} align-middle`}>
                      {sch.subject}
                    </td>
                    <td className={`border border-black px-2 py-2 ${journalRowPrintClass} align-middle`}>
                      {blankMode ? (
                        ''
                      ) : (
                        <>
                          <span className="block">{entry?.invigilatorName || ''}</span>
                          {entry?.invigilatorName &&
                            getRoomDaySessionInvigilatorNip(
                              room,
                              dg.dayKey,
                              sch.id,
                              settings
                            ) && (
                              <span className="block text-[10px] font-mono text-slate-600">
                                NIP.{' '}
                                {getRoomDaySessionInvigilatorNip(
                                  room,
                                  dg.dayKey,
                                  sch.id,
                                  settings
                                )}
                              </span>
                            )}
                        </>
                      )}
                    </td>
                    <td className={`border border-black px-1.5 py-2 ${journalRowPrintClass} text-center align-middle`}>
                      {roomStudents.length}
                    </td>
                    <td className={`border border-black px-1.5 py-2 ${journalRowPrintClass} text-center align-middle`}>
                      {blankMode ? '' : entry?.absentCount || ''}
                    </td>
                    <td className={`border border-black px-1.5 py-2 ${journalRowPrintClass} text-center align-middle`}>
                      {blankMode ? '' : entry?.absentNumbers || ''}
                    </td>
                    <td className={`border border-black px-1.5 py-2 ${journalRowPrintClass} text-center align-middle`}>
                      {blankMode ? '' : entry?.presentCount || ''}
                    </td>
                    <td className={`border border-black px-1.5 py-2 ${journalRowPrintClass} text-center align-middle`}>
                      &nbsp;
                    </td>
                    <td className={`border border-black px-1.5 py-2 ${journalRowPrintClass} align-middle`}>
                      {blankMode ? '' : entry?.notes || ''}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Right Kepala Sekolah Signature Block (kept on same sheet) */}
      <div className="pt-5 print:pt-2 flex justify-end print-keep-with-prev">
        <div className="w-60 text-left text-xs text-black">
          <p>
            {cityLabel}, {dateLine}
          </p>
          <p>Kepala Sekolah</p>
          <OfficialSignatureGraphic
            signatureUrl={settings.headmasterSignature}
            stampUrl={settings.schoolStamp}
            heightClass="h-14 print:h-11"
            align="left"
          />
          <p className="font-bold">{settings.headmaster}</p>
          <p>NIP {settings.headmasterNip || '-'}</p>
        </div>
      </div>
    </div>
  );
};

interface ExamHandoverSheetProps {
  room: Room;
  dayGroup: ExamDayGroup;
  roomStudents: Student[];
  settings: ExamSettings;
  record: HandoverBeritaAcaraRecord;
  directionMode: HandoverDirectionMode;
  blankMode: boolean;
}

export const ExamHandoverSheet: React.FC<ExamHandoverSheetProps> = ({
  room,
  dayGroup,
  roomStudents,
  settings,
  record,
  directionMode,
  blankMode,
}) => {
  const titleMap: Record<HandoverDirectionMode, string> = {
    both: 'BERITA ACARA SERAH TERIMA NASKAH & BERKAS UJIAN',
    'to-invigilator': 'BERITA ACARA PENYERAHAN BERKAS (PANITIA KE PENGAWAS)',
    'to-committee': 'BERITA ACARA PENGEMBALIAN BERKAS (PENGAWAS KE PANITIA)',
  };

  const dayInvSummary = getRoomDaySessionSummaryLabel(room, dayGroup, settings);
  const invigilatorLabel = record.invigilator1 || dayInvSummary;
  const invigilatorNips = Array.from(
    new Set(
      getRoomDaySessionEntries(room, dayGroup, settings)
        .map((e) => e.invigilatorNip)
        .filter(Boolean)
    )
  );
  const invigilatorNipLabel = invigilatorNips.join(' / ');
  const resolveSessInv = (scheduleId: string) =>
    record.sessionInvigilators?.[scheduleId] !== undefined
      ? record.sessionInvigilators[scheduleId]
      : getRoomDaySessionInvigilator(room, dayGroup.dayKey, scheduleId, settings);

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Header Title */}
      <div className="text-center pb-1 print:pb-0">
        <div className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-slate-500 mb-0.5">
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Dokumen Serah Terima Panitia ⇄ Pengawas Ruang</span>
        </div>
        <h2 className="text-base font-bold text-slate-950 tracking-tight uppercase">
          {titleMap[directionMode]}
        </h2>
        <p className="text-xs font-semibold text-slate-700">
          {settings.activityName || settings.examTitle} &middot; TAHUN AJARAN {settings.academicYear}
        </p>
        <p className="text-2xs font-mono font-bold text-slate-600 mt-0.5">
          Nomor: {record.documentNumber}
        </p>
      </div>

      {/* Narrative Opening Paragraph */}
      <div className="bg-slate-50 border border-slate-800 rounded-md p-3 print:p-2 text-xs text-slate-900 leading-relaxed print:leading-snug">
        Pada hari ini, <strong>{dayGroup.day}</strong> tanggal <strong>{dayGroup.date}</strong> (Hari ke-
        {dayGroup.dayNumber}), bertempat di Sekretariat Panitia <strong>{settings.schoolName}</strong>, telah
        dilaksanakan serah terima naskah soal dan kelengkapan berkas ujian untuk{' '}
        <strong>
          {room.name} ({room.code})
        </strong>{' '}
        — {room.building} dengan jumlah peserta terdaftar <strong>{roomStudents.length} siswa</strong> (Kapasitas{' '}
        {room.capacity} kursi).
      </div>

      {/* STAGE I: PANITIA -> PENGAWAS */}
      {(directionMode === 'both' || directionMode === 'to-invigilator') && (
        <div className="border border-slate-900 rounded-md overflow-hidden print-keep-together">
          <div className="bg-slate-900 text-white px-3 py-2 print:py-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide">
              I. Serah Terima Dari Panitia ke Pengawas Ruang (Pengambilan Naskah & Berkas)
            </span>
            <span className="text-2xs font-mono text-slate-300">
              Pukul: {blankMode ? '.......... WIB' : record.handoverOutTime}
            </span>
          </div>

          <div className="p-3 print:p-2 space-y-2.5 print:space-y-1.5 bg-white">
            <div className="flex flex-wrap justify-between gap-2 text-2xs text-slate-800 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-700">
              <span>
                <strong>Pihak I (Menyerahkan):</strong> {record.committeeOfficerOut || settings.committeeHead} (Panitia)
              </span>
              <span>
                <strong>Kondisi Segel:</strong> {blankMode ? '..................................' : record.sealStatusOut}
              </span>
            </div>

            <div className="border border-slate-900 rounded overflow-hidden">
              <table className="w-full text-left text-2xs border-collapse">
                <thead className="bg-slate-800 text-white font-semibold">
                  <tr>
                    <th className="py-1.5 px-2 text-center w-8 border-r border-b border-slate-900">No</th>
                    <th className="py-1.5 px-2 text-center w-32 border-r border-b border-slate-900">Sesi / Waktu</th>
                    <th className="py-1.5 px-2 border-r border-b border-slate-900">Mata Pelajaran</th>
                    <th className="py-1.5 px-2 text-center w-24 border-r border-b border-slate-900">Naskah Soal (Eks)</th>
                    <th className="py-1.5 px-2 text-center w-24 border-r border-b border-slate-900">LJU / LJK (Lbr)</th>
                    <th className="py-1.5 px-2 text-center w-24 border-r border-b border-slate-900">Daftar Hadir & BA</th>
                    <th className="py-1.5 px-2 text-center w-24 border-b border-slate-900">Kondisi Segel</th>
                  </tr>
                </thead>
                <tbody>
                  {dayGroup.sessions.map((sch, idx) => {
                    const entry = record.sessions[sch.id];
                    const fallbackCopies = String(roomStudents.length + (record.reserveCopies || 0));
                    return (
                      <tr key={sch.id} className="border-t border-slate-800">
                        <td className="py-1.5 px-2 text-center font-mono border-r border-slate-800">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-center border-r border-slate-800">
                          {sch.roomNotes || `Sesi ${idx + 1}`} ({sch.time})
                        </td>
                        <td className="py-1.5 px-2 font-bold text-slate-950 border-r border-slate-800">
                          {sch.subject}
                          {!blankMode && resolveSessInv(sch.id) && dayGroup.sessions.length > 1 && (
                            <span className="block text-[10px] font-normal text-slate-600">
                              Pengawas: {resolveSessInv(sch.id)}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold border-r border-slate-800">
                          {blankMode ? '' : entry?.questionCopies || fallbackCopies}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold border-r border-slate-800">
                          {blankMode ? '' : entry?.answerSheetCopies || fallbackCopies}
                        </td>
                        <td className="py-1.5 px-2 text-center border-r border-slate-800">1 Set</td>
                        <td className="py-1.5 px-2 text-center">{blankMode ? '' : 'Utuh'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-2xs italic text-slate-700">
              Catatan Pengambilan:{' '}
              {blankMode
                ? '..............................................................................................................'
                : record.notesOut || '-'}
            </p>

            {/* Stage I Signatures */}
            <div className="pt-2 print:pt-1 grid grid-cols-2 gap-6 text-center text-2xs text-slate-900 print-keep-with-prev">
              <div>
                <p>Yang Menyerahkan,</p>
                <p className="font-bold">Petugas / Panitia Ujian</p>
                <div className="h-11 print:h-8" />
                <p className="font-bold underline">({record.committeeOfficerOut || settings.committeeHead})</p>
              </div>
              <div>
                <p>Yang Menerima,</p>
                <p className="font-bold">Pengawas {room.name}</p>
                <div className="h-11 print:h-8" />
                <p className="font-bold underline">({invigilatorLabel || '....................................'})</p>
                {invigilatorNipLabel && (
                  <p className="text-[10px] font-mono text-slate-700">NIP. {invigilatorNipLabel}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE II: PENGAWAS -> PANITIA */}
      {(directionMode === 'both' || directionMode === 'to-committee') && (
        <div className="border border-slate-900 rounded-md overflow-hidden print-keep-together print-keep-with-next">
          <div className="bg-teal-800 text-white px-3 py-2 print:py-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide">
              II. Serah Terima Dari Pengawas Ruang ke Panitia (Pengembalian Hasil & Berkas Ujian)
            </span>
            <span className="text-2xs font-mono text-teal-100">
              Pukul: {blankMode ? '.......... WIB' : record.handoverInTime}
            </span>
          </div>

          <div className="p-3 print:p-2 space-y-2.5 print:space-y-1.5 bg-white">
            <div className="flex flex-wrap justify-between gap-2 text-2xs text-slate-800 bg-teal-50/60 px-2.5 py-1.5 rounded border border-slate-700">
              <span>
                <strong>Pihak I (Menyerahkan):</strong> Pengawas {room.name} ({invigilatorLabel || '-'})
              </span>
              <span>
                <strong>Kondisi Berkas:</strong> {blankMode ? '..................................' : record.sealStatusIn}
              </span>
            </div>

            <div className="border border-slate-900 rounded overflow-hidden">
              <table className="w-full text-left text-2xs border-collapse">
                <thead className="bg-teal-800 text-white font-semibold">
                  <tr>
                    <th className="py-1.5 px-2 text-center w-8 border-r border-b border-slate-900">No</th>
                    <th className="py-1.5 px-2 text-center w-32 border-r border-b border-slate-900">Sesi / Waktu</th>
                    <th className="py-1.5 px-2 border-r border-b border-slate-900">Mata Pelajaran</th>
                    <th className="py-1.5 px-2 text-center w-24 border-r border-b border-slate-900">LJU Terisi (Lbr)</th>
                    <th className="py-1.5 px-2 text-center w-24 border-r border-b border-slate-900">Sisa LJU Kosong</th>
                    <th className="py-1.5 px-2 text-center w-24 border-r border-b border-slate-900">Naskah Kembali</th>
                    <th className="py-1.5 px-2 text-center w-24 border-b border-slate-900">Daftar Hadir / Ket.</th>
                  </tr>
                </thead>
                <tbody>
                  {dayGroup.sessions.map((sch, idx) => {
                    const entry = record.sessions[sch.id];
                    return (
                      <tr key={sch.id} className="border-t border-slate-800">
                        <td className="py-1.5 px-2 text-center font-mono border-r border-slate-800">{idx + 1}</td>
                        <td className="py-1.5 px-2 text-center border-r border-slate-800">
                          {sch.roomNotes || `Sesi ${idx + 1}`} ({sch.time})
                        </td>
                        <td className="py-1.5 px-2 font-bold text-slate-950 border-r border-slate-800">
                          {sch.subject}
                          {!blankMode && resolveSessInv(sch.id) && dayGroup.sessions.length > 1 && (
                            <span className="block text-[10px] font-normal text-slate-600">
                              Pengawas: {resolveSessInv(sch.id)}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold border-r border-slate-800">
                          {blankMode ? '' : entry?.returnedFilledSheets || '......'}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono border-r border-slate-800">
                          {blankMode ? '' : entry?.returnedUnusedSheets || '......'}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono border-r border-slate-800">
                          {blankMode ? '' : entry?.returnedQuestionCopies || '......'}
                        </td>
                        <td className="py-1.5 px-2 text-center">{blankMode ? '' : entry?.notes || 'Lengkap'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-2xs italic text-slate-700">
              Catatan Pengembalian:{' '}
              {blankMode
                ? '..............................................................................................................'
                : record.notesIn || '-'}
            </p>

            {/* Stage II Signatures (Reversed) */}
            <div className="pt-2 print:pt-1 grid grid-cols-2 gap-6 text-center text-2xs text-slate-900 print-keep-with-prev">
              <div>
                <p>Yang Menyerahkan,</p>
                <p className="font-bold">Pengawas {room.name}</p>
                <div className="h-11 print:h-8" />
                <p className="font-bold underline">({invigilatorLabel || '....................................'})</p>
                {invigilatorNipLabel && (
                  <p className="text-[10px] font-mono text-slate-700">NIP. {invigilatorNipLabel}</p>
                )}
              </div>
              <div>
                <p>Yang Menerima,</p>
                <p className="font-bold">Petugas / Panitia Ujian</p>
                <div className="h-11 print:h-8" />
                <p className="font-bold underline">({record.committeeOfficerIn || settings.committeeHead})</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Final Sign-off by Ketua Panitia (kept on same sheet) */}
      <div className="pt-3 print:pt-2 border-t border-slate-800 text-center text-2xs text-slate-900 print-keep-with-prev">
        <p className="text-slate-700">
          {extractCityFromSettings(settings)}, {extractSignatureDateFromSettings(settings)}
        </p>
        <p className="text-slate-700">Mengetahui &amp; Mengesahkan,</p>
        <p className="font-bold text-xs">Ketua Panitia Ujian</p>
        <OfficialSignatureGraphic
          signatureUrl={settings.committeeSignature}
          stampUrl={settings.schoolStamp}
          heightClass="h-12 print:h-10"
        />
        <p className="font-bold underline text-xs">{settings.committeeHead}</p>
        <p className="text-slate-700 font-mono">NIP. {settings.committeeNip || '-'}</p>
      </div>
    </div>
  );
};

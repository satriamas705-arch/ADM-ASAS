import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UserCheck,
  Save,
  Calendar,
  Copy,
  Grid,
  List,
  Eraser,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  AlertCircle,
} from 'lucide-react';
import {
  Room,
  ExamSettings,
  ExamScheduleItem,
  DailyRoomInvigilatorAssignment,
} from '../types';
import { buildExamDayGroups, makeRoomDayKey } from '../utils/examDocuments';
import {
  exportInvigilatorsMatrixExcel,
  parseInvigilatorsFromExcel,
} from '../utils/exportExcel';

interface DailyInvigilatorMatrixProps {
  rooms: Room[];
  schedules: ExamScheduleItem[];
  settings: ExamSettings;
  onSave: (
    dailyMap: Record<string, DailyRoomInvigilatorAssignment>,
    updatedRooms: Room[],
    message: string
  ) => void;
  showRoomConfigColumns?: boolean;
  title?: string;
  subtitle?: string;
}

export const DailyInvigilatorMatrix: React.FC<DailyInvigilatorMatrixProps> = ({
  rooms,
  schedules,
  settings,
  onSave,
  showRoomConfigColumns = false,
  title = 'Input Pengawas Ruang Ujian (Per Hari & Per Ruang)',
  subtitle,
}) => {
  const dayGroups = useMemo(() => buildExamDayGroups(schedules), [schedules]);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(dayGroups[0]?.dayKey || '');
  const [viewMode, setViewMode] = useState<'per-day' | 'matrix'>('per-day');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dayGroups.some((dg) => dg.dayKey === selectedDayKey) && dayGroups.length > 0) {
      setSelectedDayKey(dayGroups[0].dayKey);
    }
  }, [dayGroups, selectedDayKey]);

  const activeDayGroup =
    dayGroups.find((dg) => dg.dayKey === selectedDayKey) || dayGroups[0];

  const buildInitialDrafts = useMemo(() => {
    const next: Record<string, DailyRoomInvigilatorAssignment> = {};
    for (const room of rooms) {
      for (const dg of dayGroups) {
        const key = makeRoomDayKey(room.id, dg.dayKey);
        const savedEntry = settings.dailyInvigilators?.[key];
        next[key] = {
          invigilator1:
            savedEntry !== undefined ? savedEntry.invigilator1 || '' : room.invigilator1 || '',
        };
      }
    }
    return next;
  }, [rooms, dayGroups, settings.dailyInvigilators]);

  const [drafts, setDrafts] = useState<Record<string, DailyRoomInvigilatorAssignment>>(
    buildInitialDrafts
  );

  useEffect(() => {
    setDrafts(buildInitialDrafts);
    setHasUnsavedChanges(false);
  }, [buildInitialDrafts]);

  const handleFieldChange = (roomId: string, dayKey: string, value: string) => {
    const key = makeRoomDayKey(roomId, dayKey);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        invigilator1: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleCopyDayToAllDays = () => {
    if (!activeDayGroup) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        const srcKey = makeRoomDayKey(room.id, activeDayGroup.dayKey);
        const src = next[srcKey] || {
          invigilator1: room.invigilator1 || '',
        };
        for (const dg of dayGroups) {
          const targetKey = makeRoomDayKey(room.id, dg.dayKey);
          next[targetKey] = {
            invigilator1: src.invigilator1,
          };
        }
      }
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleClearActiveDay = () => {
    if (!activeDayGroup) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        const key = makeRoomDayKey(room.id, activeDayGroup.dayKey);
        next[key] = { invigilator1: '' };
      }
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = () => {
    const cleanedMap: Record<string, DailyRoomInvigilatorAssignment> = {
      ...(settings.dailyInvigilators || {}),
    };

    for (const room of rooms) {
      for (const dg of dayGroups) {
        const key = makeRoomDayKey(room.id, dg.dayKey);
        const draft = drafts[key];
        if (draft) {
          cleanedMap[key] = {
            invigilator1: draft.invigilator1.trim(),
          };
        }
      }
    }

    const firstDayKey = dayGroups[0]?.dayKey;
    const updatedRooms = rooms.map((r) => {
      if (!firstDayKey) return r;
      const day1 = cleanedMap[makeRoomDayKey(r.id, firstDayKey)];
      if (!day1) return r;
      return {
        ...r,
        invigilator1: day1.invigilator1 || r.invigilator1,
        invigilator2: undefined,
      };
    });

    setHasUnsavedChanges(false);
    onSave(
      cleanedMap,
      updatedRooms,
      `Daftar pengawas untuk ${rooms.length} ruang × ${dayGroups.length} hari ujian berhasil disimpan!`
    );
  };

  const getFilledCountForDay = (dayKey: string) => {
    let count = 0;
    for (const room of rooms) {
      const entry = drafts[makeRoomDayKey(room.id, dayKey)];
      if (entry?.invigilator1?.trim()) count += 1;
    }
    return count;
  };

  const handleExportInvigilatorsExcel = () => {
    exportInvigilatorsMatrixExcel(rooms, schedules, settings);
    setImportStatus({
      type: 'success',
      text: `File Excel Daftar Pengawas (${rooms.length} ruang × ${dayGroups.length} hari) berhasil diunduh. Anda dapat mengeditnya lalu mengunggah kembali via tombol Impor Excel.`,
    });
    setTimeout(() => setImportStatus(null), 5000);
  };

  const handleImportInvigilatorsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseInvigilatorsFromExcel(file, rooms, schedules, settings);
      setDrafts((prev) => ({ ...prev, ...result.dailyMap }));
      setHasUnsavedChanges(false);

      const warnSuffix =
        result.unmatchedLabels.length > 0
          ? ` (${result.unmatchedLabels.length} baris dilewati: ${result.unmatchedLabels.slice(0, 3).join(', ')})`
          : '';
      const msg = `Berhasil mengimpor ${result.updatedCells} jadwal pengawas untuk ${result.matchedRooms} ruang!${warnSuffix}`;

      onSave(result.dailyMap, result.updatedRooms, msg);
      setImportStatus({ type: 'success', text: msg });
      setTimeout(() => setImportStatus(null), 6000);
    } catch (err: unknown) {
      setImportStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membaca file Excel pengawas.',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const maxSeatRule = settings.maxSeatRule || 30;

  return (
    <div className="space-y-3">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-slate-700" />
            <span>{title}</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            {subtitle ||
              `Atur Pengawas Ruang untuk setiap hari ujian (${dayGroups.length} hari × ${rooms.length} ruang). Otomatis tersinkron ke Daftar Hadir, Jurnal Harian, dan Berita Acara.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-2xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('per-day')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'per-day'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3 h-3" />
              <span>Per Hari</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'matrix'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>Matriks Semua Hari</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportInvigilatorsExcel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
            title="Ekspor daftar / template pengawas ruang ke Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Ekspor Excel</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportInvigilatorsFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
            title="Impor daftar pengawas per hari dari file Excel / CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor Excel</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white rounded-md transition-colors shadow-2xs ${
              hasUnsavedChanges
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              Simpan Pengawas ({dayGroups.length}H × {rooms.length}R)
            </span>
          </button>
        </div>
      </div>

      {importStatus && (
        <div
          className={`text-2xs rounded-md px-3 py-2 border flex items-center gap-2 ${
            importStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {importStatus.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          )}
          <span>{importStatus.text}</span>
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="text-2xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 flex items-center justify-between gap-2">
          <span>
            Ada perubahan daftar pengawas per hari yang belum disimpan. Klik{' '}
            <strong>Simpan Pengawas</strong> untuk menerapkan ke semua dokumen.
          </span>
        </div>
      )}

      {/* VIEW MODE 1: PER HARI (DAY TABS + ROOM TABLE) */}
      {viewMode === 'per-day' && activeDayGroup && (
        <div className="space-y-3">
          {/* Day Selector Ribbon + Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs font-bold text-slate-600 uppercase flex items-center gap-1 mr-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Pilih Hari:
              </span>
              {dayGroups.map((dg) => {
                const isSelected = dg.dayKey === activeDayGroup.dayKey;
                const filled = getFilledCountForDay(dg.dayKey);
                const allFilled = filled === rooms.length && rooms.length > 0;
                return (
                  <button
                    key={dg.dayKey}
                    type="button"
                    onClick={() => setSelectedDayKey(dg.dayKey)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>
                      Hari {dg.dayNumber}: {dg.day}, {dg.date}
                    </span>
                    <span
                      className={`text-2xs font-mono px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-slate-700 text-slate-100'
                          : allFilled
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {filled}/{rooms.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyDayToAllDays}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 rounded-md transition-colors"
                title={`Salin daftar pengawas Hari ${activeDayGroup.dayNumber} ke seluruh hari ujian`}
              >
                <Copy className="w-3 h-3" />
                <span>Salin Hari {activeDayGroup.dayNumber} ke Semua Hari</span>
              </button>
              <button
                type="button"
                onClick={handleClearActiveDay}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-white text-slate-600 border border-slate-300 hover:bg-slate-100 rounded-md transition-colors"
                title={`Kosongkan seluruh input pengawas pada Hari ${activeDayGroup.dayNumber}`}
              >
                <Eraser className="w-3 h-3" />
                <span>Kosongkan Hari Ini</span>
              </button>
            </div>
          </div>

          {/* Active Day Subjects Info */}
          <div className="text-2xs text-slate-600 flex flex-wrap items-center gap-2 px-1">
            <span className="font-semibold text-slate-800">
              {activeDayGroup.label}:
            </span>
            <span>
              {activeDayGroup.sessions.map((s) => `${s.subject} (${s.time})`).join(' · ')}
            </span>
          </div>

          {/* Per-Room Inputs Table for Selected Day */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-16">Kode</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Ruang &amp; Lokasi</th>
                  {showRoomConfigColumns && (
                    <>
                      <th className="py-2.5 px-3 text-center">Kapasitas</th>
                      <th className="py-2.5 px-3 text-center">Tata Letak</th>
                    </>
                  )}
                  <th className="py-2.5 px-3 min-w-[260px]">
                    Pengawas Ruang — Hari {activeDayGroup.dayNumber}
                  </th>
                  {showRoomConfigColumns && (
                    <th className="py-2.5 px-3 text-center">Status Aturan</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((room) => {
                  const key = makeRoomDayKey(room.id, activeDayGroup.dayKey);
                  const draft = drafts[key] || {
                    invigilator1: room.invigilator1 || '',
                  };
                  const rowsCount = Math.ceil(room.capacity / Math.max(1, room.columns));
                  const isOverMax = room.capacity > maxSeatRule;

                  return (
                    <tr key={room.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">
                        {room.code}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-slate-900 block">{room.name}</span>
                        <span className="text-2xs text-slate-500">{room.building}</span>
                      </td>
                      {showRoomConfigColumns && (
                        <>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                            {room.capacity}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                            {rowsCount} &times; {room.columns}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={draft.invigilator1}
                          onChange={(e) =>
                            handleFieldChange(room.id, activeDayGroup.dayKey, e.target.value)
                          }
                          placeholder={`Nama & gelar Pengawas ${room.name} (Hari ${activeDayGroup.dayNumber})...`}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none bg-white"
                        />
                      </td>
                      {showRoomConfigColumns && (
                        <td className="py-2 px-3 text-center">
                          {isOverMax ? (
                            <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                              Melebihi Batas POS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                              Sesuai Standar
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: MATRIKS SEMUA HARI x RUANG */}
      {viewMode === 'matrix' && (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 min-w-[150px]">
                  Ruang Ujian
                </th>
                {dayGroups.map((dg) => (
                  <th
                    key={dg.dayKey}
                    className="py-2 px-2.5 border-r border-slate-200 last:border-r-0 min-w-[205px]"
                  >
                    <div className="font-bold text-slate-900">
                      Hari {dg.dayNumber} — {dg.day}
                    </div>
                    <div className="text-2xs font-normal text-slate-500">{dg.date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rooms.map((room) => (
                <tr key={room.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-800">{room.code}</span>
                      <span className="font-semibold text-slate-900">{room.name}</span>
                    </div>
                    <span className="text-2xs text-slate-500 block mt-0.5">
                      {room.building} &middot; {room.capacity} kursi
                    </span>
                  </td>
                  {dayGroups.map((dg) => {
                    const key = makeRoomDayKey(room.id, dg.dayKey);
                    const draft = drafts[key] || {
                      invigilator1: room.invigilator1 || '',
                    };
                    return (
                      <td
                        key={dg.dayKey}
                        className="py-2 px-2 border-r border-slate-100 last:border-r-0 align-middle"
                      >
                        <input
                          type="text"
                          value={draft.invigilator1}
                          onChange={(e) =>
                            handleFieldChange(room.id, dg.dayKey, e.target.value)
                          }
                          placeholder="Nama & gelar pengawas..."
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-900 focus:outline-none bg-white"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-2xs text-slate-500 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>
          Tips: Gunakan tab <strong>Per Hari</strong> untuk mengisi per tanggal ujian atau{' '}
          <strong>Matriks Semua Hari</strong> untuk melihat seluruh jadwal pengawas sekaligus.
        </span>
      </div>
    </div>
  );
};

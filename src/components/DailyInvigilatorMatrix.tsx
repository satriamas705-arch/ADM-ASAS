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
  Clock,
} from 'lucide-react';
import {
  Room,
  ExamSettings,
  ExamScheduleItem,
  DailyRoomInvigilatorAssignment,
} from '../types';
import {
  buildExamDayGroups,
  getRoomDaySessionInvigilator,
  getRoomDaySessionInvigilatorNip,
  getSessionDisplayLabel,
  makeRoomDayKey,
  makeRoomDaySessionKey,
} from '../utils/examDocuments';
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
    sessionMap: Record<string, string>,
    updatedRooms: Room[],
    message: string,
    sessionNipMap?: Record<string, string>
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
  title = 'Input Pengawas Ruang Ujian (Per Hari, Ruang & Sesi)',
  subtitle,
}) => {
  const dayGroups = useMemo(() => buildExamDayGroups(schedules), [schedules]);
  const totalSessionsCount = useMemo(
    () => dayGroups.reduce((acc, dg) => acc + dg.sessions.length, 0),
    [dayGroups]
  );

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
    const next: Record<string, string> = {};
    for (const room of rooms) {
      for (const dg of dayGroups) {
        for (const sch of dg.sessions) {
          const sessKey = makeRoomDaySessionKey(room.id, dg.dayKey, sch.id);
          next[sessKey] = getRoomDaySessionInvigilator(room, dg.dayKey, sch.id, settings);
        }
      }
    }
    return next;
  }, [rooms, dayGroups, settings]);

  const buildInitialNipDrafts = useMemo(() => {
    const next: Record<string, string> = {};
    for (const room of rooms) {
      for (const dg of dayGroups) {
        for (const sch of dg.sessions) {
          const sessKey = makeRoomDaySessionKey(room.id, dg.dayKey, sch.id);
          next[sessKey] = getRoomDaySessionInvigilatorNip(room, dg.dayKey, sch.id, settings);
        }
      }
    }
    return next;
  }, [rooms, dayGroups, settings]);

  const [drafts, setDrafts] = useState<Record<string, string>>(buildInitialDrafts);
  const [nipDrafts, setNipDrafts] = useState<Record<string, string>>(buildInitialNipDrafts);

  useEffect(() => {
    setDrafts(buildInitialDrafts);
    setNipDrafts(buildInitialNipDrafts);
    setHasUnsavedChanges(false);
  }, [buildInitialDrafts, buildInitialNipDrafts]);

  const handleFieldChange = (
    roomId: string,
    dayKey: string,
    scheduleId: string,
    value: string
  ) => {
    const sessKey = makeRoomDaySessionKey(roomId, dayKey, scheduleId);
    setDrafts((prev) => ({
      ...prev,
      [sessKey]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const handleNipFieldChange = (
    roomId: string,
    dayKey: string,
    scheduleId: string,
    value: string
  ) => {
    const sessKey = makeRoomDaySessionKey(roomId, dayKey, scheduleId);
    setNipDrafts((prev) => ({
      ...prev,
      [sessKey]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const handleCopySession1ToAllSessionsActiveDay = () => {
    if (!activeDayGroup || activeDayGroup.sessions.length <= 1) return;
    const firstSch = activeDayGroup.sessions[0];
    setDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        const s1Key = makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, firstSch.id);
        const s1Val =
          next[s1Key] !== undefined
            ? next[s1Key]
            : getRoomDaySessionInvigilator(room, activeDayGroup.dayKey, firstSch.id, settings);
        for (const sch of activeDayGroup.sessions) {
          next[makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, sch.id)] = s1Val;
        }
      }
      return next;
    });
    setNipDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        const s1Key = makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, firstSch.id);
        const s1Nip =
          next[s1Key] !== undefined
            ? next[s1Key]
            : getRoomDaySessionInvigilatorNip(room, activeDayGroup.dayKey, firstSch.id, settings);
        for (const sch of activeDayGroup.sessions) {
          next[makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, sch.id)] = s1Nip;
        }
      }
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleCopyDayToAllDays = () => {
    if (!activeDayGroup) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        const sourceVals = activeDayGroup.sessions.map((sch) => {
          const key = makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, sch.id);
          return next[key] !== undefined
            ? next[key]
            : getRoomDaySessionInvigilator(room, activeDayGroup.dayKey, sch.id, settings);
        });

        for (const dg of dayGroups) {
          dg.sessions.forEach((targetSch, sIdx) => {
            const val = sourceVals[sIdx] !== undefined ? sourceVals[sIdx] : sourceVals[0] || '';
            next[makeRoomDaySessionKey(room.id, dg.dayKey, targetSch.id)] = val;
          });
        }
      }
      return next;
    });
    setNipDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        const sourceNips = activeDayGroup.sessions.map((sch) => {
          const key = makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, sch.id);
          return next[key] !== undefined
            ? next[key]
            : getRoomDaySessionInvigilatorNip(room, activeDayGroup.dayKey, sch.id, settings);
        });

        for (const dg of dayGroups) {
          dg.sessions.forEach((targetSch, sIdx) => {
            const val = sourceNips[sIdx] !== undefined ? sourceNips[sIdx] : sourceNips[0] || '';
            next[makeRoomDaySessionKey(room.id, dg.dayKey, targetSch.id)] = val;
          });
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
        for (const sch of activeDayGroup.sessions) {
          next[makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, sch.id)] = '';
        }
      }
      return next;
    });
    setNipDrafts((prev) => {
      const next = { ...prev };
      for (const room of rooms) {
        for (const sch of activeDayGroup.sessions) {
          next[makeRoomDaySessionKey(room.id, activeDayGroup.dayKey, sch.id)] = '';
        }
      }
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = () => {
    const cleanedSessionMap: Record<string, string> = {
      ...(settings.sessionInvigilators || {}),
    };
    const cleanedSessionNipMap: Record<string, string> = {
      ...(settings.sessionInvigilatorNips || {}),
    };
    const cleanedDailyMap: Record<string, DailyRoomInvigilatorAssignment> = {
      ...(settings.dailyInvigilators || {}),
    };

    for (const room of rooms) {
      for (const dg of dayGroups) {
        let firstVal = '';
        let firstNip = '';
        dg.sessions.forEach((sch, sIdx) => {
          const sessKey = makeRoomDaySessionKey(room.id, dg.dayKey, sch.id);
          const raw = drafts[sessKey];
          const trimmed = (raw !== undefined ? raw : '').trim();
          cleanedSessionMap[sessKey] = trimmed;

          const rawNip = nipDrafts[sessKey];
          const trimmedNip = (rawNip !== undefined ? rawNip : '').trim();
          cleanedSessionNipMap[sessKey] = trimmedNip;

          if (sIdx === 0) {
            firstVal = trimmed;
            firstNip = trimmedNip;
          }
        });
        cleanedDailyMap[makeRoomDayKey(room.id, dg.dayKey)] = {
          invigilator1: firstVal,
          invigilator1Nip: firstNip || undefined,
        };
      }
    }

    const firstDayKey = dayGroups[0]?.dayKey;
    const firstSchId = dayGroups[0]?.sessions[0]?.id;
    const updatedRooms = rooms.map((r) => {
      if (!firstDayKey || !firstSchId) return r;
      const firstSessKey = makeRoomDaySessionKey(r.id, firstDayKey, firstSchId);
      const day1Sess1 = cleanedSessionMap[firstSessKey];
      const day1Sess1Nip = cleanedSessionNipMap[firstSessKey];
      if (day1Sess1 === undefined && day1Sess1Nip === undefined) return r;
      return {
        ...r,
        invigilator1: day1Sess1 || r.invigilator1,
        invigilator1Nip: day1Sess1Nip !== undefined ? day1Sess1Nip || undefined : r.invigilator1Nip,
        invigilator2: undefined,
      };
    });

    setHasUnsavedChanges(false);
    onSave(
      cleanedDailyMap,
      cleanedSessionMap,
      updatedRooms,
      `Daftar pengawas untuk ${rooms.length} ruang × ${dayGroups.length} hari (${totalSessionsCount} sesi) berhasil disimpan!`,
      cleanedSessionNipMap
    );
  };

  const getFilledStatsForDay = (dg: (typeof dayGroups)[number]) => {
    let filled = 0;
    const total = rooms.length * Math.max(1, dg.sessions.length);
    for (const room of rooms) {
      for (const sch of dg.sessions) {
        const val = drafts[makeRoomDaySessionKey(room.id, dg.dayKey, sch.id)];
        if (val && val.trim()) filled += 1;
      }
    }
    return { filled, total };
  };

  const handleExportInvigilatorsExcel = () => {
    exportInvigilatorsMatrixExcel(rooms, schedules, settings);
    setImportStatus({
      type: 'success',
      text: `File Excel Daftar Pengawas (${rooms.length} ruang × ${totalSessionsCount} sesi ujian) berhasil diunduh. Anda dapat mengeditnya lalu mengunggah kembali via tombol Impor Excel.`,
    });
    setTimeout(() => setImportStatus(null), 5000);
  };

  const handleImportInvigilatorsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseInvigilatorsFromExcel(file, rooms, schedules, settings);
      setDrafts((prev) => ({ ...prev, ...result.sessionMap }));
      setNipDrafts((prev) => ({ ...prev, ...result.sessionNipMap }));
      setHasUnsavedChanges(false);

      const warnSuffix =
        result.unmatchedLabels.length > 0
          ? ` (${result.unmatchedLabels.length} baris dilewati: ${result.unmatchedLabels.slice(0, 3).join(', ')})`
          : '';
      const msg = `Berhasil mengimpor ${result.updatedCells} slot pengawas sesi untuk ${result.matchedRooms} ruang!${warnSuffix}`;

      onSave(
        result.dailyMap,
        result.sessionMap,
        result.updatedRooms,
        msg,
        result.sessionNipMap
      );
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
              `Atur Pengawas Ruang untuk setiap hari dan setiap sesi ujian (${dayGroups.length} hari · ${totalSessionsCount} sesi × ${rooms.length} ruang). Otomatis tersinkron ke Daftar Hadir, Jurnal Harian, Berita Acara, dan Jadwal Tugas Pengawas.`}
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
              <span>Per Hari &amp; Sesi</span>
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
              <span>Matriks Semua Sesi</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportInvigilatorsExcel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
            title="Ekspor daftar / template pengawas ruang per hari & sesi ke Excel (.xlsx)"
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
            title="Impor daftar pengawas per hari & sesi dari file Excel / CSV"
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
              Simpan Pengawas ({rooms.length}R × {totalSessionsCount}S)
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
            Ada perubahan daftar pengawas per hari &amp; sesi yang belum disimpan. Klik{' '}
            <strong>Simpan Pengawas</strong> untuk menerapkan ke seluruh dokumen.
          </span>
        </div>
      )}

      {/* VIEW MODE 1: PER HARI (DAY TABS + COLUMNS PER SESI) */}
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
                const { filled, total } = getFilledStatsForDay(dg);
                const allFilled = filled === total && total > 0;
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
                      {filled}/{total}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {activeDayGroup.sessions.length > 1 && (
                <button
                  type="button"
                  onClick={handleCopySession1ToAllSessionsActiveDay}
                  className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors"
                  title="Samakan pengawas Sesi 1 ke seluruh sesi pada hari ini"
                >
                  <Copy className="w-3 h-3" />
                  <span>Salin Sesi 1 → Semua Sesi Hari Ini</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyDayToAllDays}
                className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 rounded-md transition-colors"
                title={`Salin susunan pengawas tiap sesi di Hari ${activeDayGroup.dayNumber} ke seluruh hari ujian`}
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

          {/* Active Day Session Chips */}
          <div className="text-2xs text-slate-600 flex flex-wrap items-center gap-2 px-1">
            <span className="font-semibold text-slate-800">{activeDayGroup.label}:</span>
            {activeDayGroup.sessions.map((sch, sIdx) => (
              <span
                key={sch.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700"
              >
                <Clock className="w-3 h-3 text-slate-500" />
                <strong className="text-slate-900">{getSessionDisplayLabel(sch, sIdx)}:</strong>
                <span>{sch.subject}</span>
                <span className="font-mono text-slate-500">({sch.time})</span>
              </span>
            ))}
          </div>

          {/* Per-Room × Per-Session Inputs Table for Selected Day */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-16">Kode</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Ruang &amp; Lokasi</th>
                  {showRoomConfigColumns && (
                    <>
                      <th className="py-2.5 px-3 text-center">Kapasitas</th>
                      <th className="py-2.5 px-3 text-center">Tata Letak</th>
                    </>
                  )}
                  {activeDayGroup.sessions.map((sch, sIdx) => (
                    <th
                      key={sch.id}
                      className="py-2 px-2.5 min-w-[215px] border-l border-slate-200"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900">
                          {getSessionDisplayLabel(sch, sIdx)}
                        </span>
                        <span className="text-2xs font-mono font-normal text-slate-500">
                          {sch.time}
                        </span>
                      </div>
                      <div className="text-2xs font-semibold text-slate-600 truncate max-w-[230px]">
                        {sch.subject}
                      </div>
                    </th>
                  ))}
                  {showRoomConfigColumns && (
                    <th className="py-2.5 px-3 text-center border-l border-slate-200">
                      Status Aturan
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((room) => {
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
                      {activeDayGroup.sessions.map((sch, sIdx) => {
                        const sessKey = makeRoomDaySessionKey(
                          room.id,
                          activeDayGroup.dayKey,
                          sch.id
                        );
                        const val = drafts[sessKey] ?? '';
                        const nipVal = nipDrafts[sessKey] ?? '';
                        return (
                          <td key={sch.id} className="py-2 px-2 border-l border-slate-100">
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={val}
                                onChange={(e) =>
                                  handleFieldChange(
                                    room.id,
                                    activeDayGroup.dayKey,
                                    sch.id,
                                    e.target.value
                                  )
                                }
                                placeholder={`Pengawas ${room.code} ${getSessionDisplayLabel(sch, sIdx)}...`}
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none bg-white"
                              />
                              <input
                                type="text"
                                value={nipVal}
                                onChange={(e) =>
                                  handleNipFieldChange(
                                    room.id,
                                    activeDayGroup.dayKey,
                                    sch.id,
                                    e.target.value
                                  )
                                }
                                placeholder="NIP Pengawas (opsional)"
                                className="w-full px-2.5 py-1 text-2xs font-mono border border-slate-200 rounded focus:border-slate-900 focus:outline-none bg-slate-50/70 text-slate-700"
                              />
                            </div>
                          </td>
                        );
                      })}
                      {showRoomConfigColumns && (
                        <td className="py-2 px-3 text-center border-l border-slate-100">
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

      {/* VIEW MODE 2: MATRIKS SEMUA HARI & SESI x RUANG */}
      {viewMode === 'matrix' && (
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th
                  rowSpan={2}
                  className="py-2.5 px-3 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 min-w-[150px] align-middle"
                >
                  Ruang Ujian
                </th>
                {dayGroups.map((dg) => (
                  <th
                    key={dg.dayKey}
                    colSpan={Math.max(1, dg.sessions.length)}
                    className="py-1.5 px-2.5 border-r border-b border-slate-200 last:border-r-0 text-center bg-slate-200/70"
                  >
                    <span className="font-bold text-slate-900">
                      Hari {dg.dayNumber} — {dg.day}
                    </span>{' '}
                    <span className="text-2xs font-normal text-slate-600">({dg.date})</span>
                  </th>
                ))}
              </tr>
              <tr>
                {dayGroups.map((dg) =>
                  dg.sessions.map((sch, sIdx) => (
                    <th
                      key={`${dg.dayKey}-${sch.id}`}
                      className="py-1.5 px-2 border-r border-slate-200 last:border-r-0 min-w-[185px]"
                    >
                      <div className="flex items-center justify-between gap-1 text-slate-900 font-bold">
                        <span>{getSessionDisplayLabel(sch, sIdx)}</span>
                        <span className="text-[10px] font-mono font-normal text-slate-500">
                          {sch.time}
                        </span>
                      </div>
                      <div className="text-[10px] font-medium text-slate-600 truncate max-w-[180px]">
                        {sch.subject}
                      </div>
                    </th>
                  ))
                )}
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
                  {dayGroups.map((dg) =>
                    dg.sessions.map((sch) => {
                      const sessKey = makeRoomDaySessionKey(room.id, dg.dayKey, sch.id);
                      const val = drafts[sessKey] ?? '';
                      const nipVal = nipDrafts[sessKey] ?? '';
                      return (
                        <td
                          key={`${dg.dayKey}-${sch.id}`}
                          className="py-2 px-2 border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={val}
                              onChange={(e) =>
                                handleFieldChange(room.id, dg.dayKey, sch.id, e.target.value)
                              }
                              placeholder="Nama & gelar..."
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:border-slate-900 focus:outline-none bg-white"
                            />
                            <input
                              type="text"
                              value={nipVal}
                              onChange={(e) =>
                                handleNipFieldChange(room.id, dg.dayKey, sch.id, e.target.value)
                              }
                              placeholder="NIP Pengawas..."
                              className="w-full px-2 py-1 text-2xs font-mono border border-slate-200 rounded focus:border-slate-900 focus:outline-none bg-slate-50/70 text-slate-700"
                            />
                          </div>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-2xs text-slate-500 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>
          Tips: Gunakan tab <strong>Per Hari &amp; Sesi</strong> untuk mengatur pengawas setiap
          sesi per hari, atau tombol <strong>Salin Sesi 1 → Semua Sesi Hari Ini</strong> bila
          pengawas bertugas seharian penuh di ruang yang sama.
        </span>
      </div>
    </div>
  );
};

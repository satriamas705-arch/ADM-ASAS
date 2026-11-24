import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  Upload,
  FileJson,
  FileCode2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  X,
} from 'lucide-react';
import { ExamSettings, Room, Student, ExamScheduleItem } from '../types';
import {
  ExamBackupData,
  ParsedBackupResult,
  exportBackupJson,
  exportBackupSql,
  parseBackupFile,
} from '../utils/backupRestore';
import { loadJournalRecords, loadHandoverRecords } from '../utils/examDocuments';

interface BackupRestoreCardProps {
  settings: ExamSettings;
  rooms: Room[];
  students: Student[];
  schedules: ExamScheduleItem[];
  onRestoreBackup: (data: ExamBackupData, sourceFormat: 'json' | 'sql') => void;
  onNotify?: (message: string) => void;
  compact?: boolean;
}

export const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({
  settings,
  rooms,
  students,
  schedules,
  onRestoreBackup,
  onNotify,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    filename: string;
    parsed: ParsedBackupResult;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const journalCount = Object.keys(loadJournalRecords()).length;
  const handoverCount = Object.keys(loadHandoverRecords()).length;

  const handleDownloadJson = () => {
    try {
      const filename = exportBackupJson(settings, rooms, students, schedules);
      setErrorMessage(null);
      onNotify?.(`Backup JSON berhasil diunduh (${filename}).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membuat backup JSON.');
    }
  };

  const handleDownloadSql = () => {
    try {
      const filename = exportBackupSql(settings, rooms, students, schedules);
      setErrorMessage(null);
      onNotify?.(`Backup SQL berhasil diunduh (${filename}).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membuat backup SQL.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsReading(true);
    setErrorMessage(null);
    setPendingRestore(null);

    try {
      const parsed = await parseBackupFile(file);
      setPendingRestore({ filename: file.name, parsed });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membaca file backup.');
    } finally {
      setIsReading(false);
    }
  };

  const handleConfirmRestore = () => {
    if (!pendingRestore) return;
    const { parsed } = pendingRestore;
    onRestoreBackup(parsed.data, parsed.sourceFormat);
    setPendingRestore(null);
    setErrorMessage(null);
  };

  return (
    <div
      className={`print:hidden bg-white border border-slate-200 rounded-lg ${
        compact ? 'p-4 space-y-3' : 'p-5 space-y-4'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Backup &amp; Restore Database (JSON &amp; SQL)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cadangkan seluruh data siswa, alokasi ruang, jadwal, pengawas, kop surat, jurnal, &amp; BA dalam format <strong>.json</strong> atau dump <strong>.sql</strong>, lalu pulihkan kapan saja.
            </p>
            {!compact && (
              <div className="flex flex-wrap items-center gap-2 mt-2 text-2xs text-slate-600">
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-medium">
                  {students.length} Peserta
                </span>
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-medium">
                  {rooms.length} Ruangan
                </span>
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-medium">
                  {schedules.length} Mapel Jadwal
                </span>
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-medium">
                  {journalCount} Jurnal · {handoverCount} BA
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
            title="Unduh Backup Lengkap Format JSON (.json)"
          >
            <FileJson className="w-3.5 h-3.5 text-indigo-600" />
            <Download className="w-3 h-3 text-indigo-600" />
            <span>Backup JSON</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadSql}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
            title="Unduh Backup Lengkap Format SQL Dump (.sql)"
          >
            <FileCode2 className="w-3.5 h-3.5 text-emerald-700" />
            <Download className="w-3 h-3 text-emerald-700" />
            <span>Backup SQL</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.sql,application/json,application/sql,text/sql,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={isReading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-md shadow-sm transition-colors"
            title="Pilih file backup .json atau .sql untuk memulihkan data"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isReading ? 'Membaca File...' : 'Restore JSON / SQL'}</span>
          </button>
        </div>
      </div>

      {/* Parse / Validation Error */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 p-0.5"
            aria-label="Tutup pesan error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Confirmation Preview Before Overwriting Data */}
      {pendingRestore && (
        <div className="bg-amber-50/80 border border-amber-300 rounded-lg p-4 space-y-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">
                  Konfirmasi Restore Backup ({pendingRestore.parsed.sourceFormat.toUpperCase()})
                </p>
                <p className="text-slate-600 mt-0.5">
                  File: <span className="font-mono font-semibold">{pendingRestore.filename}</span>
                  {pendingRestore.parsed.exportedAt && (
                    <span className="ml-2 text-slate-500">
                      &middot; Dibuat:{' '}
                      {new Date(pendingRestore.parsed.exportedAt).toLocaleString('id-ID')}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingRestore(null)}
              className="text-slate-400 hover:text-slate-700 p-1"
              aria-label="Batal restore"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-white border border-amber-200 rounded-md p-2.5">
            <div>
              <span className="text-2xs text-slate-500 block">Peserta</span>
              <strong className="text-slate-900">{pendingRestore.parsed.counts.students}</strong>
            </div>
            <div>
              <span className="text-2xs text-slate-500 block">Ruangan</span>
              <strong className="text-slate-900">{pendingRestore.parsed.counts.rooms}</strong>
            </div>
            <div>
              <span className="text-2xs text-slate-500 block">Jadwal Mapel</span>
              <strong className="text-slate-900">{pendingRestore.parsed.counts.schedules}</strong>
            </div>
            <div>
              <span className="text-2xs text-slate-500 block">Jurnal Ruang</span>
              <strong className="text-slate-900">{pendingRestore.parsed.counts.journals}</strong>
            </div>
            <div>
              <span className="text-2xs text-slate-500 block">BA Serah Terima</span>
              <strong className="text-slate-900">{pendingRestore.parsed.counts.handovers}</strong>
            </div>
          </div>

          <div className="text-2xs text-slate-700 bg-white/80 border border-amber-200 rounded px-3 py-2">
            <strong>Sekolah:</strong> {pendingRestore.parsed.data.settings.schoolName || '-'} &middot;{' '}
            <strong>Kegiatan:</strong>{' '}
            {pendingRestore.parsed.data.settings.activityName ||
              pendingRestore.parsed.data.settings.examTitle ||
              '-'}{' '}
            ({pendingRestore.parsed.data.settings.academicYear || '-'})
          </div>

          {pendingRestore.parsed.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-2xs text-amber-800 space-y-0.5">
              {pendingRestore.parsed.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <p className="text-2xs text-amber-900 font-medium">
              Perhatian: Data aktif saat ini akan diganti dengan data dari file backup di atas.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-md shadow-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Pulihkan Data Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

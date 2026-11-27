import React, { useState, useRef } from 'react';
import { Save, Upload, Trash2, Palette, Check } from 'lucide-react';
import { ExamSettings, Room, Student, ExamScheduleItem } from '../types';
import { extractCityFromAddress } from '../utils/examDocuments';
import { ExamBackupData } from '../utils/backupRestore';
import { processStampFileToTransparentPng } from '../utils/imageTransparency';
import { UI_THEME_OPTIONS } from '../utils/uiThemes';
import { BackupRestoreCard } from './BackupRestoreCard';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ExamSettings;
  rooms?: Room[];
  students?: Student[];
  schedules?: ExamScheduleItem[];
  onSave: (newSettings: ExamSettings) => void;
  onRestoreBackup?: (data: ExamBackupData, sourceFormat: 'json' | 'sql') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  rooms = [],
  students = [],
  schedules = [],
  onSave,
  onRestoreBackup,
}) => {
  const [formData, setFormData] = useState<ExamSettings>({ ...settings });

  const [uploadError, setUploadError] = useState<string | null>(null);
  const headmasterSigRef = useRef<HTMLInputElement>(null);
  const committeeSigRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setFormData({ ...settings });
      setUploadError(null);
    }
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleAssetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'headmasterSignature' | 'committeeSignature' | 'schoolStamp',
    label: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(`Ukuran ${label} maksimal 2MB.`);
      return;
    }
    setUploadError(null);
    if (field === 'schoolStamp') {
      try {
        const transparentPng = await processStampFileToTransparentPng(file);
        setFormData((prev) => ({ ...prev, schoolStamp: transparentPng }));
        return;
      } catch {
        // Fall back to direct Data URL read below if canvas decode fails
      }
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) {
        setFormData((prev) => ({ ...prev, [field]: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pengaturan Profil Sekolah & Ujian
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Data ini akan dicetak pada kop surat Excel, lembar PDF, berita acara, dan kartu ujian
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-base font-bold p-1"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nama Resmi Sekolah / Lembaga
            </label>
            <input
              type="text"
              required
              value={formData.schoolName}
              onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Alamat Lengkap Sekolah
            </label>
            <input
              type="text"
              required
              value={formData.schoolAddress}
              onChange={(e) => setFormData({ ...formData, schoolAddress: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nama Kegiatan Ujian / Asesmen *
              </label>
              <input
                type="text"
                required
                value={formData.activityName || formData.examTitle}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    activityName: e.target.value,
                    examTitle: e.target.value,
                  })
                }
                placeholder="Contoh: Penilaian Akhir Semester (PAS) Ganjil"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tahun Ajaran (TA) *
              </label>
              <input
                type="text"
                required
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                placeholder="Contoh: 2026/2027"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Pelaksanaan
              </label>
              <input
                type="text"
                required
                value={formData.examDate}
                onChange={(e) => setFormData({ ...formData, examDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sesi Ujian / Waktu
              </label>
              <input
                type="text"
                required
                value={formData.examSession}
                onChange={(e) => setFormData({ ...formData, examSession: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <span className="font-bold text-slate-800 text-xs block mb-2">
              Penandatangan Dokumen & Berita Acara
            </span>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={formData.headmaster}
                  onChange={(e) => setFormData({ ...formData, headmaster: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  NIP Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={formData.headmasterNip}
                  onChange={(e) => setFormData({ ...formData, headmasterNip: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ketua Panitia Ujian
                </label>
                <input
                  type="text"
                  value={formData.committeeHead}
                  onChange={(e) => setFormData({ ...formData, committeeHead: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  NIP Ketua Panitia
                </label>
                <input
                  type="text"
                  value={formData.committeeNip}
                  onChange={(e) => setFormData({ ...formData, committeeNip: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tempat / Kota Penandatanganan
                </label>
                <input
                  type="text"
                  value={formData.signatureCity ?? ''}
                  onChange={(e) => setFormData({ ...formData, signatureCity: e.target.value })}
                  placeholder={`Otomatis: ${extractCityFromAddress(formData.schoolAddress)}`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tanggal Penandatanganan
                </label>
                <input
                  type="text"
                  value={formData.signatureDate ?? ''}
                  onChange={(e) => setFormData({ ...formData, signatureDate: e.target.value })}
                  placeholder="Contoh: 20 Oktober 2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Compact TTD & Stempel Sekolah Uploads */}
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  TTD Pejabat &amp; Stempel Sekolah (PNG/JPG maks. 2MB)
                </span>
                {uploadError && (
                  <span className="text-2xs text-rose-600 font-medium">{uploadError}</span>
                )}
              </div>

              <input
                type="file"
                ref={headmasterSigRef}
                onChange={(e) =>
                  handleAssetUpload(e, 'headmasterSignature', 'TTD Kepala Sekolah')
                }
                accept="image/png,image/jpeg,image/webp,image/*"
                className="hidden"
              />
              <input
                type="file"
                ref={committeeSigRef}
                onChange={(e) =>
                  handleAssetUpload(e, 'committeeSignature', 'TTD Ketua Panitia')
                }
                accept="image/png,image/jpeg,image/webp,image/*"
                className="hidden"
              />
              <input
                type="file"
                ref={stampRef}
                onChange={(e) => handleAssetUpload(e, 'schoolStamp', 'Stempel Sekolah')}
                accept="image/png,image/jpeg,image/webp,image/*"
                className="hidden"
              />

              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    field: 'headmasterSignature' as const,
                    label: 'TTD Kepsek',
                    ref: headmasterSigRef,
                  },
                  {
                    field: 'committeeSignature' as const,
                    label: 'TTD Ketua Panitia',
                    ref: committeeSigRef,
                  },
                  {
                    field: 'schoolStamp' as const,
                    label: 'Stempel Sekolah',
                    ref: stampRef,
                  },
                ].map((item) => {
                  const val = formData[item.field];
                  return (
                    <div
                      key={item.field}
                      className="border border-slate-200 rounded-md p-2 bg-slate-50 flex flex-col gap-1.5"
                    >
                      <span className="text-2xs font-bold text-slate-700 truncate">
                        {item.label}
                      </span>
                      <div className="h-12 bg-white border border-dashed border-slate-300 rounded flex items-center justify-center p-1 overflow-hidden">
                        {val ? (
                          <img
                            src={val}
                            alt={item.label}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-3xs text-slate-400">Kosong</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => item.ref.current?.click()}
                          className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 text-3xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800"
                        >
                          <Upload className="w-2.5 h-2.5" />
                          <span>{val ? 'Ganti' : 'Unggah'}</span>
                        </button>
                        {val && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, [item.field]: undefined }))
                            }
                            className="p-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded"
                            title={`Hapus ${item.label}`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Tema Warna Antarmuka Dinamis */}
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Palette className="w-3.5 h-3.5 theme-accent-icon" />
                <span>Tema Warna Antarmuka Dinamis</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {UI_THEME_OPTIONS.map((option) => {
                  const selected = (formData.uiTheme || 'dynamic-auto') === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, uiTheme: option.id })}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${
                        selected
                          ? 'theme-card-active'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                        style={{
                          background: option.isDynamic
                            ? 'linear-gradient(135deg, #2563EB 0%, #0D9488 50%, #D97706 100%)'
                            : `linear-gradient(135deg, ${option.swatchHex}, ${option.secondaryHex})`,
                        }}
                      />
                      <span className="text-2xs font-bold text-slate-800 truncate flex-1">
                        {option.label}
                      </span>
                      {selected && <Check className="w-3 h-3 theme-accent-icon shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold theme-btn-primary rounded-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </form>

        {onRestoreBackup && (
          <div className="pt-2 border-t border-slate-200">
            <BackupRestoreCard
              compact
              settings={formData}
              rooms={rooms}
              students={students}
              schedules={schedules}
              onRestoreBackup={onRestoreBackup}
            />
          </div>
        )}
      </div>
    </div>
  );
};

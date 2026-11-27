import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FolderOpen,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  LogOut,
  Users,
  Sparkles,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ExamSettings, Student } from '../types';
import { getOrderedClassNames } from '../utils/examDocuments';
import {
  initDriveAuth,
  signInWithGoogleDrive,
  logoutGoogleDrive,
  getDriveAccessToken,
  getCurrentDriveUser,
  extractDriveFolderId,
  listImageFilesInDriveFolder,
  downloadDriveImageAsDataUrl,
  matchDriveFilesToClassStudents,
  DrivePhotoMatchItem,
} from '../utils/googleDrivePhotos';

interface StudentDrivePhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  settings: ExamSettings;
  onUpdateSettings: (newSettings: ExamSettings) => void;
  onApplyStudentPhotos: (
    updates: { studentId: string; photoUrl: string; fileId: string; fileName: string }[],
    classLabel: string
  ) => void;
  onClearClassPhotos: (className: string) => void;
}

export const StudentDrivePhotoModal: React.FC<StudentDrivePhotoModalProps> = ({
  isOpen,
  onClose,
  students,
  settings,
  onUpdateSettings,
  onApplyStudentPhotos,
  onClearClassPhotos,
}) => {
  const [driveUser, setDriveUser] = useState<User | null>(() => getCurrentDriveUser());
  const [accessToken, setAccessToken] = useState<string | null>(() => getDriveAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>(
    () => settings.classDrivePhotoLinks || {}
  );
  const [loadingClass, setLoadingClass] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review state after fetching a single class folder
  const [reviewClass, setReviewClass] = useState<string | null>(null);
  const [matchItems, setMatchItems] = useState<DrivePhotoMatchItem[]>([]);

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setAccessToken(token);
      },
      () => {
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLinkDrafts(settings.classDrivePhotoLinks || {});
      setAccessToken(getDriveAccessToken());
      setDriveUser(getCurrentDriveUser());
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, settings.classDrivePhotoLinks]);

  const classList = useMemo(
    () => getOrderedClassNames(students, settings.customClassOrder),
    [students, settings.customClassOrder]
  );

  if (!isOpen) return null;

  const persistClassLinks = (nextLinks: Record<string, string>) => {
    onUpdateSettings({
      ...settings,
      classDrivePhotoLinks: nextLinks,
    });
  };

  const handleLinkChange = (className: string, url: string) => {
    const updated = { ...linkDrafts, [className]: url };
    setLinkDrafts(updated);
    persistClassLinks(updated);
  };

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMessage(null);
    try {
      const result = await signInWithGoogleDrive();
      setDriveUser(result.user);
      setAccessToken(result.accessToken);
      setSuccessMessage(
        `Terhubung ke Google Drive sebagai ${result.user.email || result.user.displayName || 'Akun Google'}.`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menghubungkan akun Google Drive.';
      setErrorMessage(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogleDrive();
    setDriveUser(null);
    setAccessToken(null);
    setReviewClass(null);
    setMatchItems([]);
  };

  const ensureDriveToken = async (): Promise<string> => {
    const existing = accessToken || getDriveAccessToken();
    if (existing) return existing;
    const res = await signInWithGoogleDrive();
    setDriveUser(res.user);
    setAccessToken(res.accessToken);
    return res.accessToken;
  };

  const downloadFolderWithProgress = async (
    folderId: string,
    token: string,
    classLabel: string
  ) => {
    setProgressText(`Membaca daftar foto folder "${classLabel}"...`);
    const files = await listImageFilesInDriveFolder(folderId, token);
    if (files.length === 0) {
      throw new Error(
        `Tidak ditemukan file gambar (JPG/PNG) di dalam folder Google Drive untuk kelas ${classLabel}. Pastikan link mengarah ke folder yang berisi file foto.`
      );
    }

    const downloaded: { file: (typeof files)[number]; dataUrl: string }[] = [];
    const batchSize = 5;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      setProgressText(
        `Mengunduh & mengoptimalkan pas foto ${classLabel}: ${Math.min(
          i + batch.length,
          files.length
        )} / ${files.length}...`
      );
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const dataUrl = await downloadDriveImageAsDataUrl(file.id, token);
          return { file, dataUrl };
        })
      );
      downloaded.push(...batchResults);
    }
    return downloaded;
  };

  const handleFetchClassFolder = async (className: string) => {
    const rawUrl = (linkDrafts[className] || '').trim();
    const folderId = extractDriveFolderId(rawUrl);
    if (!folderId) {
      setErrorMessage(
        `Link folder Google Drive untuk kelas "${className}" belum valid. Contoh format: https://drive.google.com/drive/folders/1AbCdEf...`
      );
      return;
    }

    setLoadingClass(className);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = await ensureDriveToken();
      const downloaded = await downloadFolderWithProgress(folderId, token, className);
      const classStudents = students.filter((s) => s.className === className);
      const matches = matchDriveFilesToClassStudents(classStudents, downloaded);

      setReviewClass(className);
      setMatchItems(matches);
      const autoMatchedCount = matches.filter((m) => m.matchedStudentId).length;
      setSuccessMessage(
        `Berhasil memuat ${matches.length} foto dari Google Drive untuk kelas ${className} (${autoMatchedCount} otomatis cocok dengan siswa). Periksa daftar di bawah lalu klik "Terapkan Foto".`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Gagal mengambil foto dari Google Drive.';
      setErrorMessage(msg);
    } finally {
      setLoadingClass(null);
      setProgressText('');
    }
  };

  const handleSyncAllSavedClasses = async () => {
    const classesWithLinks = classList.filter((cls) =>
      Boolean(extractDriveFolderId(linkDrafts[cls] || ''))
    );
    if (classesWithLinks.length === 0) {
      setErrorMessage('Belum ada kelas yang memiliki link folder Google Drive valid.');
      return;
    }

    setLoadingClass('__ALL__');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = await ensureDriveToken();
      const allUpdates: {
        studentId: string;
        photoUrl: string;
        fileId: string;
        fileName: string;
      }[] = [];

      for (const cls of classesWithLinks) {
        const folderId = extractDriveFolderId(linkDrafts[cls] || '');
        if (!folderId) continue;
        const downloaded = await downloadFolderWithProgress(folderId, token, cls);
        const classStudents = students.filter((s) => s.className === cls);
        const matches = matchDriveFilesToClassStudents(classStudents, downloaded);
        for (const item of matches) {
          if (item.selected && item.matchedStudentId) {
            allUpdates.push({
              studentId: item.matchedStudentId,
              photoUrl: item.dataUrl,
              fileId: item.file.id,
              fileName: item.file.name,
            });
          }
        }
      }

      if (allUpdates.length === 0) {
        setErrorMessage(
          'Foto ditemukan, namun belum ada nama file yang cocok dengan NIS/NISN/Nama siswa. Gunakan tombol "Ambil Foto" per kelas untuk mencocokkan secara manual.'
        );
      } else {
        onApplyStudentPhotos(allUpdates, `${classesWithLinks.length} kelas`);
        setSuccessMessage(
          `Sinkronisasi massal selesai! ${allUpdates.length} foto siswa dari ${classesWithLinks.length} kelas berhasil diterapkan.`
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menyinkronkan foto dari Google Drive.';
      setErrorMessage(msg);
    } finally {
      setLoadingClass(null);
      setProgressText('');
    }
  };

  const handleToggleItem = (index: number) => {
    setMatchItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleChangeMatchedStudent = (index: number, studentId: string) => {
    setMatchItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              matchedStudentId: studentId || null,
              selected: Boolean(studentId),
              matchReason: studentId ? 'name' : 'unmatched',
            }
          : item
      )
    );
  };

  const handleApplyReviewedPhotos = () => {
    if (!reviewClass) return;
    const validUpdates = matchItems
      .filter((item) => item.selected && item.matchedStudentId)
      .map((item) => ({
        studentId: item.matchedStudentId as string,
        photoUrl: item.dataUrl,
        fileId: item.file.id,
        fileName: item.file.name,
      }));

    if (validUpdates.length === 0) {
      setErrorMessage('Pilih minimal satu foto yang sudah dipasangkan ke siswa.');
      return;
    }

    onApplyStudentPhotos(validUpdates, reviewClass);
    setSuccessMessage(
      `${validUpdates.length} pas foto berhasil disimpan ke siswa kelas ${reviewClass}!`
    );
    setReviewClass(null);
    setMatchItems([]);
  };

  const reviewClassStudents = reviewClass
    ? students.filter((s) => s.className === reviewClass)
    : [];
  const otherStudents = reviewClass
    ? students.filter((s) => s.className !== reviewClass)
    : [];

  const linkedClassesCount = classList.filter((cls) =>
    Boolean(extractDriveFolderId(linkDrafts[cls] || ''))
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/70">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-600" />
              <span>Ambil Foto Siswa dari Link Google Drive Per Kelas</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Tempel link folder Google Drive tiap kelas. Penamaan file foto (<strong>NIS.jpg</strong>,{' '}
              <strong>NISN.png</strong>, atau <strong>Nama Siswa.jpg</strong>) akan dicocokkan otomatis ke kartu ujian.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-200/60"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Google Drive Connection Card */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-900 block">
                Koneksi Akun Google Drive
              </span>
              {accessToken && driveUser ? (
                <p className="text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Terhubung sebagai <strong>{driveUser.email || driveUser.displayName}</strong>
                  </span>
                </p>
              ) : (
                <p className="text-xs text-slate-600">
                  Masuk dengan akun Google yang memiliki akses baca ke folder foto siswa di Google Drive.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {accessToken ? (
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Putuskan Akun</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoggingIn}
                  className="inline-flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-md shadow-2xs text-xs font-semibold text-slate-800 transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                  <span>{isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Alerts / Progress */}
          {loadingClass && progressText && (
            <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg p-3 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
              <span className="font-medium">{progressText}</span>
            </div>
          )}

          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-lg p-3 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-700 font-bold"
              >
                &times;
              </button>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-emerald-700 font-bold"
              >
                &times;
              </button>
            </div>
          )}

          {/* Review & Remap UI after loading a specific class folder */}
          {reviewClass && matchItems.length > 0 && (
            <div className="border-2 border-indigo-300 rounded-lg overflow-hidden bg-white shadow-sm">
              <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>
                      Pratinjau &amp; Pencocokan Foto Kelas {reviewClass} ({matchItems.length} file)
                    </span>
                  </h3>
                  <p className="text-2xs text-indigo-700 mt-0.5">
                    Pastikan pasangan file foto dan siswa sudah tepat, lalu klik &quot;Terapkan Foto ke Siswa&quot;.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewClass(null);
                      setMatchItems([]);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md"
                  >
                    Tutup Pratinjau
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyReviewedPhotos}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-xs"
                  >
                    Terapkan Foto ke Siswa (
                    {matchItems.filter((m) => m.selected && m.matchedStudentId).length})
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {matchItems.map((item, idx) => (
                  <div
                    key={item.file.id}
                    className={`px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-3 ${
                      item.selected && item.matchedStudentId ? 'bg-white' : 'bg-slate-50/70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => handleToggleItem(idx)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="w-10 h-13 rounded border border-slate-300 overflow-hidden bg-slate-100 shrink-0">
                      <img
                        src={item.dataUrl}
                        alt={item.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-semibold text-slate-900 truncate">
                        {item.file.name}
                      </p>
                      <span
                        className={`inline-block mt-0.5 text-3xs font-semibold px-1.5 py-0.5 rounded ${
                          item.matchReason === 'unmatched'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.matchReason === 'nis' && 'Cocok via NIS'}
                        {item.matchReason === 'nisn' && 'Cocok via NISN'}
                        {item.matchReason === 'name' && 'Cocok via Nama'}
                        {item.matchReason === 'order' && 'Cocok via Nomor Urut'}
                        {item.matchReason === 'unmatched' && 'Pilih siswa manual'}
                      </span>
                    </div>
                    <div className="w-full sm:w-64 shrink-0">
                      <select
                        value={item.matchedStudentId || ''}
                        onChange={(e) => handleChangeMatchedStudent(idx, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">-- Lewati / Tidak Dipasangkan --</option>
                        <optgroup label={`Siswa Kelas ${reviewClass}`}>
                          {reviewClassStudents.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.nis} - {st.name}
                            </option>
                          ))}
                        </optgroup>
                        {otherStudents.length > 0 && (
                          <optgroup label="Kelas Lainnya">
                            {otherStudents.map((st) => (
                              <option key={st.id} value={st.id}>
                                [{st.className}] {st.nis} - {st.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Class List & Per-Class Google Drive Links */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-600" />
                <span>Daftar Link Folder Google Drive Per Kelas ({classList.length} Kelas)</span>
              </h3>

              {linkedClassesCount > 0 && (
                <button
                  type="button"
                  onClick={handleSyncAllSavedClasses}
                  disabled={Boolean(loadingClass)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold theme-btn-primary disabled:opacity-50 rounded-md transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loadingClass === '__ALL__' ? 'animate-spin' : ''}`}
                  />
                  <span>Sinkron Otomatis Semua Kelas ({linkedClassesCount})</span>
                </button>
              )}
            </div>

            {classList.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-500">
                Belum ada data siswa. Silakan tambahkan atau impor siswa terlebih dahulu.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                {classList.map((cls) => {
                  const clsStudents = students.filter((s) => s.className === cls);
                  const photoCount = clsStudents.filter((s) => Boolean(s.photoUrl)).length;
                  const linkVal = linkDrafts[cls] || '';
                  const hasValidFolder = Boolean(extractDriveFolderId(linkVal));
                  const isBusy = loadingClass === cls;

                  return (
                    <div
                      key={cls}
                      className="p-3.5 bg-white hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center gap-3"
                    >
                      <div className="md:w-44 shrink-0">
                        <div className="font-bold text-slate-900">{cls}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-2xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                              photoCount === clsStudents.length && photoCount > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : photoCount > 0
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {photoCount} / {clsStudents.length} Foto
                          </span>
                          {photoCount > 0 && (
                            <button
                              type="button"
                              onClick={() => onClearClassPhotos(cls)}
                              className="text-2xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-0.5"
                              title={`Hapus seluruh foto siswa kelas ${cls}`}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Reset</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1">
                          <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="url"
                            value={linkVal}
                            onChange={(e) => handleLinkChange(cls, e.target.value)}
                            placeholder={`Tempel link folder Google Drive kelas ${cls}...`}
                            className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:border-slate-900 focus:outline-none font-mono"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleFetchClassFolder(cls)}
                          disabled={!hasValidFolder || Boolean(loadingClass)}
                          className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 rounded-md transition-colors shrink-0"
                        >
                          {isBusy ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Memuat...</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>Ambil Foto</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Total foto terpasang:{' '}
            <strong className="text-slate-900 font-mono">
              {students.filter((s) => Boolean(s.photoUrl)).length}
            </strong>{' '}
            dari <strong className="text-slate-900 font-mono">{students.length}</strong> siswa
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold theme-btn-primary rounded-md transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

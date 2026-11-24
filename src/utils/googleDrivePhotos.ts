import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Student } from '../types';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));

// In-memory access token cache ONLY (never persisted to localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

export const signInWithGoogleDrive = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Gagal mendapatkan akses Google Drive. Silakan ulangi masuk dengan akun Google Anda.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = (): string | null => cachedAccessToken;

export const getCurrentDriveUser = (): User | null => auth.currentUser;

export const logoutGoogleDrive = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};

// ============================================================
// GOOGLE DRIVE LINK PARSING & API HELPERS
// ============================================================

export function extractDriveFolderId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  // Match /folders/<ID>
  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (foldersMatch) return foldersMatch[1];

  // Match folderview?id=<ID> or ?id=<ID>
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch) return idParamMatch[1];

  // Raw Drive folder ID
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed) && !trimmed.includes('http')) {
    return trimmed;
  }

  return null;
}

export function extractDriveFileId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  // Match /file/d/<ID>
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch) return fileMatch[1];

  // Match ?id=<ID> (not /folders/)
  if (!trimmed.includes('/folders/')) {
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (idParamMatch) return idParamMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed) && !trimmed.includes('http')) {
    return trimmed;
  }

  return null;
}

export interface DriveImageFile {
  id: string;
  name: string;
  mimeType: string;
}

export async function listImageFilesInDriveFolder(
  folderId: string,
  accessToken: string
): Promise<DriveImageFile[]> {
  const allFiles: DriveImageFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: 'nextPageToken,files(id,name,mimeType)',
      pageSize: '200',
      orderBy: 'name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Sesi Google Drive telah berakhir. Silakan hubungkan kembali akun Google Anda.');
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const apiMsg =
        (errBody as { error?: { message?: string } })?.error?.message ||
        `HTTP ${res.status}`;
      throw new Error(`Gagal mengakses folder Google Drive: ${apiMsg}`);
    }

    const data = (await res.json()) as {
      nextPageToken?: string;
      files?: DriveImageFile[];
    };
    if (Array.isArray(data.files)) {
      allFiles.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Resizes/crops an image blob or file cleanly into a 2x3 portrait pas-foto Data URL (180x236px JPEG)
 * so student photos render crisply on HTML & PDF Exam Cards without bloating localStorage.
 */
export async function resizeImageBlobToPassportDataUrl(blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
      image.src = objectUrl;
    });

    // Target 180 x 236 (matches 17.5mm x 23mm 2x3 frame on Exam Card PDF cleanly)
    const targetW = 180;
    const targetH = 236;
    const targetRatio = targetW / targetH;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    if (!srcW || !srcH) {
      throw new Error('Dimensi gambar tidak valid.');
    }

    const srcRatio = srcW / srcH;
    let cropX = 0;
    let cropY = 0;
    let cropW = srcW;
    let cropH = srcH;

    if (srcRatio > targetRatio) {
      // Source is wider than 2:3 -> crop horizontally centered
      cropW = srcH * targetRatio;
      cropX = (srcW - cropW) / 2;
    } else if (srcRatio < targetRatio) {
      // Source is taller than 2:3 -> crop vertically with slight top bias so faces/heads stay intact
      cropH = srcW / targetRatio;
      cropY = Math.max(0, (srcH - cropH) * 0.25);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas tidak didukung browser.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadDriveImageAsDataUrl(
  fileId: string,
  accessToken: string
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?alt=media&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Sesi Google Drive telah berakhir. Silakan login ulang.');
  }
  if (!res.ok) {
    throw new Error(`Gagal mengunduh foto (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  return resizeImageBlobToPassportDataUrl(blob);
}

// ============================================================
// SMART FILENAME -> STUDENT MATCHING PER CLASS
// ============================================================

export interface DrivePhotoMatchItem {
  file: DriveImageFile;
  dataUrl: string;
  matchedStudentId: string | null;
  matchReason: 'nis' | 'nisn' | 'name' | 'order' | 'unmatched';
  selected: boolean;
}

function normalizeMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '') // remove extension
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchDriveFilesToClassStudents(
  classStudents: Student[],
  downloadedFiles: { file: DriveImageFile; dataUrl: string }[]
): DrivePhotoMatchItem[] {
  const usedStudentIds = new Set<string>();

  const results: DrivePhotoMatchItem[] = downloadedFiles.map(({ file, dataUrl }) => {
    const baseRaw = file.name.replace(/\.[^.]+$/, '');
    const normFile = normalizeMatchText(file.name);
    const digitsTokens: string[] = baseRaw.match(/\d{3,}/g) ?? [];

    // 1. Match by NIS (exact or token inside filename)
    const nisMatch = classStudents.find((st) => {
      if (usedStudentIds.has(st.id)) return false;
      const nisClean = st.nis.trim();
      if (!nisClean) return false;
      return (
        normFile === nisClean.toLowerCase() ||
        digitsTokens.includes(nisClean) ||
        normFile.split(' ').includes(nisClean.toLowerCase())
      );
    });
    if (nisMatch) {
      usedStudentIds.add(nisMatch.id);
      return {
        file,
        dataUrl,
        matchedStudentId: nisMatch.id,
        matchReason: 'nis',
        selected: true,
      };
    }

    // 2. Match by NISN
    const nisnMatch = classStudents.find((st) => {
      if (usedStudentIds.has(st.id) || !st.nisn) return false;
      const nisnClean = st.nisn.trim();
      if (!nisnClean) return false;
      return (
        normFile === nisnClean.toLowerCase() ||
        digitsTokens.includes(nisnClean) ||
        normFile.split(' ').includes(nisnClean.toLowerCase())
      );
    });
    if (nisnMatch) {
      usedStudentIds.add(nisnMatch.id);
      return {
        file,
        dataUrl,
        matchedStudentId: nisnMatch.id,
        matchReason: 'nisn',
        selected: true,
      };
    }

    // 3. Match by Full Name (exact normalized or substring)
    const exactNameMatch = classStudents.find((st) => {
      if (usedStudentIds.has(st.id)) return false;
      const stNorm = normalizeMatchText(st.name);
      return (
        stNorm.length >= 3 &&
        (normFile === stNorm || normFile.includes(stNorm) || stNorm.includes(normFile))
      );
    });
    if (exactNameMatch) {
      usedStudentIds.add(exactNameMatch.id);
      return {
        file,
        dataUrl,
        matchedStudentId: exactNameMatch.id,
        matchReason: 'name',
        selected: true,
      };
    }

    // 4. Match by 2+ matching name words
    const fileWords = new Set(normFile.split(' ').filter((w) => w.length >= 2));
    let bestStudent: Student | null = null;
    let bestScore = 0;
    for (const st of classStudents) {
      if (usedStudentIds.has(st.id)) continue;
      const nameWords = normalizeMatchText(st.name)
        .split(' ')
        .filter((w) => w.length >= 2);
      const overlap = nameWords.filter((w) => fileWords.has(w)).length;
      if (overlap >= 2 && overlap > bestScore) {
        bestScore = overlap;
        bestStudent = st;
      }
    }
    if (bestStudent) {
      usedStudentIds.add(bestStudent.id);
      return {
        file,
        dataUrl,
        matchedStudentId: bestStudent.id,
        matchReason: 'name',
        selected: true,
      };
    }

    return {
      file,
      dataUrl,
      matchedStudentId: null,
      matchReason: 'unmatched',
      selected: false,
    };
  });

  // 5. Optional numbered index match (e.g., "01.jpg", "1.png") for still-unmatched items
  results.forEach((item) => {
    if (item.matchedStudentId) return;
    const numOnly = item.file.name.replace(/\.[^.]+$/, '').trim().match(/^0*(\d{1,2})$/);
    if (numOnly) {
      const idx = Number(numOnly[1]) - 1;
      const candidate = classStudents[idx];
      if (candidate && !usedStudentIds.has(candidate.id)) {
        usedStudentIds.add(candidate.id);
        item.matchedStudentId = candidate.id;
        item.matchReason = 'order';
        item.selected = true;
      }
    }
  });

  return results;
}

/**
 * Converts white / light paper backgrounds in stamp images (JPG/PNG/WebP) into
 * true alpha-transparent PNG Data URLs so underlying signatures remain clearly visible
 * in both HTML previews and PDF exports.
 */

const MAX_STAMP_DIMENSION = 480;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar stempel.'));
    img.src = src;
  });
}

function isOpaqueWhitePixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 180) return false;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;
  return minC >= 218 && chroma < 32;
}

export async function ensureTransparentStampDataUrl(sourceDataUrl: string): Promise<string> {
  if (!sourceDataUrl) return sourceDataUrl;

  const img = await loadImageElement(sourceDataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return sourceDataUrl;

  const scale = Math.min(1, MAX_STAMP_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceDataUrl;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Quick check: if PNG already has virtually no opaque white background pixels, keep as-is
  let opaqueWhiteCount = 0;
  const totalPixels = width * height;
  for (let i = 0; i < data.length; i += 4) {
    if (isOpaqueWhitePixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      opaqueWhiteCount++;
    }
  }

  const isDataPng = sourceDataUrl.slice(0, 32).toLowerCase().startsWith('data:image/png');
  if (isDataPng && opaqueWhiteCount <= Math.max(4, totalPixels * 0.002)) {
    return sourceDataUrl;
  }

  // Convert white and light neutral paper pixels to alpha = 0 with smooth anti-aliased edge feathering
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 10) {
      data[i + 3] = 0;
      continue;
    }

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (minC >= 218 && chroma < 32) {
      // Clear white / light-gray paper background (both outside and inside circular stamp)
      data[i + 3] = 0;
    } else if (lum >= 188 && chroma < 34) {
      // Smooth edge feathering between ink and paper
      const t = Math.min(1, Math.max(0, (220 - lum) / 32));
      data[i + 3] = Math.round(a * Math.pow(t, 1.35));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function processStampFileToTransparentPng(file: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await ensureTransparentStampDataUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

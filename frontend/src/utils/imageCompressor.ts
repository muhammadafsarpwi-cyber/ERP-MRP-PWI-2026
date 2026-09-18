/**
 * Client-side high-performance image compressor.
 * 
 * Automatically downscales oversized mobile/desktop camera photos (e.g. 12MP-48MP,
 * 8-30 MB) down to optimal web resolution (max 1920px) and converts to crisp JPEG (~300-800 KB).
 * 
 * Benefits:
 * - Eliminates "Network error" / 413 Payload Too Large on mobile networks and cloud proxies (Render/Cloudflare)
 * - Allows mobile camera photos without hitting the 5 MB limit
 * - Uploads in milliseconds instead of seconds
 * - Preserves crystal-clear readability of gate pass text, delivery notes, and material tags
 */

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
}

export async function compressImageFile(file: File, options?: CompressOptions): Promise<File> {
  // If not an image, return original untouched
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    return file;
  }

  const maxDim = options?.maxDimension || 1920;
  const quality = options?.quality || 0.82;

  return new Promise((resolve) => {
    // If browser doesn't support canvas or Image, resolve original
    if (typeof window === 'undefined' || !window.createImageBitmap && !window.FileReader) {
      return resolve(file);
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;

        // If image is already smaller than max dimension and size is reasonable (< 2MB), keep original
        if (width <= maxDim && height <= maxDim && file.size <= 2 * 1024 * 1024 && file.type === 'image/jpeg') {
          return resolve(file);
        }

        // Calculate aspect ratio scale
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file);
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }

            // Create new File with .jpg extension
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const compressedName = `${baseName}.jpg`;
            const compressedFile = new File([blob], compressedName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            // If compressed is smaller or original was unsupported format, use compressed
            if (compressedFile.size < file.size || !file.type.startsWith('image/')) {
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality,
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

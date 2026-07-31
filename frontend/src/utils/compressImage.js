// Downscales + re-encodes an image client-side before it's uploaded, so a
// multi-MB phone photo doesn't eat into Cloudinary storage/bandwidth or blow
// past the backend's upload size limit. Small files pass through untouched;
// if canvas re-encoding somehow makes it BIGGER, the original is kept.
export function compressImageFile(file, { maxDim = 1600, quality = 0.82, thresholdBytes = 1.5 * 1024 * 1024 } = {}) {
  if (!file.type.startsWith('image/') || file.size <= thresholdBytes) return Promise.resolve(file);
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

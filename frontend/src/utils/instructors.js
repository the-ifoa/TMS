import kennethKronborgSig from '../assets/signatures/kenneth_kronborg.png';
import vincentIncammiciaSig from '../assets/signatures/vincent_incammicia.png';

// IFOA instructors offered in the attendance record's "Instructor name" list.
// `signature` is a bundled image; instructors without one get theirs uploaded
// on the sheet (details.instructor_signature).
export const INSTRUCTORS = [
  { name: 'Kenneth Kronborg',   signature: kennethKronborgSig },
  { name: 'Vincent Incammicia', signature: vincentIncammiciaSig },
  { name: 'Richard Yeates',     signature: null },
  { name: 'Sanne Martini',      signature: null },
  { name: 'Joseph Cavanagh',    signature: null },
];

const key = (name) => String(name || '').trim().toLowerCase();

export const findInstructor = (name) => INSTRUCTORS.find((i) => key(i.name) === key(name)) || null;

// Signature to print: an uploaded one wins, else the instructor's bundled one.
export function signatureFor(details) {
  if (details?.instructor_signature) return details.instructor_signature;
  return findInstructor(details?.instructor_name)?.signature || null;
}

// Uploaded signature → small PNG data URL: scaled to fit 900×300 and with the
// paper background made transparent so it sits cleanly on the record.
export function signatureFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      reject(new Error('Use a PNG or JPG image of the signature.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 900 / img.width, 300 / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
        if (lum > 225) px[i + 3] = 0;
        else if (lum > 170) px[i + 3] = Math.min(px[i + 3], Math.round((255 * (225 - lum)) / 55));
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

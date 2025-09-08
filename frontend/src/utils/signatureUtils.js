import { api } from '../services/apiUtils';

export const savedSignatureImageUrl = (id) => `${(api?.defaults?.baseURL || '').replace(/\/$/, '')}/api/signature/saved-signatures/${id}/image/`;

export const blobToPngDataURL = async (blob) => {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    const url = URL.createObjectURL(blob);
    const dataUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
        URL.revokeObjectURL(url);
      };
      img.onerror = reject;
      img.src = url;
    });
    return dataUrl;
  }
};

export const fileToPngDataURL = async (file) => {
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    return dataUrl;
  }
};

export const fetchSavedSignatureAsDataURL = async (sig) => {
  if (sig?.data_url) return sig.data_url;
  const res = await fetch(savedSignatureImageUrl(sig.id), { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return blobToPngDataURL(await res.blob());
};

export default {
  fileToPngDataURL,
  blobToPngDataURL,
  savedSignatureImageUrl,
  fetchSavedSignatureAsDataURL,
};

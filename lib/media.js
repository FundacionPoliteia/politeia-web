export const IMAGE_UPLOAD_TYPES = Object.freeze([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_TYPES.join(',');
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_UPLOAD_HELP = 'Formatos admitidos: JPEG, PNG, WebP, AVIF y GIF. Tamaño máximo: 5 MB.';

export function validateImageUploadFile(file) {
  if (!file) return;
  const type = String(file.type || '').toLowerCase();
  if (type && !IMAGE_UPLOAD_TYPES.includes(type)) {
    throw new Error('Usa una imagen JPEG, PNG, WebP, AVIF o GIF.');
  }
  if (!file.size) {
    throw new Error('La imagen esta vacia o no se pudo leer.');
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error('La imagen supera el limite de 5 MB.');
  }
}

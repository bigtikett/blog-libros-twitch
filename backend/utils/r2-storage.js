import crypto from 'crypto';
import path from 'path';

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function buildStorageKey(originalName, prefix = 'uploads') {
  const parsed = path.parse(String(originalName || 'image.jpg'));
  const extension = (parsed.ext || '.jpg').toLowerCase() || '.jpg';
  const rawName = (parsed.name || 'image')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
  const name = rawName || 'image';
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString('hex');
  const key = `${prefix}/${timestamp}-${random}-${name}${extension}`;
  return key.startsWith(`${prefix}/`) ? key : `${prefix}/${key}`;
}

export function buildStoragePublicUrl(baseUrl, objectKey) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedKey = String(objectKey || '').replace(/^\/+/, '');
  if (!normalizedBase) {
    return `/${normalizedKey}`;
  }
  return `${normalizedBase}/${normalizedKey}`;
}

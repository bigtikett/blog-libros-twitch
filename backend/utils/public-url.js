function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function buildPublicAssetUrl(assetPath, options = {}) {
  if (!assetPath) {
    return assetPath;
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;

  const publicBaseUrl = normalizeBaseUrl(
    options.publicBaseUrl || options.baseUrl || ''
  );

  if (publicBaseUrl) {
    return `${publicBaseUrl}${normalizedPath}`;
  }

  if (options.request) {
    const protocol = options.request.protocol || 'http';
    const host = options.request.get?.('host') || options.request.headers?.host;

    if (host) {
      return `${protocol}://${host}${normalizedPath}`;
    }
  }

  return normalizedPath;
}

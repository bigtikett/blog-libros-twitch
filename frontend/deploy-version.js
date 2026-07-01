document.addEventListener('DOMContentLoaded', async () => {
  const targets = document.querySelectorAll('[data-deploy-version]');
  if (!targets.length) return;

  const fallbackText = '[ BUILD: OFFLINE ]';

  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('API_HEALTH_ERROR');

    const data = await response.json();
    const version = data && data.version ? data.version : {};
    const packageVersion = String(version.packageVersion || '1.0.0');
    const commitShort = String(version.commitShort || '').trim();
    const platform = String(version.platform || 'web').toUpperCase();
    const label = commitShort
      ? `[ BUILD ${packageVersion} // ${platform} // ${commitShort} ]`
      : `[ BUILD ${packageVersion} // ${platform} ]`;

    targets.forEach((node) => {
      node.textContent = label;
      node.setAttribute('data-build-ready', 'true');
      node.setAttribute('title', version.bootedAt ? `Deploy activo desde ${version.bootedAt}` : label);
    });
  } catch (error) {
    targets.forEach((node) => {
      node.textContent = fallbackText;
      node.setAttribute('data-build-ready', 'false');
      node.setAttribute('title', 'No se pudo cargar la version del deploy');
    });
  }
});

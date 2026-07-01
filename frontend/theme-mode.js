document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'bunker_visual_theme_mode';

  function ensureSwitcherExists() {
    let switcher = document.querySelector('.theme-mode-switcher');
    if (switcher) return switcher;

    switcher = document.createElement('aside');
    switcher.className = 'theme-mode-switcher';
    switcher.setAttribute('aria-label', 'Selector de tema visual');
    switcher.innerHTML = `
      <button type="button" class="theme-mode-btn" data-theme-mode="light" title="Modo claro" aria-label="Modo claro">
        <i class="bi bi-sun"></i>
      </button>
      <button type="button" class="theme-mode-btn is-active" data-theme-mode="default" title="Modo default" aria-label="Modo default">
        <i class="bi bi-moon-stars"></i>
      </button>
    `;

    document.body.appendChild(switcher);
    return switcher;
  }

  function applyThemeMode(mode) {
    const normalizedMode = mode === 'dark' ? 'default' : mode;
    const selectedMode = ['light', 'default'].includes(normalizedMode) ? normalizedMode : 'default';
    document.body.classList.remove('theme-light', 'theme-dark');

    if (selectedMode === 'light') {
      document.body.classList.add('theme-light');
    }

    document.querySelectorAll('.theme-mode-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-theme-mode') === selectedMode);
    });

    localStorage.setItem(STORAGE_KEY, selectedMode);
  }

  ensureSwitcherExists();
  document.querySelectorAll('.theme-mode-btn[data-theme-mode="dark"]').forEach((btn) => btn.remove());
  const storedMode = localStorage.getItem(STORAGE_KEY) || 'default';
  applyThemeMode(storedMode);

  document.querySelectorAll('.theme-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-theme-mode') || 'default';
      applyThemeMode(mode);
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'bunker_visual_theme_mode';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

  function normalizeMode(mode) {
    const normalizedMode = mode === 'dark' ? 'default' : mode;
    return ['light', 'default'].includes(normalizedMode) ? normalizedMode : 'default';
  }

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeStoredMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {
      // localStorage may be unavailable in privacy modes.
    }

    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(mode)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  }

  function readStoredMode() {
    let stored = null;

    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      stored = null;
    }

    if (!stored) {
      stored = getCookie(STORAGE_KEY);
    }

    return normalizeMode(stored || 'default');
  }

  function setThemeState(mode) {
    const isLight = mode === 'light';

    document.documentElement.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('theme-light', isLight);
    document.documentElement.dataset.themeMode = mode;
    document.body.dataset.themeMode = mode;
  }

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

  function applyLightModeHardFixes(mode) {
    const isLight = mode === 'light';
    const sectionTargets = [
      '#gaming.section-gaming-principal',
      '#favoritos-footer.section-favorites',
      '#twitch.section-twitch-live',
      '#biblioteca',
      '#contacto.cyber-footer',
      '#galeria.section-emotes-vault',
      '#setup.section-setup-hud',
    ];

    sectionTargets.forEach((selector) => {
      const node = document.querySelector(selector);
      if (!node) return;

      if (isLight) {
        node.style.setProperty('background', 'linear-gradient(180deg, rgba(239, 246, 245, 0.95), rgba(235, 241, 243, 0.93), rgba(243, 236, 242, 0.93))', 'important');
        node.style.setProperty('color', '#2b3648', 'important');
      } else {
        node.style.removeProperty('background');
        node.style.removeProperty('color');
      }
    });

    const textTargets = [
      '#gaming.section-gaming-principal .text-white',
      '#gaming.section-gaming-principal .text-white-50',
      '#gaming.section-gaming-principal .text-light',
      '#twitch.section-twitch-live .text-white',
      '#twitch.section-twitch-live .text-white-50',
      '#twitch.section-twitch-live .text-light',
      '#favoritos-footer.section-favorites .text-white',
      '#favoritos-footer.section-favorites .text-white-50',
      '#favoritos-footer.section-favorites .text-light',
      '#contacto.cyber-footer .footer-legal-link',
      '#galeria.section-emotes-vault .text-white',
      '#galeria.section-emotes-vault .text-white-50',
      '#galeria.section-emotes-vault .text-light',
      '#setup.section-setup-hud .text-white',
      '#setup.section-setup-hud .text-white-50',
      '#setup.section-setup-hud .text-light',
      '#setup.section-setup-hud .custom-hud-table',
      '#setup.section-setup-hud .custom-hud-table td',
    ];

    textTargets.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (isLight) {
          const color = selector.includes('footer-legal-link') ? '#9b2a62' : '#2b3648';
          node.style.setProperty('color', color, 'important');
        } else {
          node.style.removeProperty('color');
        }
      });
    });

    const cardTargets = [
      '.library-screen-frame',
      '.twitch-schedule-card',
      '.twitch-player-container',
      '.stream-screen-bg',
      '.player-hud-top',
      '.cyber-quote-card',
      '#galeria .emote-ticker-slot',
      '#setup .setup-frame-container',
      '#setup .hud-spec-block',
    ];
    cardTargets.forEach((selector) => {
      const node = document.querySelector(selector);
      if (!node) return;

      if (isLight) {
        node.style.setProperty('background', 'rgba(255, 253, 247, 0.95)', 'important');
        node.style.setProperty('background-color', 'rgba(255, 253, 247, 0.95)', 'important');
        node.style.setProperty('background-image', 'none', 'important');
        node.style.setProperty('color', '#2b3648', 'important');
      } else {
        node.style.removeProperty('background');
        node.style.removeProperty('background-color');
        node.style.removeProperty('background-image');
        node.style.removeProperty('color');
      }
    });

    const socialNodes = document.querySelectorAll('#redes-sociales .social-band :is(.text-white, .text-white-50)');
    socialNodes.forEach((node) => {
      if (isLight) {
        node.style.setProperty('color', '#1f2b3d', 'important');
        node.style.setProperty('text-shadow', 'none', 'important');
      } else {
        node.style.removeProperty('color');
        node.style.removeProperty('text-shadow');
      }
    });

    const footerConnectors = [
      { selector: '#contacto .social-connector.connector-twitch', color: '#6d39c7', border: 'rgba(145, 70, 255, 0.28)', hover: '#5528a6', glow: 'rgba(145, 70, 255, 0.22)' },
      { selector: '#contacto .social-connector.connector-tiktok', color: '#145861', border: 'rgba(0, 202, 222, 0.28)', hover: '#0f6f7d', glow: 'rgba(0, 202, 222, 0.22)' },
      { selector: '#contacto .social-connector.connector-discord', color: '#4252c8', border: 'rgba(88, 101, 242, 0.28)', hover: '#2f3cb0', glow: 'rgba(88, 101, 242, 0.22)' },
      { selector: '#contacto .social-connector.connector-email', color: '#b87900', border: 'rgba(255, 170, 0, 0.28)', hover: '#8d5a00', glow: 'rgba(255, 170, 0, 0.22)' },
    ];

    footerConnectors.forEach(({ selector, color, border, hover, glow }) => {
      const node = document.querySelector(selector);
      if (!node) return;

      if (isLight) {
        node.style.setProperty('background', 'linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(236, 245, 243, 0.86), rgba(248, 236, 244, 0.88))', 'important');
        node.style.setProperty('border-color', border, 'important');
        node.style.setProperty('color', color, 'important');
        node.style.setProperty('box-shadow', `0 10px 24px rgba(39, 52, 70, 0.12), 0 0 0 1px ${glow}, inset 0 0 0 1px rgba(255, 255, 255, 0.45)`, 'important');
        const icon = node.querySelector('i');
        if (icon) {
          icon.style.setProperty('color', 'inherit', 'important');
          icon.style.setProperty('text-shadow', 'none', 'important');
        }
      } else {
        node.style.removeProperty('background');
        node.style.removeProperty('border-color');
        node.style.removeProperty('color');
        node.style.removeProperty('box-shadow');
        const icon = node.querySelector('i');
        if (icon) {
          icon.style.removeProperty('color');
          icon.style.removeProperty('text-shadow');
        }
      }
    });

    const btnLight = document.querySelector('.theme-mode-btn[data-theme-mode="light"]');
    const btnDefault = document.querySelector('.theme-mode-btn[data-theme-mode="default"]');

    if (btnLight && btnDefault) {
      if (isLight) {
        btnLight.style.setProperty('background', 'rgba(255, 255, 255, 0.98)', 'important');
        btnLight.style.setProperty('background-color', 'rgba(255, 255, 255, 0.98)', 'important');
        btnLight.style.setProperty('border-color', 'rgba(0, 202, 222, 0.62)', 'important');
        btnLight.style.setProperty('color', '#176170', 'important');
        btnLight.style.setProperty('box-shadow', '0 0 0 1px rgba(229, 67, 149, 0.25), 0 0 20px rgba(0, 202, 222, 0.28)', 'important');

        btnDefault.style.setProperty('background', 'rgba(0, 14, 18, 0.78)', 'important');
        btnDefault.style.setProperty('background-color', 'rgba(0, 14, 18, 0.78)', 'important');
        btnDefault.style.setProperty('border-color', 'rgba(0, 240, 255, 0.9)', 'important');
        btnDefault.style.setProperty('color', '#00f0ff', 'important');
        btnDefault.style.setProperty('box-shadow', '0 0 14px rgba(0, 240, 255, 0.35), inset 0 0 12px rgba(0, 240, 255, 0.2)', 'important');
      } else {
        btnDefault.style.setProperty('background', 'rgba(0, 14, 18, 0.78)', 'important');
        btnDefault.style.setProperty('background-color', 'rgba(0, 14, 18, 0.78)', 'important');
        btnDefault.style.setProperty('border-color', 'rgba(0, 240, 255, 0.9)', 'important');
        btnDefault.style.setProperty('color', '#00f0ff', 'important');
        btnDefault.style.setProperty('box-shadow', '0 0 14px rgba(0, 240, 255, 0.35), inset 0 0 12px rgba(0, 240, 255, 0.2)', 'important');

        btnLight.style.setProperty('background', 'rgba(255, 255, 255, 0.96)', 'important');
        btnLight.style.setProperty('background-color', 'rgba(255, 255, 255, 0.96)', 'important');
        btnLight.style.setProperty('border-color', 'rgba(0, 202, 222, 0.48)', 'important');
        btnLight.style.setProperty('color', '#1f5f6b', 'important');
        btnLight.style.setProperty('box-shadow', '0 0 0 1px rgba(0, 202, 222, 0.2), 0 0 14px rgba(0, 202, 222, 0.2)', 'important');
      }
    }

    const sobre = document.querySelector('#sobre-mi');
    const sobreOverlay = document.querySelector('#sobre-mi .sobre-mi-bg-overlay');
    const sobreGrid = document.querySelector('#sobre-mi .sobre-mi-grid-layer');
    const sobreBadges = document.querySelectorAll('#sobre-mi .sobre-mi-badge');

    if (sobre) {
      if (isLight) {
        sobre.style.setProperty('background', 'linear-gradient(180deg, rgba(241, 248, 246, 0.96), rgba(233, 243, 240, 0.95), rgba(244, 236, 243, 0.94))', 'important');
      } else {
        sobre.style.removeProperty('background');
      }
    }

    if (sobreOverlay) {
      if (isLight) {
        sobreOverlay.style.setProperty('background', 'linear-gradient(135deg, rgba(247, 253, 250, 0.9) 0%, rgba(235, 246, 241, 0.86) 50%, rgba(248, 238, 246, 0.9) 100%)', 'important');
      } else {
        sobreOverlay.style.removeProperty('background');
      }
    }

    if (sobreGrid) {
      if (isLight) {
        sobreGrid.style.setProperty('background-image', 'linear-gradient(rgba(0, 202, 222, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(229, 67, 149, 0.04) 1px, transparent 1px)', 'important');
        sobreGrid.style.setProperty('opacity', '0.5', 'important');
      } else {
        sobreGrid.style.removeProperty('background-image');
        sobreGrid.style.removeProperty('opacity');
      }
    }

    sobreBadges.forEach((badge) => {
      if (isLight) {
        badge.style.setProperty('background', 'rgba(255, 255, 255, 0.7)', 'important');
        badge.style.setProperty('border-color', 'rgba(72, 91, 117, 0.22)', 'important');
        badge.style.setProperty('color', '#2b3648', 'important');
        badge.style.setProperty('box-shadow', '0 6px 14px rgba(39, 52, 70, 0.1)', 'important');
      } else {
        badge.style.removeProperty('background');
        badge.style.removeProperty('border-color');
        badge.style.removeProperty('color');
        badge.style.removeProperty('box-shadow');
      }
    });
  }

  function applyThemeMode(mode) {
    const selectedMode = normalizeMode(mode);
    setThemeState(selectedMode);
    applyLightModeHardFixes(selectedMode);

    document.querySelectorAll('.theme-mode-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-theme-mode') === selectedMode);
    });

    writeStoredMode(selectedMode);
    document.dispatchEvent(new CustomEvent('theme-mode:changed', { detail: { mode: selectedMode } }));
  }

  ensureSwitcherExists();
  document.querySelectorAll('.theme-mode-btn[data-theme-mode="dark"]').forEach((btn) => btn.remove());
  const storedMode = readStoredMode();
  applyThemeMode(storedMode);

  document.querySelectorAll('.theme-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-theme-mode') || 'default';
      applyThemeMode(mode);
    });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyThemeMode(event.newValue || 'default');
  });

  const observer = new MutationObserver(() => {
    if (document.body.dataset.themeMode === 'light') {
      applyLightModeHardFixes('light');
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
});

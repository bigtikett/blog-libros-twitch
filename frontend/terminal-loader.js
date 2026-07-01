document.addEventListener("DOMContentLoaded", () => {
  const botonesCartucho = document.querySelectorAll("#library-cartridge-selector .cartridge-btn");
  const pantallaContenido = document.getElementById("terminal-screen-content");
  const pathTerminal = document.getElementById("terminal-path");
  const logTerminal = document.getElementById("terminal-live-log");
  const logsCanvasPanel = document.getElementById("logs-canvas-panel");
  const openLogsCanvasBtn = document.getElementById("open-logs-canvas");
  const closeLogsCanvasBtn = document.getElementById("close-logs-canvas");
  const openIndexAdminPanelBtn = document.getElementById("open-index-admin-panel");

  let swiperFavoritos = null;

  const ACCESS_CODE = "bunker2026";
  const ADMIN_SESSION_KEY = "bunker_admin_authenticated";
  let isAdmin = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  let lastIndexAdminState = isAdmin;

  function updateAdminIndicators() {
    document.body.classList.toggle("admin-mode", isAdmin);

    const indicatorIds = [
      "index-admin-indicator-lib",
      "index-admin-indicator-ent",
      "index-admin-indicator-game",
      "index-admin-indicator-red",
      "index-admin-indicator-emote"
    ];

    indicatorIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = isAdmin ? "[ ADMIN: ON ]" : "[ ADMIN: OFF ]";
      el.className = "small fw-bold";
      el.style.color = isAdmin ? "#4cffb2" : "#ff6f8f";
      el.style.textShadow = isAdmin
        ? "0 0 8px rgba(76,255,178,0.65), 0 0 14px rgba(76,255,178,0.35)"
        : "0 0 8px rgba(255,111,143,0.6), 0 0 14px rgba(255,111,143,0.3)";
      el.style.transition = "color 0.22s ease, text-shadow 0.22s ease";

      if (isAdmin && !lastIndexAdminState && typeof el.animate === "function") {
        el.animate(
          [
            { opacity: 0.35, transform: "scale(0.96)" },
            { opacity: 1, transform: "scale(1.08)" },
            { opacity: 1, transform: "scale(1)" }
          ],
          { duration: 220, easing: "ease-out" }
        );
      }
    });

    lastIndexAdminState = isAdmin;
  }

  function activarModoAdmin() {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    isAdmin = true;

    ["modal-password", "modal-password-entrevista", "modal-password-juego", "modal-password-red", "modal-password-emote"].forEach((id) => {
      const passInput = document.getElementById(id);
      if (passInput) passInput.value = ACCESS_CODE;
    });

    cargarJuegos();
    cargarEntrevistas();
    cargarRedes();

    const activeCartridge = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
    if (activeCartridge) {
      cargarFicheroBinario(activeCartridge.getAttribute("data-target"), activeCartridge);
    }

    refreshEditModeBadges();
    updateAdminIndicators();
  }

  function desactivarModoAdmin() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    isAdmin = false;

    ["modal-password", "modal-password-entrevista", "modal-password-juego", "modal-password-red", "modal-password-emote"].forEach((id) => {
      const passInput = document.getElementById(id);
      if (passInput) passInput.value = "";
    });

    cargarJuegos();
    cargarEntrevistas();
    cargarRedes();

    const activeCartridge = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
    if (activeCartridge) {
      cargarFicheroBinario(activeCartridge.getAttribute("data-target"), activeCartridge);
    }

    refreshEditModeBadges();
    updateAdminIndicators();
  }

  function openAdminModal(modalId, passInputId, onOpened) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;
    showModalSafe(modalEl);

    const passInput = document.getElementById(passInputId);
    if (passInput && isAdmin) passInput.value = ACCESS_CODE;

    if (typeof onOpened === "function") onOpened();
  }

  function requestAdminAccess(onSuccess, promptMessage = "INGRESE CÓDIGO DE ACCESO DE SEGURIDAD:") {
    if (isAdmin) {
      if (typeof onSuccess === "function") onSuccess();
      return;
    }

    const code = prompt(promptMessage);
    if (code === ACCESS_CODE) {
      activarModoAdmin();
      if (typeof onSuccess === "function") onSuccess();
      return;
    }

    if (code !== null) {
      alert("CÓDIGO DE ACCESO INCORRECTO. ACCESO DENEGADO.");
    }
  }

  function isTypingContext(target) {
    if (!target) return false;
    const tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  function matchesAdminShortcut(event, key) {
    const pressedKey = String(event.key || "").toLowerCase();
    if (pressedKey !== key) return false;

    // Keep legacy Ctrl+Shift and add Alt+Shift for browsers that reserve Ctrl+Shift combos.
    const ctrlShift = event.ctrlKey && event.shiftKey && !event.altKey;
    const altShift = event.altKey && event.shiftKey && !event.ctrlKey;
    return ctrlShift || altShift;
  }

  function showModalSafe(modalEl) {
    if (!modalEl) return;
    const modalApi = window.bootstrap && window.bootstrap.Modal;
    if (modalApi && typeof modalApi.getOrCreateInstance === "function") {
      modalApi.getOrCreateInstance(modalEl).show();
      return;
    }

    // Fallback for local/dev scenarios where Bootstrap JS is not available.
    modalEl.classList.add("show");
    modalEl.style.display = "block";
    modalEl.removeAttribute("aria-hidden");
    modalEl.setAttribute("aria-modal", "true");
    document.body.classList.add("modal-open");
    if (!document.querySelector(".modal-backdrop.fallback-modal-backdrop")) {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop fade show fallback-modal-backdrop";
      document.body.appendChild(backdrop);
    }
  }

  function hideModalSafe(modalEl) {
    if (!modalEl) return;
    const modalApi = window.bootstrap && window.bootstrap.Modal;
    if (modalApi && typeof modalApi.getOrCreateInstance === "function") {
      modalApi.getOrCreateInstance(modalEl).hide();
      return;
    }

    modalEl.classList.remove("show");
    modalEl.style.display = "none";
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.removeAttribute("aria-modal");
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".modal-backdrop.fallback-modal-backdrop").forEach((el) => el.remove());
  }

  ["modal-password", "modal-password-entrevista", "modal-password-juego", "modal-password-red", "modal-password-emote"].forEach((id) => {
    const passInput = document.getElementById(id);
    if (!passInput) return;
    passInput.addEventListener("input", () => {
      if (passInput.value === ACCESS_CODE && !isAdmin) {
        activarModoAdmin();
      }
    });
  });

  document.querySelectorAll(".btn-close-admin-mode").forEach((btn) => {
    btn.addEventListener("click", () => {
      desactivarModoAdmin();
      const modalId = btn.getAttribute("data-modal-id");
      if (!modalId) return;
      const modalEl = document.getElementById(modalId);
      if (!modalEl) return;
      hideModalSafe(modalEl);
    });
  });

  if (openIndexAdminPanelBtn) {
    openIndexAdminPanelBtn.addEventListener("click", () => {
      if (isAdmin) {
        openAdminModal("modal-nuevo-libro", "modal-password");
        return;
      }

      requestAdminAccess(() => {
        openAdminModal("modal-nuevo-libro", "modal-password");
      });
    });
  }

  updateAdminIndicators();

  const EDIT_MODE_FIELDS = [
    { inputId: "lib-id-editar", badgeId: "lib-edit-mode-badge", formId: "form-nuevo-libro", createLabel: "[ INJECT_BOOK_RECORD ]" },
    { inputId: "cita-id-editar", badgeId: "cita-edit-mode-badge", formId: "form-nueva-cita", createLabel: "[ INJECT_QUOTE_RECORD ]" },
    { inputId: "ent-id-editar", badgeId: "ent-edit-mode-badge", formId: "form-nueva-entrevista", createLabel: "[ INJECT_INTERVIEW_RECORD ]" },
    { inputId: "game-id-editar", badgeId: "game-edit-mode-badge", formId: "form-nuevo-juego", createLabel: "[ INJECT_GAME_RECORD ]" },
    { inputId: "red-id-editar", badgeId: "red-edit-mode-badge", formId: "form-nueva-red", createLabel: "[ INJECT_POST ]" },
    { inputId: "emote-id-editar", badgeId: "emote-edit-mode-badge", formId: "form-nuevo-emote", createLabel: "[ INJECT_EMOTE_RECORD ]" }
  ];

  function setEditModeUIState(config) {
    const input = document.getElementById(config.inputId);
    if (!input) return;

    const isEditMode = !!String(input.value || "").trim();
    const badge = document.getElementById(config.badgeId);
    if (badge) {
      badge.classList.toggle("d-none", !isEditMode);
    }

    const form = document.getElementById(config.formId);
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    if (submitBtn) {
      if (!submitBtn.dataset.createLabel) {
        submitBtn.dataset.createLabel = config.createLabel || submitBtn.textContent.trim();
      }
      submitBtn.textContent = isEditMode ? "[ GUARDAR CAMBIOS ]" : submitBtn.dataset.createLabel;
    }
  }

  function setEditModeBadgeState(inputId, badgeId) {
    const config = EDIT_MODE_FIELDS.find((item) => item.inputId === inputId && item.badgeId === badgeId);
    if (config) {
      setEditModeUIState(config);
      return;
    }

    const input = document.getElementById(inputId);
    if (!input) return;
    const isEditMode = !!String(input.value || "").trim();
    const badge = document.getElementById(badgeId);
    if (badge) {
      badge.classList.toggle("d-none", !isEditMode);
    }
  }

  function refreshEditModeBadges() {
    EDIT_MODE_FIELDS.forEach((config) => {
      setEditModeUIState(config);
    });
  }

  function wireEditModeBadges() {
    EDIT_MODE_FIELDS.forEach((config) => {
      const input = document.getElementById(config.inputId);
      if (!input) return;
      const syncBadge = () => setEditModeUIState(config);
      input.addEventListener("input", syncBadge);
      input.addEventListener("change", syncBadge);
      syncBadge();
    });
  }

  wireEditModeBadges();


  function setLogsCanvasOpen(isOpen) {
    if (!logsCanvasPanel) return;
    logsCanvasPanel.classList.toggle("is-open", isOpen);
    logsCanvasPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  if (openLogsCanvasBtn) {
    openLogsCanvasBtn.addEventListener("click", () => {
      const shouldOpen = !logsCanvasPanel || !logsCanvasPanel.classList.contains("is-open");
      setLogsCanvasOpen(shouldOpen);
    });
  }

  if (closeLogsCanvasBtn) {
    closeLogsCanvasBtn.addEventListener("click", () => {
      setLogsCanvasOpen(false);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setLogsCanvasOpen(false);
    }
  });

  // 🌟 FUNCIÓN AUXILIAR PARA RECONECTAR SWIPER CUANDO APAREZCA EN PANTALLA
  function inicializarSwiperFavoritos() {
    if (swiperFavoritos) {
      console.log("[HUD_LOADER]: Destruyendo instancia previa de Swiper...");
      swiperFavoritos.destroy(true, true);
      swiperFavoritos = null;
    }

    if (document.querySelector(".mySwiperBooks")) {
      console.log("[HUD_LOADER]: Activando stream horizontal estilo Paint...");
      
      swiperFavoritos = new Swiper(".mySwiperBooks", {
        direction: "horizontal",  // Movimiento horizontal continuo
        slidesPerView: 1,         // 1 libro en pantallas móviles muy pequeñas
        spaceBetween: 20,         // Margen entre libros
        grabCursor: true,
        loop: true,               // Bucle infinito
        autoplay: {
          delay: 3000,
          disableOnInteraction: false,
        },
        pagination: {
          el: ".swiper-pagination",
          clickable: true,
        },
        // 📱 Ajuste dinámico según el ancho de la pantalla:
        breakpoints: {
          400: { slidesPerView: 2, spaceBetween: 15 },
          768: { slidesPerView: 3, spaceBetween: 20 },
          1024: { slidesPerView: 4, spaceBetween: 25 } // 🖥️ En PC muestra 4 a la vez tal cual tu boceto
        }
      });
    }
  }

  async function cargarFicheroBinario(urlPath, botonActivo) {
    try {
      // Destruir el swiper si existe antes de cambiar de página/contenido
      if (swiperFavoritos) {
        console.log("[HUD_LOADER]: Destruyendo Swiper activo por cambio de cartucho...");
        swiperFavoritos.destroy(true, true);
        swiperFavoritos = null;
      }

      // 1. Efecto estético de apagado/parpadeo de pantalla
      pantallaContenido.classList.add("fade-out");
      logTerminal.textContent = `> Requesting sector: ${urlPath.toUpperCase()}...`;
      
      // 2. Traemos el archivo HTML externo por red de fondo
      const response = await fetch(urlPath);
      if (!response.ok) throw new Error(`ERR_CODE_404: Node unreachable`);
      
      const htmlText = await response.text();
      
      // 3. Parseamos el HTML recibido para extraer solo las fichas de datos
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");
      
      // Buscamos el contenedor donde están las listas de libros en la subpágina
      const nuevoContenido = doc.getElementById("detalle-favorito") || doc.body;

      // 4. Esperamos un pelín para simular latencia de descompresión de datos
      setTimeout(() => {
        pantallaContenido.innerHTML = nuevoContenido.innerHTML;
        pathTerminal.textContent = `[ SCREEN_SRC: /read/${urlPath} ]`;
        logTerminal.textContent = `> Sector ${botonActivo.querySelector('.btn-label').textContent.toUpperCase()} loaded [OK]`;
        pantallaContenido.classList.remove("fade-out");
        
        // 🔧 CORREGIDO: Arreglado el typo 'antallaContenido' a 'pantallaContenido'
        pantallaContenido.scrollTop = 0; 
  
        // 🔥 ¡LA MAGIA OCURRE AQUÍ!: Ahora que el HTML ya está físicamente renderizado en el index, despertamos a Swiper
        inicializarSwiperFavoritos();

        // 📚 SYNC DATA SEGMENT WITH LIBRARY DATABASE
        cargarBibliotecaReal(urlPath);

      }, 200);

    } catch (error) {
      console.error(error);
      pantallaContenido.innerHTML = `
        <div class="text-danger font-monospace p-4 border border-danger border-opacity-25 bg-black-25">
          <h5 class="fw-bold">[ ❌ CRITICAL_LOAD_ERROR ]</h5>
          <p class="small m-0">No se pudo acceder a los fragmentos del nodo físico del búnker. Asegúrate de que el archivo '${urlPath}' existe en el servidor.</p>
        </div>
      `;
      pantallaContenido.classList.remove("fade-out");
      logTerminal.textContent = `> CRITICAL: Sector allocation table corrupt.`;
    }
  }

  // Configurar los listeners para cada ranura de cartucho
  botonesCartucho.forEach(boton => {
    boton.addEventListener("click", () => {
      if (boton.classList.contains("active")) return; // Ya está cargado

      // Cambiar estados visuales de los botones
      botonesCartucho.forEach(b => {
        b.classList.remove("active");
        b.querySelector(".status-icon").className = "bi bi-dot ms-auto status-icon";
      });
      
      boton.classList.add("active");
      boton.querySelector(".status-icon").className = "bi bi-play-fill ms-auto status-icon";

      // Ejecutar la carga asíncrona
      const destinoHTML = boton.getAttribute("data-target");
      cargarFicheroBinario(destinoHTML, boton);
    });
  });

  // Carga inicial automática del primer cartucho por defecto
  const primerCartucho = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
  if (primerCartucho) {
    cargarFicheroBinario(primerCartucho.getAttribute("data-target"), primerCartucho);
  }

  // 🌈 LÓGICA DE ROTACIÓN NEÓN RGB ULTRA-FLUIDA VÍA JS Y VARIABLES CSS
  const wrapper = document.querySelector('.neon-rgb-frame-wrapper');
  if (wrapper) {
    const spinner = wrapper.querySelector('.neon-rgb-border-spin');
    if (spinner) {
      let currentAngle = 0;
      let lastTime = performance.now();
      let direction = 1; // 1 = forward, -1 = reverse
      const SPEED = 90;  // grados por segundo (360deg / 4s de duración)

      function animate(time) {
        const dt = (time - lastTime) / 1000; // delta time en segundos
        lastTime = time;

        // Limitar dt para evitar saltos si el navegador suspende la pestaña
        const safeDt = Math.min(dt, 0.1);

        currentAngle += direction * SPEED * safeDt;
        
        // Mantener el ángulo en el rango [0, 360)
        currentAngle = (currentAngle % 360 + 360) % 360;

        spinner.style.setProperty('--rotation', `${currentAngle}deg`);
        
        requestAnimationFrame(animate);
      }

      wrapper.addEventListener('mouseenter', () => {
        direction = -1;
      });

      wrapper.addEventListener('mouseleave', () => {
        direction = 1;
      });

      // Iniciar el bucle de rotación
      requestAnimationFrame((time) => {
        lastTime = time;
        requestAnimationFrame(animate);
      });
    }
  }

  // 🐸 CARGA DINÁMICA DE EMOTES DESDE ASSETS/ICONS
  function resolveEmoteImageSrc(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return '';
    if (/^(https?:\/\/|\/|data:image\/)/i.test(value)) {
      return value;
    }
    return `assets/icons/${value}`;
  }

  function getEmoteDisplayName(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return 'emote';
    const chunks = value.split('/');
    return chunks[chunks.length - 1] || value;
  }

  async function inicializarMarquesinaEmotes() {
    const container = document.getElementById('emotes-marquee-container');
    if (!container) return;

    let emotes = [
      { file: 'ranidk.jfif', rarity: 'SUB', color: 'bg-neon-cyan' },
      { file: 'ranifire.jfif', rarity: 'HOT', color: 'bg-neon-magenta' },
      { file: 'ranihappy.jfif', rarity: 'EPIC', color: 'btn-purple' },
      { file: 'raniking.jfif', rarity: 'VIP', color: 'bg-purple' },
      { file: 'ranimad.jfif', rarity: 'ANGRY', color: 'bg-dark' },
      { file: 'raniok.jfif', rarity: 'SUB', color: 'bg-neon-cyan' },
      { file: 'ranireading.jfif', rarity: 'COZY', color: 'bg-neon-cyan' },
      { file: 'ranisketch.jfif', rarity: 'ART', color: 'bg-warning' },
      { file: 'ranite.jfif', rarity: 'COZY', color: 'bg-neon-cyan' },
      { file: 'raniwow.jfif', rarity: 'EPIC', color: 'btn-purple' },
      { file: 'raniwtf.jfif', rarity: 'WTF', color: 'bg-neon-magenta' },
      { file: 'yaiangry.jfif', rarity: 'STREAMER', color: 'bg-gold' },
      { file: 'yaicat.jfif', rarity: 'COZY', color: 'bg-neon-cyan' },
      { file: 'yailol.jfif', rarity: 'STREAMER', color: 'bg-gold' },
      { file: 'yaipalm.jfif', rarity: 'EXCL', color: 'bg-neon-magenta' },
      { file: 'yaiplay.jfif', rarity: 'GAMER', color: 'bg-info' },
      { file: 'yaiwow.jfif', rarity: 'STREAMER', color: 'bg-gold' }
    ];

    try {
      const response = await fetch('/api/emotes');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length) {
          emotes = data.map((entry) => ({
            id: entry.id,
            file: String(entry.file || entry.image || '').trim(),
            rarity: String(entry.rarity || 'SUB').trim().toUpperCase(),
            color: String(entry.color || 'bg-neon-cyan').trim()
          })).filter((entry) => entry.file);
        }
      }
    } catch (error) {
      console.warn('No se pudo leer emotes desde API, usando fallback local.', error);
    }

    // Dividimos los emotes en dos filas/cintas para darle contra-ritmo
    const midPoint = Math.ceil(emotes.length / 2);
    const fila1 = emotes.slice(0, midPoint);
    const fila2 = emotes.slice(midPoint);

    // Función auxiliar para construir el contenido HTML de una fila (duplicado para el loop infinito)
    function crearFilaHTML(listaEmotes, esIzquierda) {
      const trackClass = esIzquierda ? 'track-left' : 'track-right';
      
      // Construimos los slots de emotes
      const itemsHTML = listaEmotes.map(emote => {
        const imageValue = String(emote.image || emote.file || '').trim();
        const src = resolveEmoteImageSrc(imageValue);
        const displayName = getEmoteDisplayName(imageValue);
        return `
        <div class="emote-ticker-slot">
          <img src="${src}" alt="${displayName}" loading="lazy">
          <span class="badge-rarity ${emote.color}">${emote.rarity}</span>
        </div>
      `;
      }).join('');

      return `
        <div class="marquee-track ${trackClass}">
          <div class="marquee-content">
            ${itemsHTML}
            <!-- Duplicado para loop infinito fluido -->
            ${itemsHTML}
          </div>
        </div>
      `;
    }

    // Insertamos ambas filas en el contenedor
    container.innerHTML = `
      ${crearFilaHTML(fila1, true)}
      ${crearFilaHTML(fila2, false)}
    `;
  }

  async function cargarPreviewEmotes() {
    const preview = document.getElementById('emote-inventory-preview');
    if (!preview) return;

    try {
      const response = await fetch('/api/emotes');
      if (!response.ok) throw new Error('NO_EMOTES');
      const data = await response.json();
      const emotes = Array.isArray(data) ? data : [];

      if (!emotes.length) {
        preview.innerHTML = '<div class="text-center py-2">[ INVENTARIO_VACÍO ]</div>';
        return;
      }

      preview.innerHTML = emotes.map((emote, index) => {
        const id = String(emote.id || `emote-${index}`);
        const imageValue = String(emote.image || emote.file || '').trim();
        const src = resolveEmoteImageSrc(imageValue);
        const file = getEmoteDisplayName(imageValue);
        const rarity = String(emote.rarity || 'SUB').trim().toUpperCase();
        const color = String(emote.color || 'bg-neon-cyan').trim();
        return `
          <div class="d-flex justify-content-between align-items-center gap-2 py-1 border-bottom border-secondary border-opacity-10">
            <div class="d-flex align-items-center gap-2" style="min-width: 0;">
              <img src="${src}" alt="${file}" style="width: 28px; height: 28px; object-fit: cover; border:1px solid rgba(255,255,255,.2); border-radius:4px;">
              <span class="text-white-50 text-truncate" style="max-width: 200px;">${file}</span>
              <span class="badge-rarity ${color}">${rarity}</span>
            </div>
            <div class="d-flex align-items-center gap-1">
              <button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-emote" data-id="${id}" style="font-size:0.6rem; padding:2px 6px;">[ EDITAR ]</button>
              <button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-emote" data-id="${id}" style="font-size:0.6rem; padding:2px 6px;">[ ELIMINAR ]</button>
            </div>
          </div>`;
      }).join('');
    } catch (error) {
      preview.innerHTML = '<div class="text-center text-danger py-2">[ ERROR_LOADING ]</div>';
    }
  }

  // --- LIBRARY DATABASE LOGIC (FETCH GET/POST & MODAL CONTROLS) ---

  // 1. Keyboard Shortcut: Ctrl + Shift + B to toggle Modal with password verification
  document.addEventListener("keydown", (e) => {
    if (isTypingContext(e.target)) return;
    if (matchesAdminShortcut(e, "b")) {
      e.preventDefault();
      requestAdminAccess(() => {
        openAdminModal("modal-nuevo-libro", "modal-password");
      });
    }
  });


  // Dynamic show/hide podium selector based on favorito checkbox
  const favCheckbox = document.getElementById("lib-favorito");
  const podioContainer = document.getElementById("podio-select-container");
  if (favCheckbox && podioContainer) {
    favCheckbox.addEventListener("change", function() {
      if (this.checked) {
        podioContainer.classList.remove("d-none");
      } else {
        podioContainer.classList.add("d-none");
        const podioSelect = document.getElementById("lib-podio");
        if (podioSelect) podioSelect.value = "";
      }
    });
  }

  // Dynamic show/hide own book links and rating fields based on estado select
  const estadoSelect = document.getElementById("lib-estado");
  const ownBookLinksContainer = document.getElementById("own-book-links-container");
  const wrapperPuntuacion = document.getElementById("wrapper-puntuacion");
  const inputPuntuacion = document.getElementById("lib-puntuacion");

  if (estadoSelect) {
    const handleEstadoChange = (val) => {
      // Toggle own book links
      if (ownBookLinksContainer) {
        if (val === "milibro") {
          ownBookLinksContainer.classList.remove("d-none");
        } else {
          ownBookLinksContainer.classList.add("d-none");
          const wattpadInput = document.getElementById("lib-link-wattpad");
          const amazonInput = document.getElementById("lib-link-amazon");
          if (wattpadInput) wattpadInput.value = "";
          if (amazonInput) amazonInput.value = "";
        }
      }
      // Toggle rating fields (TBR doesn't need ratings)
      if (wrapperPuntuacion && inputPuntuacion) {
        if (val === "tbr") {
          wrapperPuntuacion.classList.add("d-none");
          inputPuntuacion.removeAttribute("required");
        } else {
          wrapperPuntuacion.classList.remove("d-none");
          inputPuntuacion.setAttribute("required", "");
        }
      }
    };

    estadoSelect.addEventListener("change", function() {
      handleEstadoChange(this.value);
    });
    // Run on init
    handleEstadoChange(estadoSelect.value);
  }


  // 2. Submit handler for form-nuevo-libro
  const formNuevoLibro = document.getElementById("form-nuevo-libro");
  if (formNuevoLibro) {
    formNuevoLibro.addEventListener("submit", function (e) {
      e.preventDefault();

      const fileInput = document.getElementById("lib-cover-file");
      const file = fileInput ? fileInput.files[0] : null;

      const submitData = (coverData = null, fileName = null) => {
        const editId = (document.getElementById("lib-id-editar")?.value || "").trim();
        const manualCoverInput = document.getElementById("lib-cover");
        const datosLibro = {
          id: editId || undefined,
          titulo: document.getElementById("lib-titulo").value.toUpperCase(),
          colorTitulo: document.getElementById("lib-color-titulo") ? document.getElementById("lib-color-titulo").value : "white",
          autor: document.getElementById("lib-autor").value.toUpperCase(),
          colorAutor: document.getElementById("lib-color-autor") ? document.getElementById("lib-color-autor").value : "yellow",
          genero: document.getElementById("lib-genero").value.toUpperCase(),
          colorGenero: document.getElementById("lib-color-genero") ? document.getElementById("lib-color-genero").value : "info",
          estado: document.getElementById("lib-estado").value,
          puntuacion: document.getElementById("lib-estado").value === "tbr" ? null : (parseFloat(document.getElementById("lib-puntuacion").value) || 5),
          colorPuntuacion: document.getElementById("lib-color-puntuacion") ? document.getElementById("lib-color-puntuacion").value : "yellow",
          hype: parseInt(document.getElementById("lib-hype").value) || 90,
          colorHype: document.getElementById("lib-color-hype") ? document.getElementById("lib-color-hype").value : "yellow",
          resena: document.getElementById("lib-resena").value,
          colorResena: document.getElementById("lib-color-resena") ? document.getElementById("lib-color-resena").value : "white",
          cover: (manualCoverInput?.value || "").trim(),
          password: document.getElementById("modal-password").value,
          favorito: document.getElementById("lib-favorito").checked,
          podio: document.getElementById("lib-podio").value ? parseInt(document.getElementById("lib-podio").value) : null,
          linkWattpad: document.getElementById("lib-link-wattpad") ? document.getElementById("lib-link-wattpad").value.trim() : "",
          linkAmazon: document.getElementById("lib-link-amazon") ? document.getElementById("lib-link-amazon").value.trim() : "",
          coverFileData: coverData,
          coverFileName: fileName
        };

        const endpoint = editId ? "/api/biblioteca/editar" : "/api/biblioteca/nuevo";

        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datosLibro)
        })
          .then((res) => {
            if (!res.ok) {
              return res.json().then(err => { throw new Error(err.error || "Http Error"); });
            }
            return res.json();
          })
          .then((data) => {
            if (data.success) {
              console.log(`[SYS]: ${data.message}`);
              logTerminal.textContent = `> ${data.message}`;
              
              // Reset form and close modal
              formNuevoLibro.reset();
              const inputEditId = document.getElementById("lib-id-editar");
              if (inputEditId) inputEditId.value = "";
              setEditModeBadgeState("lib-id-editar", "lib-edit-mode-badge");
              if (podioContainer) podioContainer.classList.add("d-none");
              if (ownBookLinksContainer) ownBookLinksContainer.classList.add("d-none");
              const modalEl = document.getElementById("modal-nuevo-libro");
              if (modalEl) {
                hideModalSafe(modalEl);
              }

              // Reload current deck/cartridge if it's leidos.html, tbr.html or favoritos.html
              const activeCartridge = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
              if (activeCartridge) {
                const currentPath = activeCartridge.getAttribute("data-target");
                cargarBibliotecaReal(currentPath);
              }

              // Trigger log reload
              cargarLogsYVisores();
            }
          })
          .catch((err) => {
            console.error("Error adding book:", err);
            alert(`ERROR: ${err.message}`);
            logTerminal.textContent = `> ERR: Fail to write to library sector.`;
          });
      };

      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          submitData(event.target.result, file.name);
        };
        reader.onerror = function (error) {
          console.error("Error reading file:", error);
          alert("Error leyendo el archivo de imagen.");
        };
        reader.readAsDataURL(file);
      } else {
        submitData();
      }
    });
  }

  // Submit handler for form-nueva-cita
  const formNuevaCita = document.getElementById("form-nueva-cita");
  if (formNuevaCita) {
    formNuevaCita.addEventListener("submit", function (e) {
      e.preventDefault();

      const editId = (document.getElementById("cita-id-editar")?.value || "").trim();

      const datosCita = {
        id: editId || undefined,
        texto: document.getElementById("cita-texto").value,
        colorTexto: document.getElementById("cita-color-texto") ? document.getElementById("cita-color-texto").value : "white",
        autor: document.getElementById("cita-autor").value.toUpperCase(),
        colorAutor: document.getElementById("cita-color-autor") ? document.getElementById("cita-color-autor").value : "cyan",
        tipo: document.getElementById("cita-tipo").value,
        label: document.getElementById("cita-label").value.toUpperCase(),
        colorLabel: document.getElementById("cita-color-label") ? document.getElementById("cita-color-label").value : "cyan",
        nota: document.getElementById("cita-nota").value,
        colorNota: document.getElementById("cita-color-nota") ? document.getElementById("cita-color-nota").value : "white",
        password: document.getElementById("modal-password").value
      };

      const endpoint = editId ? "/api/citas/editar" : "/api/citas/nuevo";

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datosCita)
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then(err => { throw new Error(err.error || "Http Error"); });
          }
          return res.json();
        })
        .then((data) => {
          if (data.success) {
            console.log(`[SYS]: ${data.message}`);
            logTerminal.textContent = `> ${data.message}`;
            
            formNuevaCita.reset();
            const inputEditId = document.getElementById("cita-id-editar");
            if (inputEditId) inputEditId.value = "";
            setEditModeBadgeState("cita-id-editar", "cita-edit-mode-badge");
            const modalEl = document.getElementById("modal-nuevo-libro");
            if (modalEl) {
              hideModalSafe(modalEl);
            }

            // Reload current deck/cartridge if it's citas.html
            const activeCartridge = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
            if (activeCartridge) {
              const currentPath = activeCartridge.getAttribute("data-target");
              cargarBibliotecaReal(currentPath);
            }

            // Trigger log reload
            cargarLogsYVisores();
          }
        })
        .catch((err) => {
          console.error("Error adding quote:", err);
          alert(`ERROR: ${err.message}`);
          logTerminal.textContent = `> ERR: Fail to write to quotes sector.`;
        });
    });
  }

  // 3. Submit handler for form-nueva-entrevista (opened with Ctrl + Shift + E)
  const formNuevaEntrevista = document.getElementById("form-nueva-entrevista");
  if (formNuevaEntrevista) {
    formNuevaEntrevista.addEventListener("submit", function (e) {
      e.preventDefault();

      const editId = (document.getElementById("ent-id-editar")?.value || "").trim();

      const datosEntrevista = {
        id: editId || undefined,
        nombre: document.getElementById("ent-nombre").value.trim(),
        colorNombre: document.getElementById("ent-color-nombre").value,
        obra: document.getElementById("ent-obra").value.trim(),
        colorObra: document.getElementById("ent-color-obra").value,
        squad: document.getElementById("ent-squad").value.trim().toUpperCase(),
        level: parseInt(document.getElementById("ent-level").value) || 99,
        resumen: document.getElementById("ent-resumen").value.trim(),
        colorResena: document.getElementById("ent-color-resena").value,
        socialUser: document.getElementById("ent-social-user").value.trim(),
        socialUrl: document.getElementById("ent-social-url").value.trim(),
        colorSocial: document.getElementById("ent-color-social").value,
        videoUrl: document.getElementById("ent-video").value.trim(),
        password: document.getElementById("modal-password-entrevista").value
      };

      const endpoint = editId ? "/api/entrevistas/editar" : "/api/entrevistas/nuevo";

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datosEntrevista)
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then(err => { throw new Error(err.error || "Http Error"); });
          }
          return res.json();
        })
        .then((data) => {
          if (data.success) {
            console.log(`[SYS]: ${data.message}`);
            logTerminal.textContent = `> ${data.message}`;
            
            formNuevaEntrevista.reset();
            const inputEditId = document.getElementById("ent-id-editar");
            if (inputEditId) inputEditId.value = "";
            setEditModeBadgeState("ent-id-editar", "ent-edit-mode-badge");
            const modalEl = document.getElementById("modal-nueva-entrevista");
            if (modalEl) {
              hideModalSafe(modalEl);
            }

            cargarEntrevistas();
            cargarLogsYVisores();
          }
        })
        .catch((err) => {
          console.error("Error adding interview:", err);
          alert(`ERROR: ${err.message}`);
          logTerminal.textContent = `> ERR: Fail to write to interviews sector.`;
        });
    });
  }

  // Submit handler for form-nuevo-juego (opened with Ctrl + Shift + G)
  const formNuevoJuego = document.getElementById("form-nuevo-juego");
  if (formNuevoJuego) {
    formNuevoJuego.addEventListener("submit", function (e) {
      e.preventDefault();

      const editId = (document.getElementById("game-id-editar")?.value || "").trim();

      const gameImageFileInput = document.getElementById("game-imagen-file");
      const gameCurrentImageInput = document.getElementById("game-imagen-actual");

      const submitData = (uploadedImageData = "", uploadedImageName = "") => {
        const datosJuego = {
          id: editId || undefined,
          titulo: document.getElementById("game-titulo").value.trim(),
          tituloColor: document.getElementById("game-color-titulo").value,
          badgeTexto: document.getElementById("game-badge-texto").value.trim(),
          badgeColor: document.getElementById("game-color-badge").value,
          descripcion: document.getElementById("game-descripcion").value.trim(),
          vicio: parseInt(document.getElementById("game-vicio").value) || 80,
          progressColor: document.getElementById("game-color-progress").value,
          plataforma: document.getElementById("game-plataforma").value.trim(),
          horas: document.getElementById("game-horas").value.trim(),
          imagen: (uploadedImageData || gameCurrentImageInput?.value || "").trim(),
          coverFileData: uploadedImageData || undefined,
          coverFileName: uploadedImageName || undefined,
          password: document.getElementById("modal-password-juego").value
        };

        const endpoint = editId ? "/api/juegos/editar" : "/api/juegos/nuevo";

        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datosJuego)
        })
          .then((res) => {
            if (!res.ok) {
              return res.json().then(err => { throw new Error(err.error || "Http Error"); });
            }
            return res.json();
          })
          .then((data) => {
            if (data.success) {
              console.log(`[SYS]: ${data.message}`);
              logTerminal.textContent = `> ${data.message}`;

              formNuevoJuego.reset();
              const inputEditId = document.getElementById("game-id-editar");
              if (inputEditId) inputEditId.value = "";
              if (gameCurrentImageInput) gameCurrentImageInput.value = "";
              setEditModeBadgeState("game-id-editar", "game-edit-mode-badge");
              const modalEl = document.getElementById("modal-nuevo-juego");
              if (modalEl) {
                hideModalSafe(modalEl);
              }

              cargarJuegos();
              cargarLogsYVisores();
            }
          })
          .catch((err) => {
            console.error("Error adding game:", err);
            alert(`ERROR: ${err.message}`);
            logTerminal.textContent = `> ERR: Fail to write to gaming sector.`;
          });
      };

      const selectedFile = gameImageFileInput?.files?.[0];
      if (selectedFile) {
        const reader = new FileReader();
        reader.onload = (event) => {
          submitData(event.target?.result || "", selectedFile.name || "game-cover.png");
        };
        reader.onerror = () => {
          alert("ERROR: No se pudo leer la imagen del juego.");
        };
        reader.readAsDataURL(selectedFile);
      } else {
        submitData("");
      }
    });
  }

  // 4. Keyboard Shortcut: Ctrl + Shift + E to open interviews modal
  document.addEventListener("keydown", (e) => {
    if (isTypingContext(e.target)) return;

    if (matchesAdminShortcut(e, "e")) {
      e.preventDefault();
      requestAdminAccess(
        () => openAdminModal("modal-nueva-entrevista", "modal-password-entrevista"),
        "INGRESE CÓDIGO DE ACCESO DE SEGURIDAD DEL BÚNKER:"
      );
    }

    if (matchesAdminShortcut(e, "g")) {
      e.preventDefault();
      requestAdminAccess(
        () => openAdminModal("modal-nuevo-juego", "modal-password-juego"),
        "INGRESE CÓDIGO DE ACCESO DE SEGURIDAD DEL BÚNKER (GAMING):"
      );
    }

    if (matchesAdminShortcut(e, "m")) {
      e.preventDefault();
      requestAdminAccess(
        () => openAdminModal("modal-nuevo-emote", "modal-password-emote", () => cargarPreviewEmotes()),
        "INGRESE CÓDIGO DE ACCESO DE SEGURIDAD DEL BÚNKER (EMOTES):"
      );
    }
  });

  // Function to load logs dynamically
  let logsSyncInProgress = false;
  let lastLogsSignature = "";
  async function cargarLogsYVisores(force = false) {
    if (logsSyncInProgress) return;
    logsSyncInProgress = true;
    try {
      const response = await fetch("/api/logs");
      if (!response.ok) throw new Error("API_ERROR");
      const logs = await response.json();

      const signature = logs.map(log => log.id).join("|");
      if (!force && signature === lastLogsSignature) {
        return;
      }
      lastLogsSignature = signature;

      // 1. Ticker logs
      const tickerContent = document.querySelector(".ticker-content");
      if (tickerContent) {
        tickerContent.innerHTML = "";
        
        const spansHTML = logs.map(log => `
          <span class="ticker-item">// ${log.tag}: ${log.desc}</span>
        `).join('');

        tickerContent.innerHTML = spansHTML + spansHTML;
      }

      // 2. CRT Monitor logs
      const crtList = document.querySelector(".update-log-list");
      if (crtList) {
        crtList.innerHTML = "";
        
        const recentLogs = logs.slice(-3).reverse();
        recentLogs.forEach(log => {
          const logEntryHTML = `
            <div class="log-entry mb-2">
              <span class="log-tag ${log.color || 'text-white'}">[+] ${log.fecha}</span>
              <p class="log-desc m-0 text-white-50">${log.crtDesc}</p>
            </div>`;
          crtList.innerHTML += logEntryHTML;
        });
      }

      // 3. Full logs canvas panel
      const fullLogsList = document.getElementById("logs-canvas-list");
      if (fullLogsList) {
        fullLogsList.innerHTML = "";

        const sortedLogs = logs.slice().reverse();
        sortedLogs.forEach(log => {
          const colorClass = log.color || "text-white";
          const entryHTML = `
            <div class="logs-canvas-entry">
              <div class="meta ${colorClass}">[${log.tag}] ${log.fecha}</div>
              <div class="desc">${log.desc || "Sin descripcion"}</div>
              <div class="crt">${log.crtDesc || "Sin detalle de monitor"}</div>
            </div>`;
          fullLogsList.innerHTML += entryHTML;
        });
      }
    } catch (error) {
      console.error("Error loading dev logs:", error);
    } finally {
      logsSyncInProgress = false;
    }
  }

  // 3. Function to fetch and render books dynamically
  async function cargarBibliotecaReal(urlPath) {
    const isLeidos = urlPath.includes("leidos.html");
    const isTbr = urlPath.includes("tbr.html");
    const isFavoritos = urlPath.includes("favoritos.html");
    const isCitas = urlPath.includes("citas.html");
    const isMiLibro = urlPath.includes("milibro.html");
    if (!isLeidos && !isTbr && !isFavoritos && !isCitas && !isMiLibro) return;

    try {
      logTerminal.textContent = `> Syncing library database sector...`;

      if (isLeidos || isTbr || isFavoritos || isMiLibro) {
        const response = await fetch("/api/biblioteca");
        if (!response.ok) throw new Error("API_ERROR");
        const libros = await response.json();


        if (isLeidos) {
          const contenedorLeidos = document.getElementById("contenedor-leidos");
          if (!contenedorLeidos) return;
          contenedorLeidos.innerHTML = "";

          const librosLeidos = libros.filter((l) => l.estado === "leido");
          if (librosLeidos.length === 0) {
            contenedorLeidos.innerHTML = `
              <div class="col-12 text-center text-white font-monospace py-4">
                [ NO_COMPLETED_RECORDS_FOUND ]
              </div>`;
            return;
          }

          librosLeidos.forEach((libro, index) => {
            const rating = parseFloat(libro.puntuacion) || 0;
            const ratingColor = libro.colorPuntuacion || 'yellow';
            const ratingClass = ratingColor === 'white' ? 'text-white' : `text-neon-${ratingColor}`;

            let starsHTML = "";
            for (let i = 1; i <= 5; i++) {
              if (i <= Math.floor(rating)) {
                starsHTML += `<i class="bi bi-star-fill ${ratingClass}"></i>`;
              } else if (i - 0.5 <= rating) {
                starsHTML += `<i class="bi bi-star-half ${ratingClass}"></i>`;
              } else {
                starsHTML += '<i class="bi bi-star text-white-50"></i>';
              }
            }

            const colorTitulo = libro.colorTitulo || 'white';
            const titleClass = colorTitulo === 'white' ? 'text-white' : `text-neon-${colorTitulo}`;

            const colorAutor = libro.colorAutor || 'yellow';
            const autorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorAutor)
              ? `text-neon-${colorAutor}`
              : `text-${colorAutor}`;

            const colorGenero = libro.colorGenero || 'info';
            const generoClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorGenero)
              ? `text-neon-${colorGenero}`
              : `text-${colorGenero}`;

            const colorResena = libro.colorResena || 'white';
            const resenaClass = colorResena === 'white' ? 'text-white' : `text-neon-${colorResena}`;

            const colors = ["text-neon-magenta", "text-neon-cyan", "text-neon-gold", "text-neon-purple"];
            const colorClass = colors[index % colors.length];

            const cardHTML = `
              <div class="col-12">
                <div class="cyber-book-card d-flex flex-column flex-md-row align-items-center p-4 gap-4">
                  <div class="cyber-cover-wrap flex-shrink-0 shadow">
                    <img src="${libro.cover || '/assets/images/jony.jpg'}" class="cyber-img" alt="${libro.titulo}">
                  </div>
                  <div class="flex-grow-1 min-w-0">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                      <div>
                        <span class="${colorClass} font-monospace text-xs d-block mb-1">[ COMPLETED_RECORD // CORE_${String(index + 1).padStart(2, '0')} ]</span>
                        <h3 class="fw-bold ${titleClass} text-uppercase m-0 h4">${libro.titulo}</h3>
                        <div class="text-white-50 small mt-1 font-monospace">
                          POR <span class="${autorClass}">${libro.autor}</span> // GÉNERO: <span class="${generoClass}">${libro.genero || 'CYBERPUNK'}</span>
                        </div>
                      </div>
                      <div class="d-flex align-items-center gap-3">
                        <div class="${ratingClass} fw-bold fs-5 font-monospace d-flex align-items-center gap-1">
                          ${starsHTML}
                          <span class="text-white ms-1" style="font-size: 14px;">${rating.toFixed(1)}</span>
                        </div>
                        ${isAdmin ? `
                          <button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${libro.id}" style="font-size: 0.62rem; padding: 2px 6px;">[ EDITAR ]</button>
                          <button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${libro.id}" style="font-size: 0.62rem; padding: 2px 6px;">[ ELIMINAR ]</button>
                        ` : ''}
                      </div>
                    </div>
                    <hr class="border-secondary border-opacity-25 my-3">
                    <p class="${resenaClass} small font-monospace m-0" style="line-height: 1.6;">
                      ${libro.resena || '// No review logged for this sector.'}
                    </p>
                  </div>
                </div>
              </div>`;
            contenedorLeidos.innerHTML += cardHTML;
          });
        } else if (isTbr) {
          const contenedorTbr = document.getElementById("contenedor-tbr");
          if (!contenedorTbr) return;
          contenedorTbr.innerHTML = "";

          const librosTbr = libros.filter((l) => l.estado === "tbr");
          if (librosTbr.length === 0) {
            contenedorTbr.innerHTML = `
              <div class="col-12 text-center text-white font-monospace py-4">
                [ READ_BUFFER_EMPTY ]
              </div>`;
            return;
          }

          librosTbr.forEach((libro, index) => {
            const hype = parseInt(libro.hype) || 90;
            let badgeText = "STANDBY_DECK 💾";
            if (hype >= 90) badgeText = "CRITICAL_HYPE 🔥";
            else if (hype >= 75) badgeText = "COZY_READ ☕";
            else if (hype >= 60) badgeText = "STUDY_CORE 🌌";

            const queueState = index === 0 ? 'NEXT_LOAD' : index === 1 ? 'ACTIVE_QUEUE' : 'BUFFER_STANDBY';
            const buyLink = `https://www.amazon.es/s?k=${encodeURIComponent(libro.titulo + ' ' + libro.autor)}`;

            const colorTitulo = libro.colorTitulo || 'white';
            const titleClass = colorTitulo === 'white' ? 'text-white' : `text-neon-${colorTitulo}`;

            const colorAutor = libro.colorAutor || 'warning';
            const autorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorAutor)
              ? `text-neon-${colorAutor}`
              : `text-${colorAutor}`;

            const colorGenero = libro.colorGenero || 'white';
            const generoClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorGenero)
              ? `text-neon-${colorGenero}`
              : `text-${colorGenero}`;

            const colorResena = libro.colorResena || 'white';
            const resenaClass = colorResena === 'white' ? 'text-white' : `text-neon-${colorResena}`;

            const colorHype = libro.colorHype || 'yellow';
            const hypeHex = colorMap[colorHype] || '#ffee00';

            const cardHTML = `
              <div class="col">
                <div class="card h-100 tbr-cyber-card border-0 shadow-sm overflow-hidden" style="border: 1px solid rgba(255,255,255,0.05) !important;">
                  <div class="tbr-cover-container position-relative">
                    <img src="${libro.cover || '/assets/images/jony.jpg'}" alt="${libro.titulo}">
                    <div class="position-absolute top-0 start-0 m-2">
                      <span class="badge bg-dark font-monospace text-xs" style="background: rgba(0,0,0,0.85) !important; border: 1px solid ${hypeHex} !important; color: ${hypeHex} !important; text-shadow: 0 0 6px ${hypeHex};">
                        ${badgeText}
                      </span>
                    </div>
                    ${isAdmin ? `
                      <button type="button" class="btn btn-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${libro.id}" style="position: absolute; top: 10px; right: 90px; z-index: 10; font-size: 0.62rem; padding: 2px 6px; background: rgba(13,202,240,0.85); border: 1px solid rgba(13,202,240,0.5);">[ EDITAR ]</button>
                      <button type="button" class="btn btn-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${libro.id}" style="position: absolute; top: 10px; right: 10px; z-index: 10; font-size: 0.62rem; padding: 2px 6px; background: rgba(220,53,69,0.85); border: 1px solid rgba(220,53,69,0.5);">[ ELIMINAR ]</button>
                    ` : ''}
                  </div>
                  <div class="card-body d-flex flex-column justify-content-between p-3 text-white">
                    <div>
                      <span style="color: ${hypeHex}; text-shadow: 0 0 5px ${hypeHex};" class="font-monospace text-xs d-block mb-1">[ QUEUE_POS: #${String(index + 1).padStart(2, '0')} // ${queueState} ]</span>
                      <h5 class="fw-bold text-truncate ${titleClass} text-uppercase m-0" style="font-size: 14px;">${libro.titulo}</h5>
                      <p class="text-white small mb-3 font-monospace" style="font-size: 10px;">POR: <span class="${autorClass}">${libro.autor}</span> // <span class="${generoClass}">${libro.genero || 'SCI-FI'}</span></p>
                      <p class="${resenaClass} font-monospace mb-4" style="font-size: 11px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                        ${libro.resena || '// Awaiting synopsis decrypt...'}
                      </p>
                    </div>
                    <div>
                      <div class="d-flex justify-content-between align-items-center mb-1 font-monospace" style="font-size: 11px; color: ${hypeHex}; text-shadow: 0 0 5px ${hypeHex};">
                        <span>LOAD_HYPE:</span>
                        <span class="fw-bold">${hype}%</span>
                      </div>
                      <div class="tbr-hype-progress mb-3">
                        <div class="tbr-hype-bar" style="width: ${hype}%; background-color: ${hypeHex} !important; box-shadow: 0 0 8px ${hypeHex} !important;"></div>
                      </div>
                      <a href="${buyLink}" target="_blank" style="border-color: ${hypeHex} !important; color: ${hypeHex} !important;" class="btn btn-outline-warning btn-sm w-100 rounded-1 py-2 font-monospace text-xs text-uppercase fw-bold">
                        <i class="bi bi-cart3 me-1"></i> Acquire Core
                      </a>
                    </div>
                  </div>
                </div>
              </div>`;
            contenedorTbr.innerHTML += cardHTML;
          });
        } else if (isFavoritos) {
          const contenedorPodio = document.getElementById("contenedor-favoritos-podio");
          const contenedorCarrusel = document.getElementById("contenedor-favoritos-carrusel");

          if (contenedorPodio) {
            contenedorPodio.innerHTML = "";
            const t1 = libros.find(l => l.favorito && parseInt(l.podio) === 1);
            const t2 = libros.find(l => l.favorito && parseInt(l.podio) === 2);
            const t3 = libros.find(l => l.favorito && parseInt(l.podio) === 3);

            let t2HTML = "";
            if (t2) {
              const t2ColorTitulo = t2.colorTitulo || 'white';
              const t2TitleClass = t2ColorTitulo === 'white' ? 'text-white' : `text-neon-${t2ColorTitulo}`;
              const t2ColorAutor = t2.colorAutor || 'white';
              const t2AutorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t2ColorAutor) ? `text-neon-${t2ColorAutor}` : `text-${t2ColorAutor}`;
              const t2ColorGenero = t2.colorGenero || 'info';
              const t2BadgeBorderColor = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t2ColorGenero) ? `border-${t2ColorGenero}` : 'border-info';
              const t2BadgeTextClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t2ColorGenero) ? `text-neon-${t2ColorGenero}` : 'text-info';
              const t2ColorResena = t2.colorResena || 'white';
              const t2ResenaClass = t2ColorResena === 'white' ? 'text-white' : `text-neon-${t2ColorResena}`;

              t2HTML = `
                <div class="col-md-4 order-2 order-md-1">
                  <div class="card card-podium card-podium-second h-100 text-center p-3">
                    <div class="podium-rank-badge badge-second">#2 PUESTO</div>
                    <div class="podium-cover-wrap">
                      <img src="${t2.cover || '/assets/images/jony.jpg'}" alt="Top 2" />
                    </div>
                    <div class="card-body p-2 d-flex flex-column justify-content-between">
                      <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                          <i class="bi bi-award-fill text-info fs-4 d-block m-0"></i>
                          ${isAdmin ? `<button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${t2.id}" style="font-size: 0.55rem; padding: 1px 4px;">[ E ]</button><button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${t2.id}" style="font-size: 0.55rem; padding: 1px 4px;">[ X ]</button>` : ''}
                        </div>
                        <h5 class="fw-bold mb-1 ${t2TitleClass} text-uppercase" style="font-size: 15px;">${t2.titulo}</h5>
                        <p class="text-white small mb-2 font-monospace" style="font-size: 11px;">POR: <span class="${t2AutorClass}">${t2.autor}</span></p>
                        <div class="d-flex flex-wrap gap-1 justify-content-center mb-3">
                          <span class="badge bg-dark border ${t2BadgeBorderColor} ${t2BadgeTextClass} rounded-pill text-xs">${t2.genero || 'CYBERPUNK'}</span>
                        </div>
                        <p class="card-text ${t2ResenaClass} small font-monospace italic">
                          "${t2.resena || '// Awaiting sector review decrypt...'}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>`;
            } else {
              t2HTML = `<div class="col-md-4 order-2 order-md-1 text-center text-white font-monospace py-4 border border-secondary border-opacity-10 bg-black-10 rounded-1">[ #2_VACANTE ]</div>`;
            }

            let t1HTML = "";
            if (t1) {
              const t1ColorTitulo = t1.colorTitulo || 'white';
              const t1TitleClass = t1ColorTitulo === 'white' ? 'text-white' : `text-neon-${t1ColorTitulo}`;
              const t1ColorAutor = t1.colorAutor || 'white';
              const t1AutorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t1ColorAutor) ? `text-neon-${t1ColorAutor}` : `text-${t1ColorAutor}`;
              const t1ColorGenero = t1.colorGenero || 'warning';
              const t1BadgeBorderColor = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t1ColorGenero) ? `border-${t1ColorGenero}` : 'border-warning';
              const t1BadgeTextClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t1ColorGenero) ? `text-neon-${t1ColorGenero}` : 'text-warning';
              const t1ColorResena = t1.colorResena || 'white';
              const t1ResenaClass = t1ColorResena === 'white' ? 'text-white' : `text-neon-${t1ColorResena}`;

              t1HTML = `
                <div class="col-md-4 order-1 order-md-2 podium-col-first">
                  <div class="card card-podium card-podium-first h-100 text-center p-3">
                    <div class="podium-rank-badge badge-first">#1 PUESTO</div>
                    <div class="podium-cover-wrap">
                      <img src="${t1.cover || '/assets/images/ALAS.jpg'}" alt="Top 1" />
                    </div>
                    <div class="card-body p-2 d-flex flex-column justify-content-between">
                      <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                          <i class="bi bi-crown-fill text-warning fs-3 d-block m-0"></i>
                          ${isAdmin ? `<button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${t1.id}" style="font-size: 0.55rem; padding: 1px 4px;">[ E ]</button><button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${t1.id}" style="font-size: 0.55rem; padding: 1px 4px;">[ X ]</button>` : ''}
                        </div>
                        <h5 class="fw-bold mb-1 ${t1TitleClass} text-uppercase" style="font-size: 17px;">${t1.titulo}</h5>
                        <p class="text-white small mb-2 font-monospace" style="font-size: 11px;">POR: <span class="${t1AutorClass}">${t1.autor}</span></p>
                        <div class="d-flex flex-wrap gap-1 justify-content-center mb-3">
                          <span class="badge bg-dark border ${t1BadgeBorderColor} ${t1BadgeTextClass} rounded-pill text-xs">${t1.genero || 'CYBERPUNK'}</span>
                        </div>
                        <p class="card-text ${t1ResenaClass} small font-monospace italic">
                          "${t1.resena || '// Awaiting sector review decrypt...'}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>`;
            } else {
              t1HTML = `<div class="col-md-4 order-1 order-md-2 podium-col-first text-center text-white font-monospace py-4 border border-warning border-opacity-10 bg-black-10 rounded-1">[ #1_VACANTE ]</div>`;
            }

            let t3HTML = "";
            if (t3) {
              const t3ColorTitulo = t3.colorTitulo || 'white';
              const t3TitleClass = t3ColorTitulo === 'white' ? 'text-white' : `text-neon-${t3ColorTitulo}`;
              const t3ColorAutor = t3.colorAutor || 'white';
              const t3AutorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t3ColorAutor) ? `text-neon-${t3ColorAutor}` : `text-${t3ColorAutor}`;
              const t3ColorGenero = t3.colorGenero || 'danger';
              const t3BadgeBorderColor = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t3ColorGenero) ? `border-${t3ColorGenero}` : 'border-danger';
              const t3BadgeTextClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(t3ColorGenero) ? `text-neon-${t3ColorGenero}` : 'text-danger';
              const t3ColorResena = t3.colorResena || 'white';
              const t3ResenaClass = t3ColorResena === 'white' ? 'text-white' : `text-neon-${t3ColorResena}`;

              t3HTML = `
                <div class="col-md-4 order-3 order-md-3">
                  <div class="card card-podium card-podium-third h-100 text-center p-3">
                    <div class="podium-rank-badge badge-third">#3 PUESTO</div>
                    <div class="podium-cover-wrap">
                      <img src="${t3.cover || '/assets/images/forastero.jpg'}" alt="Top 3" />
                    </div>
                    <div class="card-body p-2 d-flex flex-column justify-content-between">
                      <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                          <i class="bi bi-award text-danger fs-4 d-block m-0"></i>
                          ${isAdmin ? `<button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${t3.id}" style="font-size: 0.55rem; padding: 1px 4px;">[ E ]</button><button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${t3.id}" style="font-size: 0.55rem; padding: 1px 4px;">[ X ]</button>` : ''}
                        </div>
                        <h5 class="fw-bold mb-1 ${t3TitleClass} text-uppercase" style="font-size: 15px;">${t3.titulo}</h5>
                        <p class="text-white small mb-2 font-monospace" style="font-size: 11px;">POR: <span class="${t3AutorClass}">${t3.autor}</span></p>
                        <div class="d-flex flex-wrap gap-1 justify-content-center mb-3">
                          <span class="badge bg-dark border ${t3BadgeBorderColor} ${t3BadgeTextClass} rounded-pill text-xs">${t3.genero || 'CYBERPUNK'}</span>
                        </div>
                        <p class="card-text ${t3ResenaClass} small font-monospace italic">
                          "${t3.resena || '// Awaiting sector review decrypt...'}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>`;
            } else {
              t3HTML = `<div class="col-md-4 order-3 order-md-3 text-center text-white font-monospace py-4 border border-secondary border-opacity-10 bg-black-10 rounded-1">[ #3_VACANTE ]</div>`;
            }

            contenedorPodio.innerHTML = t2HTML + t1HTML + t3HTML;
          }

          if (contenedorCarrusel) {
            contenedorCarrusel.innerHTML = "";
            const carruselLibros = libros.filter(l => l.favorito && !l.podio);
            if (carruselLibros.length === 0) {
              contenedorCarrusel.innerHTML = `
                <div class="swiper-slide text-center text-white font-monospace py-4">
                  [ NO_ADDITIONAL_FAVORITES_LOADED ]
                </div>`;
            } else {
              carruselLibros.forEach((libro, index) => {
                const colorTitulo = libro.colorTitulo || 'white';
                const titleClass = colorTitulo === 'white' ? 'text-white' : `text-neon-${colorTitulo}`;

                const slideHTML = `
                  <div class="swiper-slide">
                    <div class="cyber-book-card d-flex flex-column align-items-center p-3 h-100 text-center position-relative">
                      ${isAdmin ? `
                        <button type="button" class="btn btn-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${libro.id}" style="position: absolute; top: 10px; right: 55px; z-index: 10; font-size: 0.55rem; padding: 1px 4px; background: rgba(13,202,240,0.85); border: 1px solid rgba(13,202,240,0.5);">[ E ]</button>
                        <button type="button" class="btn btn-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${libro.id}" style="position: absolute; top: 10px; right: 10px; z-index: 10; font-size: 0.55rem; padding: 1px 4px; background: rgba(220,53,69,0.85); border: 1px solid rgba(220,53,69,0.5);">[ X ]</button>
                      ` : ''}
                      <div class="cyber-cover-wrap mb-3">
                        <img src="${libro.cover || 'https://via.placeholder.com/200x300'}" class="cyber-img" alt="${libro.titulo}">
                      </div>
                      <div class="w-100 min-w-0">
                        <span class="text-warning d-block mb-1" style="font-size: 10px;">[ CORE_${String(index + 1).padStart(2, '0')} ]</span>
                        <h6 class="fw-bold text-truncate ${titleClass} text-uppercase m-0" style="font-size: 14px;">${libro.titulo}</h6>
                        <div class="text-warning fw-bold mt-2" style="font-size: 12px;">
                          <i class="bi bi-star-fill text-glow-warning"></i> ${parseFloat(libro.puntuacion || 5).toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </div>`;
                contenedorCarrusel.innerHTML += slideHTML;
              });
            }
            inicializarSwiperFavoritos();
          }
        } else if (isMiLibro) {
          const contenedorAdicionales = document.getElementById("mis-libros-adicionales");
          if (contenedorAdicionales) {
            contenedorAdicionales.innerHTML = "";

            const misLibros = libros.filter((l) => l.estado === "milibro");
            misLibros.forEach((libro, index) => {
              const colors = ["text-neon-magenta", "text-neon-cyan", "text-neon-gold", "text-neon-purple"];
              const colorClass = colors[index % colors.length];

              const colorTitulo = libro.colorTitulo || 'white';
              const titleClass = colorTitulo === 'white' ? 'text-white' : `text-neon-${colorTitulo}`;

              const colorAutor = libro.colorAutor || 'purple';
              const autorClass = `text-neon-${colorAutor}`;

              const colorGenero = libro.colorGenero || 'info';
              const generoClass = `text-neon-${colorGenero}`;

              const colorResena = libro.colorResena || 'white';
              const resenaClass = colorResena === 'white' ? 'text-white' : `text-neon-${colorResena}`;

              const wattpadBtn = libro.linkWattpad 
                ? `<a href="${libro.linkWattpad}" target="_blank" class="btn btn-gradient-launch btn-lg rounded-pill px-4 py-3 shadow font-monospace text-xs text-uppercase fw-bold"><i class="bi bi-book-half me-2"></i> Leer en Wattpad</a>`
                : "";
              
              const amazonBtn = libro.linkAmazon
                ? `<a href="${libro.linkAmazon}" target="_blank" class="btn btn-amazon-gradient btn-lg rounded-pill px-4 py-3 shadow font-monospace text-xs text-uppercase fw-bold"><i class="bi bi-cart3 me-2"></i> Comprar en Amazon</a>`
                : "";

              const rowHTML = `
                <div class="row align-items-center g-5 my-4 position-relative">
                  ${isAdmin ? `
                    <div class="position-absolute top-0 end-0 m-3 text-end" style="z-index: 100;">
                      <button type="button" class="btn btn-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-book" data-id="${libro.id}" style="font-size: 0.62rem; padding: 2px 6px; background: rgba(13,202,240,0.85); border: 1px solid rgba(13,202,240,0.5);">[ EDITAR ]</button>
                      <button type="button" class="btn btn-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-book" data-id="${libro.id}" style="font-size: 0.62rem; padding: 2px 6px; background: rgba(220,53,69,0.85); border: 1px solid rgba(220,53,69,0.5);">[ ELIMINAR ]</button>
                    </div>
                  ` : ''}
                  <!-- Columna Izquierda: Portada 3D con halo de luz animado -->
                  <div class="col-lg-5 text-center pe-lg-5">
                    <div class="book-container mx-auto">
                      <div class="book-glow-aura"></div>
                      <img src="${libro.cover || '/assets/images/jony.jpg'}" class="img-fluid book-cover-3d" alt="${libro.titulo}" />
                      <div class="book-shadow"></div>
                    </div>
                  </div>

                  <!-- Columna Derecha: Sinopsis y HUD de Detalles -->
                  <div class="col-lg-7">
                    <div class="d-flex align-items-center gap-2 mb-3">
                      <span class="hud-status-dot"></span>
                      <span class="badge bg-dark border border-success text-success fw-bold px-3 py-2 rounded-1 text-uppercase tracking-wider text-xs">
                        [ DIRECT_LINK_ACTIVE // DISPONIBLE ]
                      </span>
                    </div>

                    <h2 class="display-3 fw-black mb-1 text-glow neon-flicker-title ${titleClass}">
                      ${libro.titulo}
                    </h2>

                    <h5 class="fw-medium mb-4 font-monospace ${autorClass}" style="font-size: 13px">
                      // SAGA: CYBER_NETWORKS // POR: ${libro.autor} // GÉNERO: <span class="${generoClass}">${libro.genero || 'SCI-FI'}</span>
                    </h5>

                    <!-- Caja de Sinopsis Cyber-Datapad -->
                    <div class="cyber-synopsis-box text-white mb-5 font-monospace" style="font-size: 13px; line-height: 1.7">
                      <p class="m-0 ${resenaClass}">
                        ${libro.resena || '// No review logged for this sector.'}
                      </p>
                    </div>

                    <!-- Botones de Acción HUD -->
                    <div class="d-flex flex-wrap gap-3 align-items-center">
                      ${wattpadBtn}
                      ${amazonBtn}
                    </div>
                  </div>
                </div>
              `;
              contenedorAdicionales.innerHTML += rowHTML;
            });
          }
        }
      }


      if (isCitas) {
        const response = await fetch("/api/citas");
        if (!response.ok) throw new Error("API_ERROR");
        const citas = await response.json();

        const contenedorMagicas = document.getElementById("contenedor-citas-magicas");
        const contenedorSpicy = document.getElementById("contenedor-citas-spicy");

        if (contenedorMagicas) {
          contenedorMagicas.innerHTML = "";
          const citasMagicas = citas.filter(c => c.tipo === "literaria");
          if (citasMagicas.length === 0) {
            contenedorMagicas.innerHTML = `<div class="col-12 text-center text-white font-monospace py-4">[ NO_LITERARY_QUOTES_LOADED ]</div>`;
          } else {
            citasMagicas.forEach(cita => {
              const colorTexto = cita.colorTexto || 'white';
              const textClass = colorTexto === 'white' ? 'text-white' : `text-neon-${colorTexto}`;
              const colorAutor = cita.colorAutor || 'cyan';
              const autorClass = colorAutor === 'white' ? 'text-white' : `text-neon-${colorAutor}`;
              const colorLabel = cita.colorLabel || 'cyan';
              const labelHex = colorMap[colorLabel] || '#00f0ff';
              const colorNota = cita.colorNota || 'white';
              const notaClass = colorNota === 'white' ? 'text-white-50' : `text-neon-${colorNota}`;

              const cardHTML = `
                <div class="col">
                  <div class="card h-100 border-0 quote-cyber-card p-4 text-white position-relative">
                    ${isAdmin ? `
                      <button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-quote" data-id="${cita.id}" style="position: absolute; top: 10px; right: 95px; z-index: 10; font-size: 0.62rem; padding: 2px 6px;">[ EDITAR ]</button>
                      <button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-quote" data-id="${cita.id}" style="position: absolute; top: 10px; right: 10px; z-index: 10; font-size: 0.62rem; padding: 2px 6px;">[ ELIMINAR ]</button>
                    ` : ''}
                    <div class="fs-1 mb-2" style="color: ${labelHex}; text-shadow: 0 0 10px ${labelHex};"><i class="bi bi-quote"></i></div>
                    <figure class="mb-0">
                      <blockquote class="blockquote">
                        <p class="fs-5 fw-bold font-monospace ${textClass}">"${cita.texto}"</p>
                      </blockquote>
                      <figcaption class="blockquote-footer mt-3 mb-0 font-monospace" style="font-size: 11px;">
                        <span class="${notaClass}">${cita.nota}</span> <cite title="Source Title" style="color: ${labelHex}; text-shadow: 0 0 5px ${labelHex}; font-style: normal;">// ${cita.label}</cite>
                      </figcaption>
                    </figure>
                  </div>
                </div>`;
              contenedorMagicas.innerHTML += cardHTML;
            });
          }
        }

        if (contenedorSpicy) {
          contenedorSpicy.innerHTML = "";
          const citasSpicy = citas.filter(c => c.tipo === "spicy");
          if (citasSpicy.length === 0) {
            contenedorSpicy.innerHTML = `<div class="col-12 text-center text-white font-monospace py-4">[ NO_SPICY_QUOTES_LOADED ]</div>`;
          } else {
            citasSpicy.forEach(cita => {
              const colorTexto = cita.colorTexto || 'white';
              const textClass = colorTexto === 'white' ? 'text-white' : `text-neon-${colorTexto}`;
              const colorAutor = cita.colorAutor || 'cyan';
              const autorClass = colorAutor === 'white' ? 'text-white' : `text-neon-${colorAutor}`;
              const colorLabel = cita.colorLabel || 'magenta';
              const labelHex = colorMap[colorLabel] || '#ff007f';
              const colorNota = cita.colorNota || 'white';
              const notaClass = colorNota === 'white' ? 'text-white-50' : `text-neon-${colorNota}`;

              const cardHTML = `
                <div class="col">
                  <div class="card h-100 border-0 quote-spicy-card p-4 text-white">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <div class="fs-1" style="color: ${labelHex}; text-shadow: 0 0 10px ${labelHex};"><i class="bi ${cita.label.includes('CLIP') ? 'bi-chat-heart-fill' : 'bi-fire'}"></i></div>
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge rounded-1 bg-dark font-monospace text-xs" style="background: rgba(0,0,0,0.85) !important; border: 1px solid ${labelHex} !important; color: ${labelHex} !important; text-shadow: 0 0 6px ${labelHex};">[ ${cita.label} ]</span>
                        ${isAdmin ? `
                          <button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-quote" data-id="${cita.id}" style="font-size: 0.62rem; padding: 2px 6px;">[ EDITAR ]</button>
                          <button type="button" class="btn btn-outline-danger btn-sm rounded-0 text-uppercase font-monospace btn-delete-quote" data-id="${cita.id}" style="font-size: 0.62rem; padding: 2px 6px;">[ ELIMINAR ]</button>
                        ` : ''}
                      </div>
                    </div>
                    <figure class="mb-0">
                      <blockquote class="blockquote">
                        <p class="fs-5 fw-bold font-monospace ${textClass}">"${cita.texto}"</p>
                      </blockquote>
                      <figcaption class="blockquote-footer mt-3 mb-0 font-monospace" style="font-size: 11px;">
                        <span class="${autorClass}">${cita.autor}</span> <cite title="Source Title" class="${notaClass}">// ${cita.nota}</cite>
                      </figcaption>
                    </figure>
                  </div>
                </div>`;
              contenedorSpicy.innerHTML += cardHTML;
            });
          }
        }
      }

      logTerminal.textContent = `> Database sync: COMPLETE [OK]`;
    } catch (error) {
      console.error("Error loading library data:", error);
      logTerminal.textContent = `> ERR: Database read failure.`;
    }
  }

  // Color preview system for library modal
  const SECRET_MODAL_EXTRA_COLORS = [
    { value: 'red', label: 'RED (POTENTE)' },
    { value: 'blue', label: 'BLUE (FUERTE)' },
    { value: 'gray', label: 'GRAY (LEGIBLE)' },
    { value: 'brown', label: 'BROWN (MARRON)' },
    { value: 'black', label: 'BLACK (NEGRO)' }
  ];

  function expandSecretModalColorOptions() {
    const colorSelects = document.querySelectorAll('.modal select[id*="color"]');
    colorSelects.forEach((select) => {
      SECRET_MODAL_EXTRA_COLORS.forEach((opt) => {
        const exists = Array.from(select.options).some((o) => o.value === opt.value);
        if (!exists) {
          select.add(new Option(opt.label, opt.value));
        }
      });
    });
  }

  expandSecretModalColorOptions();

  function isHexColor(value) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
  }

  function normalizeHex(value) {
    const raw = String(value || '').trim();
    if (!isHexColor(raw)) return '';
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
    }
    return raw.toUpperCase();
  }

  function ensureCustomColorOption(select, hexValue, customName = '') {
    const hex = normalizeHex(hexValue);
    if (!select || !hex) return;
    const normalizedName = String(customName || '').trim();
    const label = normalizedName ? `${normalizedName} (${hex})` : `CUSTOM (${hex})`;
    const existing = Array.from(select.options).find((o) => String(o.value || '').toUpperCase() === hex);
    if (!existing) {
      const option = new Option(label, hex);
      option.dataset.customColor = '1';
      option.dataset.customName = normalizedName || 'CUSTOM';
      select.add(option);
      return;
    }

    if (existing.dataset.customColor === '1') {
      existing.text = label;
      existing.dataset.customName = normalizedName || 'CUSTOM';
    }
  }

  const CUSTOM_MODAL_COLORS_STORAGE_KEY = 'bunker_modal_custom_colors_v1';

  function normalizeCustomColorEntry(entry) {
    if (typeof entry === 'string') {
      const hex = normalizeHex(entry);
      return hex ? { hex, name: 'CUSTOM' } : null;
    }

    if (entry && typeof entry === 'object') {
      const hex = normalizeHex(entry.hex || entry.value || '');
      if (!hex) return null;
      const name = String(entry.name || 'CUSTOM').trim() || 'CUSTOM';
      return { hex, name };
    }

    return null;
  }

  function getStoredCustomModalColors() {
    try {
      const raw = localStorage.getItem(CUSTOM_MODAL_COLORS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => normalizeCustomColorEntry(entry)).filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveStoredCustomModalColors(colors) {
    const source = Array.isArray(colors) ? colors : [];
    const map = new Map();
    source.forEach((entry) => {
      const normalized = normalizeCustomColorEntry(entry);
      if (!normalized) return;
      map.set(normalized.hex, normalized);
    });
    localStorage.setItem(CUSTOM_MODAL_COLORS_STORAGE_KEY, JSON.stringify(Array.from(map.values())));
  }

  function addColorToPersistentPalette(hexValue, customName = 'CUSTOM') {
    const hex = normalizeHex(hexValue);
    if (!hex) return;
    const name = String(customName || 'CUSTOM').trim() || 'CUSTOM';
    const current = getStoredCustomModalColors();
    const existingIndex = current.findIndex((entry) => entry.hex === hex);
    if (existingIndex >= 0) {
      current[existingIndex] = { hex, name };
    } else {
      current.push({ hex, name });
    }
    saveStoredCustomModalColors(current);
  }

  function removeColorFromPersistentPalette(hexValue) {
    const hex = normalizeHex(hexValue);
    if (!hex) return false;
    const current = getStoredCustomModalColors();
    const filtered = current.filter((entry) => entry.hex !== hex);
    saveStoredCustomModalColors(filtered);
    return filtered.length !== current.length;
  }

  function injectStoredColorsIntoSelect(select) {
    if (!select) return;
    const stored = getStoredCustomModalColors();
    stored.forEach((entry) => ensureCustomColorOption(select, entry.hex, entry.name));
  }

  function removeCustomOptionsFromSelect(select) {
    if (!select) return;
    Array.from(select.options).forEach((option) => {
      if (option.dataset.customColor === '1') {
        option.remove();
      }
    });
  }

  function injectStoredColorsIntoAllModalColorSelects() {
    const colorSelects = document.querySelectorAll('.modal select[id*="color"]');
    colorSelects.forEach((select) => injectStoredColorsIntoSelect(select));
  }

  function refreshCustomOptionsFromStorage() {
    const colorSelects = document.querySelectorAll('.modal select[id*="color"]');
    colorSelects.forEach((select) => {
      const currentValue = String(select.value || '');
      removeCustomOptionsFromSelect(select);
      injectStoredColorsIntoSelect(select);
      if (isHexColor(currentValue) && !Array.from(select.options).some((opt) => String(opt.value || '').toUpperCase() === currentValue.toUpperCase())) {
        if (select.options.length > 0) {
          select.selectedIndex = 0;
        }
      }
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function pickCustomColorToDelete() {
    const stored = getStoredCustomModalColors();
    if (!stored.length) {
      alert('? No hay colores custom guardados.');
      return '';
    }

    const list = stored.map((entry, idx) => `${idx + 1}. ${entry.name} (${entry.hex})`).join('\n');
    const answer = prompt(`Elige el número del color que quieres eliminar:\n\n${list}`);
    if (answer === null) return '';
    const index = Number.parseInt(String(answer).trim(), 10);
    if (!Number.isInteger(index) || index < 1 || index > stored.length) {
      alert('Selección inválida.');
      return '';
    }

    return stored[index - 1].hex;
  }

  function enhanceModalColorPickers() {
    const colorSelects = document.querySelectorAll('.modal select[id*="color"]');
    colorSelects.forEach((select) => {
      if (select.dataset.paletteEnhanced === '1') return;
      select.dataset.paletteEnhanced = '1';

      injectStoredColorsIntoSelect(select);

      if (isHexColor(select.value)) {
        ensureCustomColorOption(select, select.value);
      }

      const paletteBtn = document.createElement('button');
      paletteBtn.type = 'button';
      paletteBtn.className = 'btn btn-outline-light btn-sm mt-2 rounded-0 font-monospace';
      paletteBtn.style.fontSize = '0.65rem';
      paletteBtn.innerHTML = '[ ?? PALETA ] <span class="palette-swatch" aria-hidden="true" style="display:inline-block;width:11px;height:11px;margin-left:6px;border:1px solid rgba(255,255,255,0.65);vertical-align:middle;"></span>';

      const saveColorBtn = document.createElement('button');
      saveColorBtn.type = 'button';
      saveColorBtn.className = 'btn btn-outline-success btn-sm mt-2 ms-2 rounded-0 font-monospace';
      saveColorBtn.style.fontSize = '0.65rem';
      saveColorBtn.textContent = '[ + GUARDAR COLOR ]';

      const customNameInput = document.createElement('input');
      customNameInput.type = 'text';
      customNameInput.className = 'form-control form-control-sm bg-black border-secondary text-white mt-2 ms-2 rounded-0';
      customNameInput.style.maxWidth = '160px';
      customNameInput.style.fontSize = '0.65rem';
      customNameInput.placeholder = 'NOMBRE_CUSTOM';

      const removeColorBtn = document.createElement('button');
      removeColorBtn.type = 'button';
      removeColorBtn.className = 'btn btn-outline-danger btn-sm mt-2 ms-2 rounded-0 font-monospace';
      removeColorBtn.style.fontSize = '0.65rem';
      removeColorBtn.textContent = '[ - ELIMINAR COLOR ]';

      const swatchEl = paletteBtn.querySelector('.palette-swatch');

      const resolveSwatchColor = (value) => {
        const key = String(value || '').trim().toLowerCase();
        if (isHexColor(key)) return normalizeHex(key);
        const quickMap = {
          white: '#FFFFFF',
          cyan: '#00F0FF',
          magenta: '#FF007F',
          green: '#3AFC13',
          yellow: '#FFEE00',
          purple: '#A072FF',
          orange: '#FF8C00',
          red: '#FF2B2B',
          blue: '#1F6FFF',
          gray: '#6B7280',
          brown: '#8B5A2B',
          black: '#111111',
          info: '#00F0FF',
          warning: '#FFEE00'
        };
        return quickMap[key] || '#00F0FF';
      };

      const syncSwatch = () => {
        if (!swatchEl) return;
        swatchEl.style.backgroundColor = resolveSwatchColor(select.value);
      };

      const nativePicker = document.createElement('input');
      nativePicker.type = 'color';
      nativePicker.className = 'd-none';
      nativePicker.value = '#00f0ff';

      paletteBtn.addEventListener('click', () => {
        const current = isHexColor(select.value) ? normalizeHex(select.value) : '#00f0ff';
        nativePicker.value = current;
        nativePicker.click();
      });

      nativePicker.addEventListener('input', () => {
        const picked = normalizeHex(nativePicker.value);
        if (!picked) return;
        select.dataset.pendingCustomColor = picked;
        if (swatchEl) {
          swatchEl.style.backgroundColor = picked;
          swatchEl.style.boxShadow = `0 0 8px ${picked}`;
        }
      });

      saveColorBtn.addEventListener('click', () => {
        const pending = normalizeHex(select.dataset.pendingCustomColor || '');
        if (!pending) {
          alert('? Primero elige un color con [ ?? PALETA ].');
          return;
        }

        const colorName = String(customNameInput.value || '').trim() || 'CUSTOM';

        addColorToPersistentPalette(pending, colorName);
        injectStoredColorsIntoAllModalColorSelects();
        select.value = pending;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        customNameInput.value = '';
      });

      removeColorBtn.addEventListener('click', () => {
        const targetHex = pickCustomColorToDelete();
        if (!targetHex) return;
        const deleted = removeColorFromPersistentPalette(targetHex);
        if (!deleted) {
          alert('? No se pudo eliminar ese color custom.');
          return;
        }
        refreshCustomOptionsFromStorage();
      });

      select.addEventListener('change', syncSwatch);
      syncSwatch();

      select.insertAdjacentElement('afterend', paletteBtn);
      paletteBtn.insertAdjacentElement('afterend', customNameInput);
      customNameInput.insertAdjacentElement('afterend', saveColorBtn);
      saveColorBtn.insertAdjacentElement('afterend', removeColorBtn);
      removeColorBtn.insertAdjacentElement('afterend', nativePicker);
    });
  }

  enhanceModalColorPickers();

  const MODAL_PALETTE_STORAGE_KEY = 'bunker_admin_modal_palette';
  const MODAL_PALETTE_CLASSES = ['palette-cyan', 'palette-magenta', 'palette-amber', 'palette-lime'];
  const MODAL_PALETTES = [
    { id: 'cyan', className: 'palette-cyan', color: '#00f0ff', label: 'CYAN' },
    { id: 'magenta', className: 'palette-magenta', color: '#ff3d9a', label: 'MAGENTA' },
    { id: 'amber', className: 'palette-amber', color: '#ffb347', label: 'AMBER' },
    { id: 'lime', className: 'palette-lime', color: '#86ff4d', label: 'LIME' }
  ];

  function applyPaletteToAllModals(paletteId) {
    const selected = MODAL_PALETTES.find((item) => item.id === paletteId) || MODAL_PALETTES[0];

    document.querySelectorAll('.bitacora-skin-modal').forEach((modal) => {
      MODAL_PALETTE_CLASSES.forEach((className) => modal.classList.remove(className));
      modal.classList.add(selected.className);
    });

    document.querySelectorAll('.modal-palette-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.paletteId === selected.id);
    });

    localStorage.setItem(MODAL_PALETTE_STORAGE_KEY, selected.id);
  }

  function initModalPaletteSwitcher() {
    const savedPalette = localStorage.getItem(MODAL_PALETTE_STORAGE_KEY) || 'cyan';

    document.querySelectorAll('.bitacora-skin-modal').forEach((modalEl) => {
      if (!modalEl || modalEl.querySelector('.modal-palette-switcher-inline')) return;

      const modalHeader = modalEl.querySelector('.modal-header');
      const modalTitle = modalEl.querySelector('.modal-title');
      if (!modalHeader || !modalTitle) return;

      const switcher = document.createElement('div');
      switcher.className = 'modal-palette-switcher-inline';

      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'd-flex align-items-center gap-1';

      MODAL_PALETTES.forEach((palette, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'modal-palette-chip';
        chip.style.background = palette.color;
        chip.style.animationDelay = `${idx * 0.12}s`;
        chip.title = palette.label;
        chip.dataset.paletteId = palette.id;
        chip.setAttribute('aria-label', `Cambiar paleta a ${palette.label}`);
        chip.addEventListener('click', () => applyPaletteToAllModals(palette.id));
        chipsWrap.appendChild(chip);
      });

      switcher.appendChild(chipsWrap);
      modalTitle.insertAdjacentElement('afterend', switcher);
    });

    applyPaletteToAllModals(savedPalette);
  }

  initModalPaletteSwitcher();

  const colorMap = {
    white: '#ffffff',
    cyan: '#00f0ff',
    magenta: '#ff007f',
    green: '#3afc13',
    yellow: '#ffee00',
    purple: '#a072ff',
    orange: '#ff8c00',
    red: '#ff2b2b',
    blue: '#1f6fff',
    gray: '#6b7280',
    brown: '#8b5a2b',
    black: '#111111',
    info: '#00f0ff',
    warning: '#ffee00',
    'bg-neon-cyan': '#00f0ff',
    'bg-neon-magenta': '#ff3d9a',
    'btn-purple': '#a072ff',
    'bg-purple': '#7e55ff',
    'bg-dark': '#d5d9e4',
    'bg-gold': '#ffd166',
    'bg-info': '#31d6ff'
  };

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return null;
    const int = Number.parseInt(normalized.slice(1), 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255
    };
  }

  function getContrastTextColor(backgroundHex) {
    const rgb = hexToRgb(backgroundHex);
    if (!rgb) return '#ffffff';
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.55 ? '#10151f' : '#f5f9ff';
  }

  function getReadablePreviewColor(colorValue) {
    const value = String(colorValue || '').toLowerCase();
    if (isHexColor(value)) return normalizeHex(value);
    return colorMap[value] || '#ffffff';
  }

  function setupColorPreview(selectId, previewId) {
    const sel = document.getElementById(selectId);
    const prev = document.getElementById(previewId);
    if (!sel || !prev) return;
    const update = () => {
      const c = getReadablePreviewColor(sel.value);
      const contrast = getContrastTextColor(c);
      prev.style.backgroundColor = c;
      prev.style.color = contrast;
      prev.style.borderColor = c;
      prev.style.textShadow = 'none';
      prev.style.boxShadow = `0 0 8px ${c}`;
    };
    sel.addEventListener('change', update);
    update();
  }

  setupColorPreview('lib-color-titulo', 'preview-lib-color-titulo');
  setupColorPreview('lib-color-autor', 'preview-lib-color-autor');
  setupColorPreview('lib-color-genero', 'preview-lib-color-genero');
  setupColorPreview('lib-color-resena', 'preview-lib-color-resena');
  setupColorPreview('lib-color-puntuacion', 'preview-lib-color-puntuacion');
  setupColorPreview('lib-color-hype', 'preview-lib-color-hype');
  setupColorPreview('cita-color-texto', 'preview-cita-color-texto');
  setupColorPreview('cita-color-autor', 'preview-cita-color-autor');
  setupColorPreview('cita-color-label', 'preview-cita-color-label');
  setupColorPreview('cita-color-nota', 'preview-cita-color-nota');

  setupColorPreview('ent-color-nombre', 'preview-ent-color-nombre');
  setupColorPreview('ent-color-obra', 'preview-ent-color-obra');
  setupColorPreview('ent-color-resena', 'preview-ent-color-resena');
  setupColorPreview('ent-color-social', 'preview-ent-color-social');

  setupColorPreview('game-color-titulo', 'preview-game-color-titulo');
  setupColorPreview('emote-color', 'preview-emote-color');

  // 5. Function to load interviews dynamically
  async function cargarEntrevistas() {
    const container = document.getElementById("contenedor-entrevistas");
    if (!container) return;

    try {
      const response = await fetch("/api/entrevistas");
      if (!response.ok) throw new Error("API_ERROR");
      const interviews = await response.json();

      container.innerHTML = "";
      if (interviews.length === 0) {
        container.innerHTML = `<div class="col-12 text-center text-white-50 font-monospace py-4">[ NO_INTERVIEW_RECORDS_FOUND ]</div>`;
        return;
      }

      interviews.forEach(ent => {
        const colorNombre = ent.colorNombre || 'warning';
        const nameColorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorNombre)
          ? `text-neon-${colorNombre}`
          : `text-${colorNombre}`;

        const colorObra = ent.colorObra || 'primary';
        const obraClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorObra)
          ? `text-neon-${colorObra}`
          : `text-${colorObra}`;

        const colorResumen = ent.colorResumen || 'white';
        const resumenClass = colorResumen === 'white' ? 'text-light' : `text-neon-${colorResumen}`;

        const colorSocial = ent.colorSocial || 'cyan';
        const btnSocialClass = `btn-gaming-action-${colorSocial}`;

        // Check YouTube video ID vs full URL
        let embedUrl = ent.videoUrl;
        if (embedUrl && !embedUrl.includes("http")) {
          embedUrl = `https://www.youtube.com/embed/${embedUrl}`;
        }

        const cardHTML = `
          <div class="col-xl-11 my-5">
            <div class="card card-gaming-author border-0 h-100 overflow-hidden">
              <div class="row g-0 h-100">
                <!-- Izquierda: Vídeo de YouTube Incrustado -->
                <div class="col-md-6 video-gaming-container">
                  <div class="ratio ratio-16x9 h-100 min-h-video">
                    <iframe src="${embedUrl}" title="Entrevista ${ent.nombre}" allowfullscreen></iframe>
                  </div>
                </div>

                <!-- Derecha: Datos del Autor (Estilo Selección de Personaje) -->
                <div class="col-md-6 d-flex flex-column justify-content-between p-4 bg-black-card position-relative">
                  <div class="gaming-corner-top"></div>
                  ${isAdmin ? `<button class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-interview" data-id="${ent.id}" style="position: absolute; top: 10px; right: 10px; z-index: 10; font-size: 0.62rem; padding: 2px 6px;">[ EDITAR ]</button>` : ''}

                  <div>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="text-neon-cyan small fw-bold tracking-widest">[ SQUAD: ${ent.squad || 'WRITER'} ]</span>
                      <span class="badge bg-dark border border-secondary text-light-subtle text-xs">LVL ${ent.level || '99'}</span>
                    </div>

                    <h3 class="${nameColorClass} text-uppercase mb-1 tracking-wide">
                      ${ent.nombre}
                    </h3>
                    <h6 class="${obraClass} mb-3 italic">
                      Obra: "${ent.obra}"
                    </h6>

                    <p class="small ${resumenClass} line-height-gaming">
                      "${ent.resumen}"
                    </p>
                  </div>

                  <!-- Red Social / Enlace Estilo Botón de Acción Coaxial -->
                  <div class="mt-3 pt-3 border-top border-gaming-divider">
                    <a href="${ent.socialUrl}" target="_blank"
                      class="btn ${btnSocialClass} w-100 text-uppercase fw-bold rounded-0 d-flex justify-content-between align-items-center px-3">
                      <span><i class="bi bi-tiktok me-2"></i> ${ent.socialUser}</span>
                      <i class="bi bi-chevron-right fs-5"></i>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        container.innerHTML += cardHTML;
      });
    } catch (error) {
      console.error("Error loading interviews:", error);
    }
  }

  // Function to load games dynamically
  async function cargarJuegos() {
    const container = document.getElementById("contenedor-juegos");
    if (!container) return;

    try {
      const response = await fetch("/api/juegos");
      if (!response.ok) throw new Error("API_ERROR");
      const games = await response.json();

      container.innerHTML = "";
      if (games.length === 0) {
        container.innerHTML = `<div class="col-12 text-center text-white-50 font-monospace py-4">[ NO_GAME_RECORDS_FOUND ]</div>`;
        return;
      }

      games.forEach(juego => {
        const colorTitulo = juego.tituloColor || 'magenta';
        const titleColorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorTitulo)
          ? `text-neon-${colorTitulo}`
          : `text-${colorTitulo}`;

        const colorBadge = juego.badgeColor || 'cyan';
        const badgeColorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorBadge)
          ? `text-neon-${colorBadge}`
          : `text-${colorBadge}`;

        const colorProgress = juego.progressColor || 'magenta';
        const progressColorClass = ['cyan','magenta','green','yellow','purple','orange','red','blue','gray','brown','black'].includes(colorProgress)
          ? `bg-neon-${colorProgress}`
          : `bg-${colorProgress}`;

        const defaultCover = "/assets/images/cyberpunk.jpg";
        const coverImg = juego.imagen || defaultCover;

        const cardHTML = `
          <div class="col-md-6 col-xl-4">
            <div class="card card-gaming-hub h-100 border-0 overflow-hidden position-relative">
              ${isAdmin ? `
                    <button class="btn btn-outline-info font-monospace btn-edit-game" 
                      data-id="${juego.id}" 
                      style="position: absolute; top: 10px; left: 110px; z-index: 10; background: rgba(0,0,0,0.85); border-radius: 0; font-size: 0.65rem; padding: 2px 5px; border-color: rgba(13,202,240,0.5);">
                [ EDITAR ]
                    </button>
              <button class="btn btn-outline-danger font-monospace btn-delete-game" 
                      data-id="${juego.id}" 
                      style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(0,0,0,0.85); border-radius: 0; font-size: 0.65rem; padding: 2px 5px; border-color: rgba(220,53,69,0.5);">
                [ ELIMINAR ]
              </button>
              ` : ''}

              <div class="position-relative gaming-img-wrapper">
                <img src="${coverImg}" class="card-img-top img-gaming-cover" alt="${juego.titulo}" />
                <span class="badge position-absolute top-0 end-0 m-3 bg-blur-gaming ${badgeColorClass}">${juego.badgeTexto || 'PLAYING'}</span>
              </div>
              <div class="card-body p-4 d-flex flex-column justify-content-between">
                <div>
                  <h4 class="fw-black ${titleColorClass} text-uppercase mb-2 tracking-wide">
                    ${juego.titulo}
                  </h4>
                  <p class="small text-light mb-4">
                    ${juego.descripcion}
                  </p>
                </div>

                <div class="gaming-stats">
                  <div class="d-flex justify-content-between small ${titleColorClass} mb-1">
                    <span>Nivel de Vicio</span>
                    <span class="${titleColorClass} fw-bold">${juego.vicio || '50'}%</span>
                  </div>
                  <div class="progress progress-gaming mb-3">
                    <div class="progress-bar ${progressColorClass}" role="progressbar" style="width: ${juego.vicio || '50'}%;"></div>
                  </div>

                  <div class="d-flex justify-content-between text-xs text-light">
                    <span>Plataforma: <strong class="text-light">${juego.plataforma || 'PC'}</strong></span>
                    <span>Horas: <strong class="text-light">${juego.horas || '0h'}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        container.innerHTML += cardHTML;
      });

      // Bind delete events
      document.querySelectorAll(".btn-delete-game").forEach(btn => {
        btn.addEventListener("click", function(e) {
          e.preventDefault();
          if (!isAdmin) return;
          const gameId = this.getAttribute("data-id");
          if (!confirm("¿Eliminar este juego del registro?")) return;
          const code = prompt("INGRESE CÓDIGO DE ACCESO DE SEGURIDAD PARA ELIMINAR EL JUEGO:");
          if (code === "bunker2026") {
            eliminarJuego(gameId, code);
          } else if (code !== null) {
            alert("CÓDIGO DE ACCESO INCORRECTO. ACCESO DENEGADO.");
          }
        });
      });

    } catch (error) {
      console.error("Error loading games:", error);
    }
  }

  // Helper to delete game
  async function eliminarJuego(id, password) {
    try {
      const response = await fetch("/api/juegos/eliminar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, password })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "FAIL_DELETION");
      }

      const data = await response.json();
      if (data.success) {
        console.log(`[SYS]: ${data.message}`);
        logTerminal.textContent = `> ${data.message}`;
        cargarJuegos();
        cargarLogsYVisores();
      }
    } catch (error) {
      console.error("Error deleting game:", error);
      alert(`ERROR AL ELIMINAR: ${error.message}`);
      logTerminal.textContent = `> ERR: Purge operation failed on game register.`;
    }
  }

  // Event delegation for deleting books in the library
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-delete-book");
    if (!btn) return;
    e.preventDefault();
    if (!isAdmin) return;

    const bookId = btn.getAttribute("data-id");
    if (!bookId) return;

    if (!confirm("¿Está seguro de que desea eliminar este libro del registro?")) return;

    const code = prompt("INGRESE CÓDIGO DE ACCESO DE SEGURIDAD PARA ELIMINAR EL LIBRO:");
    if (code === "bunker2026") {
      try {
        const response = await fetch("/api/biblioteca/eliminar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ id: bookId, password: code })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "FAIL_DELETION");
        }

        const data = await response.json();
        console.log(`[SYS]: ${data.message}`);
        logTerminal.textContent = `> ${data.message}`;

        // Re-load current active cartridge in library
        const activeCartridge = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
        if (activeCartridge) {
          cargarFicheroBinario(activeCartridge.getAttribute("data-target"), activeCartridge);
        }
        cargarLogsYVisores();
      } catch (err) {
        console.error("Error deleting book:", err);
        alert(`ERROR AL ELIMINAR: ${err.message}`);
        logTerminal.textContent = `> ERR: Purge operation failed on library register.`;
      }
    } else if (code !== null) {
      alert("CÓDIGO DE ACCESO INCORRECTO. ACCESO DENEGADO.");
    }
  });

  // Event delegation for deleting quotes in the library
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-delete-quote");
    if (!btn) return;
    e.preventDefault();
    if (!isAdmin) return;

    const quoteId = btn.getAttribute("data-id");
    if (!quoteId) return;

    if (!confirm("¿Está seguro de que desea eliminar esta cita del registro?")) return;

    const code = prompt("INGRESE CÓDIGO DE ACCESO DE SEGURIDAD PARA ELIMINAR LA CITA:");
    if (code === "bunker2026") {
      try {
        const response = await fetch("/api/citas/eliminar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ id: quoteId, password: code })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "FAIL_DELETION");
        }

        const data = await response.json();
        console.log(`[SYS]: ${data.message}`);
        logTerminal.textContent = `> ${data.message}`;

        // Re-load current active cartridge in library (which should be citations)
        const activeCartridge = document.querySelector("#library-cartridge-selector .cartridge-btn.active");
        if (activeCartridge) {
          cargarFicheroBinario(activeCartridge.getAttribute("data-target"), activeCartridge);
        }
        cargarLogsYVisores();
      } catch (err) {
        console.error("Error deleting quote:", err);
        alert(`ERROR AL ELIMINAR: ${err.message}`);
        logTerminal.textContent = `> ERR: Purge operation failed on quote register.`;
      }
    } else if (code !== null) {
      alert("CÓDIGO DE ACCESO INCORRECTO. ACCESO DENEGADO.");
    }
  });

  async function cargarLibroParaEditar(bookId) {
    const response = await fetch("/api/biblioteca");
    if (!response.ok) throw new Error("No se pudo leer biblioteca");
    const libros = await response.json();
    const libro = libros.find(item => item.id === bookId);
    if (!libro) throw new Error("Libro no encontrado");

    const setVal = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? "";
    };

    setVal("lib-id-editar", libro.id);
    setEditModeBadgeState("lib-id-editar", "lib-edit-mode-badge");
    setVal("lib-titulo", libro.titulo || "");
    setVal("lib-color-titulo", libro.colorTitulo || "white");
    setVal("lib-autor", libro.autor || "");
    setVal("lib-color-autor", libro.colorAutor || "yellow");
    setVal("lib-genero", libro.genero || "");
    setVal("lib-color-genero", libro.colorGenero || "info");
    setVal("lib-estado", libro.estado || "leido");
    setVal("lib-puntuacion", libro.puntuacion ?? 5);
    setVal("lib-color-puntuacion", libro.colorPuntuacion || "yellow");
    setVal("lib-hype", libro.hype ?? 90);
    setVal("lib-color-hype", libro.colorHype || "yellow");
    setVal("lib-resena", libro.resena || "");
    setVal("lib-color-resena", libro.colorResena || "white");
    setVal("lib-cover", libro.cover || "");
    setVal("lib-link-wattpad", libro.linkWattpad || "");
    setVal("lib-link-amazon", libro.linkAmazon || "");
    setVal("lib-podio", libro.podio ?? "");

    const fav = document.getElementById("lib-favorito");
    if (fav) {
      fav.checked = !!libro.favorito;
      fav.dispatchEvent(new Event("change"));
    }

    const estado = document.getElementById("lib-estado");
    if (estado) {
      estado.dispatchEvent(new Event("change"));
    }

    const modalEl = document.getElementById("modal-nuevo-libro");
    if (modalEl) {
      showModalSafe(modalEl);
      document.getElementById("book-tab-btn")?.click();
    }
  }

  async function cargarCitaParaEditar(citaId) {
    const response = await fetch("/api/citas");
    if (!response.ok) throw new Error("No se pudo leer citas");
    const citas = await response.json();
    const cita = citas.find(item => item.id === citaId);
    if (!cita) throw new Error("Cita no encontrada");

    const setVal = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? "";
    };

    setVal("cita-id-editar", cita.id);
    setEditModeBadgeState("cita-id-editar", "cita-edit-mode-badge");
    setVal("cita-texto", cita.texto || "");
    setVal("cita-color-texto", cita.colorTexto || "white");
    setVal("cita-autor", cita.autor || "");
    setVal("cita-color-autor", cita.colorAutor || "cyan");
    setVal("cita-tipo", cita.tipo || "literaria");
    setVal("cita-label", cita.label || "");
    setVal("cita-color-label", cita.colorLabel || "cyan");
    setVal("cita-nota", cita.nota || "");
    setVal("cita-color-nota", cita.colorNota || "white");

    const modalEl = document.getElementById("modal-nuevo-libro");
    if (modalEl) {
      showModalSafe(modalEl);
      document.getElementById("quote-tab-btn")?.click();
    }
  }

  async function cargarEntrevistaParaEditar(id) {
    const response = await fetch("/api/entrevistas");
    if (!response.ok) throw new Error("No se pudo leer entrevistas");
    const entrevistas = await response.json();
    const ent = entrevistas.find(item => item.id === id);
    if (!ent) throw new Error("Entrevista no encontrada");

    const setVal = (elId, value) => {
      const el = document.getElementById(elId);
      if (el) el.value = value ?? "";
    };

    setVal("ent-id-editar", ent.id);
    setEditModeBadgeState("ent-id-editar", "ent-edit-mode-badge");
    setVal("ent-nombre", ent.nombre || "");
    setVal("ent-color-nombre", ent.colorNombre || "warning");
    setVal("ent-obra", ent.obra || "");
    setVal("ent-color-obra", ent.colorObra || "primary");
    setVal("ent-squad", ent.squad || "WRITER");
    setVal("ent-level", ent.level || 99);
    setVal("ent-resumen", ent.resumen || "");
    setVal("ent-color-resena", ent.colorResena || "white");
    setVal("ent-social-user", ent.socialUser || "");
    setVal("ent-social-url", ent.socialUrl || "");
    setVal("ent-color-social", ent.colorSocial || "cyan");
    setVal("ent-video", ent.videoUrl || "");

    const modalEl = document.getElementById("modal-nueva-entrevista");
    if (modalEl) {
      showModalSafe(modalEl);
    }
  }

  async function cargarJuegoParaEditar(id) {
    const response = await fetch("/api/juegos");
    if (!response.ok) throw new Error("No se pudo leer juegos");
    const juegos = await response.json();
    const juego = juegos.find(item => item.id === id);
    if (!juego) throw new Error("Juego no encontrado");

    const setVal = (elId, value) => {
      const el = document.getElementById(elId);
      if (el) el.value = value ?? "";
    };

    setVal("game-id-editar", juego.id);
    setEditModeBadgeState("game-id-editar", "game-edit-mode-badge");
    setVal("game-titulo", juego.titulo || "");
    setVal("game-color-titulo", juego.tituloColor || "magenta");
    setVal("game-badge-texto", juego.badgeTexto || "");
    setVal("game-color-badge", juego.badgeColor || "cyan");
    setVal("game-descripcion", juego.descripcion || "");
    setVal("game-vicio", juego.vicio || 80);
    setVal("game-color-progress", juego.progressColor || "magenta");
    setVal("game-plataforma", juego.plataforma || "");
    setVal("game-horas", juego.horas || "");
    setVal("game-imagen-actual", juego.imagen || "");
    setVal("game-imagen-file", "");

    const modalEl = document.getElementById("modal-nuevo-juego");
    if (modalEl) {
      showModalSafe(modalEl);
    }
  }

  async function cargarPostSocialParaEditar(red, id) {
    const response = await fetch("/api/redes");
    if (!response.ok) throw new Error("No se pudo leer redes");
    const data = await response.json();
    const post = (data[red] || []).find(item => item.id === id);
    if (!post) throw new Error("Post no encontrado");

    const redTipo = document.getElementById("red-tipo");
    if (redTipo) redTipo.value = red;
    const editInput = document.getElementById("red-id-editar");
    if (editInput) editInput.value = id;
    setEditModeBadgeState("red-id-editar", "red-edit-mode-badge");

    document.getElementById("ct-embed")?.click();
    const embedInput = document.getElementById("red-embed-html");
    if (embedInput) embedInput.value = post.embedHtml || "";

    const modalEl = document.getElementById("modal-nueva-red");
    if (modalEl) {
      showModalSafe(modalEl);
      cargarPreviewPosts();
    }
  }

  async function cargarEmoteParaEditar(id) {
    const response = await fetch('/api/emotes');
    if (!response.ok) throw new Error('No se pudo leer emotes');
    const emotes = await response.json();
    const emote = (Array.isArray(emotes) ? emotes : []).find(item => String(item.id || '') === String(id));
    if (!emote) throw new Error('Emote no encontrado');

    const setVal = (elId, value) => {
      const el = document.getElementById(elId);
      if (el) el.value = value ?? '';
    };

    setVal('emote-id-editar', emote.id || '');
    const emoteImageInput = document.getElementById('emote-image-file');
    if (emoteImageInput) emoteImageInput.value = '';
    setVal('emote-rarity', emote.rarity || 'SUB');
    setVal('emote-color', emote.color || 'bg-neon-cyan');
    setEditModeBadgeState('emote-id-editar', 'emote-edit-mode-badge');

    const modalEl = document.getElementById('modal-nuevo-emote');
    if (modalEl) {
      showModalSafe(modalEl);
      cargarPreviewEmotes();
    }
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-edit-book");
    if (!btn || !isAdmin) return;
    e.preventDefault();
    const id = btn.getAttribute("data-id");
    if (!id) return;
    try {
      await cargarLibroParaEditar(id);
    } catch (error) {
      alert(`ERROR AL CARGAR LIBRO: ${error.message}`);
    }
  });

  document.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit-emote');
    const deleteBtn = e.target.closest('.btn-delete-emote');

    if (editBtn && isAdmin) {
      e.preventDefault();
      const id = editBtn.getAttribute('data-id');
      if (!id) return;
      try {
        await cargarEmoteParaEditar(id);
      } catch (error) {
        alert(`ERROR AL CARGAR EMOTE: ${error.message}`);
      }
      return;
    }

    if (deleteBtn && isAdmin) {
      e.preventDefault();
      const id = deleteBtn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('¿Eliminar este emote del inventario?')) return;

      const password = document.getElementById('modal-password-emote')?.value || '';
      if (!password) {
        alert('¿Introduce el código de acceso primero?');
        return;
      }

      try {
        const response = await fetch('/api/emotes/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error eliminando emote');

        await cargarPreviewEmotes();
        await inicializarMarquesinaEmotes();
      } catch (error) {
        alert(`ERROR AL ELIMINAR EMOTE: ${error.message}`);
      }
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-edit-quote");
    if (!btn || !isAdmin) return;
    e.preventDefault();
    const id = btn.getAttribute("data-id");
    if (!id) return;
    try {
      await cargarCitaParaEditar(id);
    } catch (error) {
      alert(`ERROR AL CARGAR CITA: ${error.message}`);
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-edit-interview");
    if (!btn || !isAdmin) return;
    e.preventDefault();
    const id = btn.getAttribute("data-id");
    if (!id) return;
    try {
      await cargarEntrevistaParaEditar(id);
    } catch (error) {
      alert(`ERROR AL CARGAR ENTREVISTA: ${error.message}`);
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-edit-social");
    if (!btn || !isAdmin) return;
    e.preventDefault();
    const red = btn.getAttribute("data-red");
    const id = btn.getAttribute("data-id");
    if (!red || !id) return;
    try {
      await cargarPostSocialParaEditar(red, id);
    } catch (error) {
      alert(`ERROR AL CARGAR POST: ${error.message}`);
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-edit-game");
    if (!btn || !isAdmin) return;
    e.preventDefault();
    const id = btn.getAttribute("data-id");
    if (!id) return;
    try {
      await cargarJuegoParaEditar(id);
    } catch (error) {
      alert(`ERROR AL CARGAR JUEGO: ${error.message}`);
    }
  });

  // ============================================================
  // 📡 SOCIAL FEEDS - Embed/iframe rendering with bouncy badge
  // ============================================================

  async function cargarRedes() {
    const instagramContainer = document.getElementById("instagram-feed");
    const tiktokContainer = document.getElementById("tiktok-feed");
    const wattpadContainer = document.getElementById("wattpad-feed");
    const pinterestContainer = document.getElementById("pinterest-feed");

    if (!instagramContainer || !tiktokContainer || !wattpadContainer || !pinterestContainer) return;

    try {
      const response = await fetch("/api/redes");
      if (!response.ok) throw new Error("API_ERROR");
      const data = await response.json();

      const renderFeed = (container, items, networkClass, redKey) => {
        container.innerHTML = "";
        if (items && items.length > 0) {
          items.slice(0, 2).forEach((item, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "social-embed-wrapper position-relative mb-3";
            if (isAdmin) {
              wrapper.innerHTML += `<button type="button" class="btn btn-outline-info btn-sm rounded-0 text-uppercase font-monospace btn-edit-social" data-id="${item.id}" data-red="${redKey}" style="position:absolute; top: 8px; right: 8px; z-index: 20; font-size: 0.6rem; padding: 2px 5px;">[ EDITAR ]</button>`;
            }
            
            // Badge "¡NUEVO POST!" on the first (newest) item
            if (index === 0) {
              wrapper.innerHTML += `
                <span class="badge-nuevo-post">
                  <i class="bi bi-stars me-1"></i>¡NUEVO POST!
                </span>
              `;
            }

            // Render embed HTML or URL card
            if (item.embedHtml) {
              const embedContainer = document.createElement("div");
              embedContainer.className = "embed-content";
              const normalizedEmbedHtml = item.embedHtml
                .replace(/min-width\s*:\s*\d+px\s*;?/gi, "min-width:0 !important;")
                .replace(/max-width\s*:\s*\d+px\s*;?/gi, "max-width:100% !important;");
              embedContainer.innerHTML = normalizedEmbedHtml;
              wrapper.appendChild(embedContainer);
            } else if (item.url) {
              wrapper.innerHTML += `
                <a href="${item.url}" target="_blank" class="social-url-card d-block text-decoration-none p-3 ${networkClass}">
                  <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-box-arrow-up-right text-neon-cyan"></i>
                    <span class="text-white small font-monospace text-truncate">${item.url}</span>
                  </div>
                </a>
              `;
            } else {
              // Fallback for old-format entries (imagen, texto, likes...)
              wrapper.innerHTML += `
                <div class="card social-feed-card border-0 text-white font-monospace">
                  ${item.imagen ? `<div class="social-img-wrapper"><img src="${item.imagen}" alt="Post"></div>` : ''}
                  <div class="card-body p-3">
                    ${item.fecha ? `<p class="text-xs text-white-50 mb-2">${item.fecha}</p>` : ''}
                    ${item.titulo ? `<h6 class="text-warning text-uppercase fw-bold mb-2" style="font-size: 0.85rem;">${item.titulo}</h6>` : ''}
                    ${item.texto ? `<p class="small text-light mb-3" style="font-size: 0.8rem; line-height: 1.3;">${item.texto}</p>` : ''}
                  </div>
                </div>
              `;
            }
            container.appendChild(wrapper);
          });
        } else {
          container.innerHTML = `<div class="text-center text-white-50 font-monospace py-4">[ FEED_EMPTY ]</div>`;
        }
      };

      renderFeed(instagramContainer, data.instagram, "url-card-instagram", "instagram");
      renderFeed(tiktokContainer, data.tiktok, "url-card-tiktok", "tiktok");
      renderFeed(wattpadContainer, data.wattpad, "url-card-wattpad", "wattpad");
      renderFeed(pinterestContainer, data.pinterest, "url-card-pinterest", "pinterest");

      // Process embed scripts after DOM injection
      procesarEmbedsExternos();

    } catch (error) {
      console.error("Error loading social feeds:", error);
    }
  }

  // Load external embed scripts (Instagram, TikTok)
  function procesarEmbedsExternos() {
    // Instagram
    if (document.querySelector('.instagram-media')) {
      if (window.instgrm) {
        window.instgrm.Embeds.process();
      } else {
        const igScript = document.createElement('script');
        igScript.src = '//www.instagram.com/embed.js';
        igScript.async = true;
        document.body.appendChild(igScript);
      }
    }
    // TikTok
    if (document.querySelector('.tiktok-embed, [data-tiktok]')) {
      if (typeof window.tiktokEmbedLoad === 'function') {
        window.tiktokEmbedLoad();
      } else if (!document.querySelector('script[src*="tiktok.com/embed"]')) {
        const tkScript = document.createElement('script');
        tkScript.src = 'https://www.tiktok.com/embed.js';
        tkScript.async = true;
        document.body.appendChild(tkScript);
      } else {
        // Force re-processing when embeds are re-rendered dynamically.
        const tkReloadScript = document.createElement('script');
        tkReloadScript.src = `https://www.tiktok.com/embed.js?reload=${Date.now()}`;
        tkReloadScript.async = true;
        document.body.appendChild(tkReloadScript);
      }
    }
  }

  // ============================================================
  // 🔐 MODAL REDES SOCIALES - Ctrl + Shift + R
  // ============================================================

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (isTypingContext(e.target)) return;
    if (matchesAdminShortcut(e, "r")) {
      e.preventDefault();
      requestAdminAccess(
        () => openAdminModal("modal-nueva-red", "modal-password-red", () => cargarPreviewPosts()),
        "INGRESE CÓDIGO DE ACCESO DE SEGURIDAD DEL BÚNKER (REDES):"
      );
    }
  });

  // Content type toggle (Embed <-> URL)
  document.querySelectorAll('input[name="content-type-red"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      const campoEmbed = document.getElementById("campo-embed");
      const campoUrl = document.getElementById("campo-url");
      if (e.target.value === "embed") {
        campoEmbed.classList.remove("d-none");
        campoUrl.classList.add("d-none");
      } else {
        campoEmbed.classList.add("d-none");
        campoUrl.classList.remove("d-none");
      }
    });
  });

  // Load current posts preview in modal
  async function cargarPreviewPosts() {
    const previewContainer = document.getElementById("red-posts-preview");
    if (!previewContainer) return;

    try {
      const response = await fetch("/api/redes");
      const data = await response.json();
      
      let html = '';
      const redes = ['instagram', 'tiktok', 'wattpad', 'pinterest'];
      const icons = {
        instagram: 'bi-instagram text-neon-magenta',
        tiktok: 'bi-tiktok text-neon-cyan',
        wattpad: 'bi-book-half text-warning',
        pinterest: 'bi-pinterest text-danger'
      };

      redes.forEach(red => {
        const posts = data[red] || [];
        html += `<div class="mb-3">
          <div class="d-flex align-items-center gap-2 mb-2">
            <i class="bi ${icons[red]}"></i>
            <span class="text-white text-uppercase fw-bold" style="font-size: 0.75rem;">${red} (${posts.length}/2)</span>
          </div>`;
        
        if (posts.length === 0) {
          html += `<div class="ps-4 text-white-50" style="font-size: 0.7rem;">[ SIN_POSTS ]</div>`;
        } else {
          posts.forEach((post, idx) => {
            const fecha = post.createdAt ? new Date(post.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const preview = post.embedHtml 
              ? (post.embedHtml.substring(0, 80) + '...') 
              : (post.url || 'Contenido legacy');
            html += `
              <div class="d-flex justify-content-between align-items-start ps-4 mb-2 py-1 border-start border-secondary border-opacity-25">
                <div style="font-size: 0.7rem; max-width: 80%;">
                  <div class="text-white">${idx === 0 ? '<span class="badge bg-info bg-opacity-25 text-info me-1" style="font-size: 0.6rem;">ÚLTIMO</span>' : ''}${fecha}</div>
                  <div class="text-white-50 text-truncate" style="max-width: 350px;">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </div>
                <button class="btn btn-outline-danger btn-sm px-2 py-0 border-0 delete-post-btn" data-red="${red}" data-id="${post.id}" style="font-size: 0.65rem;">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>`;
          });
        }
        html += `</div>`;
      });

      previewContainer.innerHTML = html;

      // Attach delete handlers
      previewContainer.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const red = btn.dataset.red;
          const id = btn.dataset.id;
          const password = document.getElementById('modal-password-red').value;

          if (!password) {
            alert('⚠ Introduce el código de acceso primero.');
            return;
          }

          if (!confirm(`¿Eliminar este post de ${red.toUpperCase()}?`)) return;

          try {
            const res = await fetch(`/api/redes/eliminar/${red}/${id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password })
            });
            const result = await res.json();
            if (res.ok) {
              cargarPreviewPosts();
              cargarRedes();
            } else {
              alert('❌ ' + (result.error || 'Error desconocido.'));
            }
          } catch (err) {
            alert('❌ Error de conexión.');
          }
        });
      });

    } catch (error) {
      previewContainer.innerHTML = '<div class="text-center text-danger py-2">[ ERROR_LOADING ]</div>';
    }
  }

  // Form submit handler
  const formRed = document.getElementById("form-nueva-red");
  if (formRed) {
    formRed.addEventListener("submit", function (e) {
      e.preventDefault();

      const password = document.getElementById("modal-password-red").value;
      const red = document.getElementById("red-tipo").value;
      const editId = (document.getElementById("red-id-editar")?.value || "").trim();
      const contentType = document.querySelector('input[name="content-type-red"]:checked').value;

      const fileInput = document.getElementById("red-image-file");
      const file = fileInput ? fileInput.files[0] : null;

      const submitData = async (imageData = null, imageFileName = null) => {
        let embedHtml = '';

        if (contentType === 'embed') {
          embedHtml = document.getElementById("red-embed-html").value.trim();
          if (!embedHtml) {
            alert('⚠ Pega el código embed/HTML.');
            return;
          }
        } else {
          const url = document.getElementById("red-url").value.trim();
          const imageUrlText = document.getElementById("red-image-url").value.trim();
          
          if (!url) {
            alert('⚠ Introduce la URL del post.');
            return;
          }

          // Si hay archivo, usamos el placeholder para que el backend lo reemplace.
          // Si no, usamos el texto de la URL de imagen (si hay).
          let imageUrl = '';
          if (file) {
            imageUrl = '__IMAGE_PLACEHOLDER__';
          } else if (imageUrlText) {
            imageUrl = imageUrlText;
          }

          let imageHtml = '';
          if (imageUrl) {
            imageHtml = `<div class="social-post-image-wrapper mb-2" style="max-height: 250px; overflow: hidden; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
              <img src="${imageUrl}" alt="Post preview" class="img-fluid w-100" style="object-fit: cover; max-height: 250px;">
            </div>`;
          }

          // Wrap URL in an styled anchor card with image preview above
          embedHtml = `<a href="${url}" target="_blank" class="social-url-card d-block text-decoration-none p-3">
            ${imageHtml}
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-box-arrow-up-right text-neon-cyan"></i>
              <span class="small font-monospace text-truncate text-white-50">${url}</span>
            </div>
            <div class="mt-2 text-xs text-neon-cyan">Haz click para ver el post →</div>
          </a>`;
        }

        if (!password) {
          alert('⚠ Introduce el código de acceso.');
          return;
        }

        try {
          const endpoint = editId ? `/api/redes/editar/${red}/${editId}` : '/api/redes/nuevo';
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              red, 
              embedHtml, 
              password, 
              imageFileData: imageData, 
              imageFileName: imageFileName 
            })
          });
          const result = await res.json();
          if (res.ok) {
            // Clear fields
            document.getElementById("red-embed-html").value = '';
            document.getElementById("red-url").value = '';
            if (fileInput) fileInput.value = '';
            document.getElementById("red-image-url").value = '';
            const inputEditId = document.getElementById("red-id-editar");
            if (inputEditId) inputEditId.value = '';
            setEditModeBadgeState("red-id-editar", "red-edit-mode-badge");

            // Refresh preview and feed
            cargarPreviewPosts();
            cargarRedes();
            const modalEl = document.getElementById("modal-nueva-red");
            if (modalEl) {
              hideModalSafe(modalEl);
            }
            alert('✅ ' + result.message);
          } else {
            alert('❌ ' + (result.error || 'Error desconocido.'));
          }
        } catch (err) {
          alert('❌ Error de conexión con el servidor.');
        }
      };

      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          submitData(event.target.result, file.name);
        };
        reader.onerror = function (error) {
          console.error("Error reading file:", error);
          alert("Error leyendo el archivo de imagen.");
        };
        reader.readAsDataURL(file);
      } else {
        submitData();
      }
    });
  }

  const formNuevoEmote = document.getElementById('form-nuevo-emote');
  if (formNuevoEmote) {
    formNuevoEmote.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = (document.getElementById('emote-id-editar')?.value || '').trim();
      const rarity = (document.getElementById('emote-rarity')?.value || '').trim().toUpperCase();
      const color = (document.getElementById('emote-color')?.value || 'bg-neon-cyan').trim();
      const password = document.getElementById('modal-password-emote')?.value || '';
      const fileInput = document.getElementById('emote-image-file');
      const selectedFile = fileInput && fileInput.files ? fileInput.files[0] : null;
      const isEdit = Boolean(id);

      if (!rarity || !password) {
        alert('? Completa rareza y password.');
        return;
      }

      if (!isEdit && !selectedFile) {
        alert('? Debes subir una imagen desde tu PC para crear el emote.');
        return;
      }

      const submitEmote = async (imageFileData, imageFileName) => {
        const payload = {
          id: id || undefined,
          rarity,
          color,
          password,
          imageFileData: imageFileData || undefined,
          imageFileName: imageFileName || undefined
        };

        const endpoint = isEdit ? '/api/emotes/editar' : '/api/emotes/nuevo';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error guardando emote');

        formNuevoEmote.reset();
        const inputEdit = document.getElementById('emote-id-editar');
        if (inputEdit) inputEdit.value = '';
        setEditModeBadgeState('emote-id-editar', 'emote-edit-mode-badge');

        await cargarPreviewEmotes();
        await inicializarMarquesinaEmotes();
      };

      try {
        if (selectedFile) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              await submitEmote(event.target.result, selectedFile.name);
            } catch (error) {
              alert(`ERROR: ${error.message}`);
            }
          };
          reader.onerror = () => {
            alert('ERROR: no se pudo leer la imagen seleccionada.');
          };
          reader.readAsDataURL(selectedFile);
        } else {
          await submitEmote();
        }
      } catch (error) {
        alert(`ERROR: ${error.message}`);
      }
    });
  }

  // Inicialización de logs en carga
  cargarLogsYVisores(true);

  // Auto-sync del monitor de estado para reflejar cambios hechos en cualquier pestaña/sesión.
  setInterval(() => {
    cargarLogsYVisores();
  }, 8000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      cargarLogsYVisores(true);
    }
  });
  cargarEntrevistas();
  cargarJuegos();
  cargarRedes();
  cargarPreviewEmotes();

  // Ejecutamos la carga inicial
  inicializarMarquesinaEmotes();

  // 🍪 Gestión del Banner de Cookies Cyberpunk
  const cookieBanner = document.getElementById("cookie-banner");
  const acceptCookiesBtn = document.getElementById("accept-cookies");
  if (cookieBanner && acceptCookiesBtn) {
    if (!localStorage.getItem("cookieConsent")) {
      // Retrasar la aparición del banner 1.5s para que no interrumpa el efecto de carga inicial
      setTimeout(() => {
        cookieBanner.classList.remove("d-none");
      }, 1500);
    }
    acceptCookiesBtn.addEventListener("click", () => {
      localStorage.setItem("cookieConsent", "accepted");
      cookieBanner.classList.add("d-none");
    });
  }
});


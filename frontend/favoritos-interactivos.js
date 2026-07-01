document.addEventListener("DOMContentLoaded", () => {
  
  // ==========================================
  // MODULE 1: SCRAPING DE PÁGINAS ESTÁTICAS
  // ==========================================
  const configuracionFavoritos = [
    {
      url: "/api/series",
      selectorFooter: "#favoritos-footer .fav-link-magenta",
      key: "titulo"
    },
    {
      url: "/api/peliculas",
      selectorFooter: "#favoritos-footer .fav-link-cyan",
      key: "titulo"
    },
    {
      url: "/api/personajes",
      selectorFooter: "#favoritos-footer .fav-link-warning",
      key: "nombre"
    }
  ];

  async function sincronizarSeccion(config) {
    try {
      const enlacesFooter = document.querySelectorAll(config.selectorFooter);
      if (enlacesFooter.length === 0) return;

      const response = await fetch(config.url);
      if (!response.ok) throw new Error(`No se pudo acceder a ${config.url}`);
      
      const items = await response.json();
      const titulosReales = items.map(item => item[config.key]);

      enlacesFooter.forEach((enlace, index) => {
        if (titulosReales[index]) {
          enlace.innerHTML = `<i class="bi bi-chevron-right"></i> ${titulosReales[index]}`;
          if (enlace.parentElement) enlace.parentElement.style.display = "";
        } else {
          if (enlace.parentElement) enlace.parentElement.style.display = "none";
        }
      });

    } catch (error) {
      console.warn(`[SYSTEM_ERROR] Fallo en sincronización de ${config.url}:`, error);
    }
  }

  // Ejecutar sincronización para Series, Pelis y Personajes
  configuracionFavoritos.forEach(seccion => {
    sincronizarSeccion(seccion);
  });
})
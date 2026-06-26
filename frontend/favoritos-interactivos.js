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


// ==========================================
// MODULE 2: ENLACE DINÁMICO CON BACKEND API
// ==========================================
async function sincronizarAlbumesFooter() {
  try {
    const enlacesMusica = document.querySelectorAll("#favoritos-footer .fav-link-purple");
    if (enlacesMusica.length === 0) return;

    const response = await fetch("/api/playlist");
    if (!response.ok) throw new Error("Fallo al conectar con /api/playlist");
    
    const playlist = await response.json();

    let albumesReales = [];
    if (Array.isArray(playlist)) {
      // Recorremos la raíz de la playlist y extraemos directamente el título principal
      playlist.forEach(album => {
        if (album.title) {
          albumesReales.push(album.title);
        }
      });
    }

    // Inyectamos los nombres de los álbumes raíces en los enlaces morados del footer
    enlacesMusica.forEach((enlace, index) => {
      if (albumesReales[index]) {
        enlace.innerHTML = `<i class="bi bi-chevron-right"></i> ${albumesReales[index]}`;
        if (enlace.parentElement) enlace.parentElement.style.display = "";
      } else {
        if (enlace.parentElement) enlace.parentElement.style.display = "none";
      }
    });

  } catch (error) {
    console.warn("[SYSTEM_ERROR] Fallo al sincronizar álbumes desde API:", error);
  }
}


// Ejecutar carga de álbumes desde el servidor
sincronizarAlbumesFooter();
})
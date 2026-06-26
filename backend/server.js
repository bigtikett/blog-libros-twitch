import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const DATA_DIR = path.join(__dirname, 'data');
const AUDIO_DIR = path.join(FRONTEND_DIR, 'audio');
const IMG_BIBLIOTECA_DIR = path.join(FRONTEND_DIR, 'img', 'biblioteca');
const IMG_FAVORITOS_DIR = path.join(FRONTEND_DIR, 'img', 'favoritos');

fs.mkdirSync(DATA_DIR, { recursive: true });

const RUTA_BIBLIOTECA = path.join(DATA_DIR, 'biblioteca.json');
const RUTA_CITAS = path.join(DATA_DIR, 'citas.json');
const RUTA_LOGS = path.join(DATA_DIR, 'logs.json');
const RUTA_SERIES = path.join(DATA_DIR, 'series.json');
const RUTA_PELICULAS = path.join(DATA_DIR, 'peliculas.json');
const RUTA_PERSONAJES = path.join(DATA_DIR, 'personajes.json');
const RUTA_ENTREVISTAS = path.join(DATA_DIR, 'entrevistas.json');
const RUTA_JUEGOS = path.join(DATA_DIR, 'juegos.json');
const RUTA_REDES = path.join(DATA_DIR, 'redes.json');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS bloqueado para este origen'));
  }
}));

app.use(express.static(FRONTEND_DIR));
app.use('/audio', express.static(AUDIO_DIR));

// Hacemos accesible la carpeta donde guardarás las portadas de los libros
app.use('/img/biblioteca', express.static(IMG_BIBLIOTECA_DIR));
app.use('/img/favoritos', express.static(IMG_FAVORITOS_DIR));
// Middleware para que Express pueda entender datos enviados en formato JSON desde formularios
app.use(express.json({ limit: '10mb' }));

const BIBLIOTECA_PASSWORD = 'bunker2026';

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'bunker-backend' });
});

// 1. ENDPOINT PARA LEER LOS LIBROS (FETCH GET)
app.get('/api/biblioteca', (req, res) => {
  if (!fs.existsSync(RUTA_BIBLIOTECA)) {
    fs.writeFileSync(RUTA_BIBLIOTECA, JSON.stringify([])); // Crea el archivo vacío si no existe
  }
  const datos = fs.readFileSync(RUTA_BIBLIOTECA, 'utf-8');
  res.json(JSON.parse(datos));
});

// 2. ENDPOINT PARA AÑADIR UN NUEVO LIBRO (FETCH POST)
app.post('/api/biblioteca/nuevo', (req, res) => {
  try {
    const nuevoLibro = req.body; // Captura los datos del formulario de la web
    
    // Validamos la contraseña de seguridad
    if (nuevoLibro.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    // Leemos lo que ya hay guardado
    const datosActuales = fs.existsSync(RUTA_BIBLIOTECA) 
      ? JSON.parse(fs.readFileSync(RUTA_BIBLIOTECA, 'utf-8')) 
      : [];
    
    // Procesamos la subida del archivo si viene en base64
    if (nuevoLibro.coverFileData && nuevoLibro.coverFileName) {
      const base64Data = nuevoLibro.coverFileData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const dirPortadas = IMG_BIBLIOTECA_DIR;
      if (!fs.existsSync(dirPortadas)) {
        fs.mkdirSync(dirPortadas, { recursive: true });
      }
      
      // Sanitizamos el nombre de archivo y le añadimos timestamp para evitar colisiones
      const extension = path.extname(nuevoLibro.coverFileName) || '.jpg';
      const nombreLimpio = path.basename(nuevoLibro.coverFileName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const nombreArchivo = `${Date.now()}-${nombreLimpio}${extension}`;
      const rutaFisica = path.join(dirPortadas, nombreArchivo);
      
      fs.writeFileSync(rutaFisica, buffer);
      
      // Guardamos la ruta estática
      nuevoLibro.cover = `/img/biblioteca/${nombreArchivo}`;
    }

    // Asignamos un ID único basado en el tiempo para que no se repitan
    nuevoLibro.id = `libro-${Date.now()}`;
    
    // Limpiamos los campos temporales del payload antes de guardar en el archivo JSON
    delete nuevoLibro.coverFileData;
    delete nuevoLibro.coverFileName;
    delete nuevoLibro.password;

    // Si el nuevo libro es favorito y tiene posición de podio asignada, desplazamos al ocupante anterior al carrusel
    if (nuevoLibro.favorito && nuevoLibro.podio) {
      datosActuales.forEach(libro => {
        if (libro.favorito && parseInt(libro.podio) === parseInt(nuevoLibro.podio)) {
          libro.podio = null;
        }
      });
    }

    // Lo sumamos a la lista
    datosActuales.push(nuevoLibro);
    
    // Guardamos el archivo actualizado en el disco duro
    fs.writeFileSync(RUTA_BIBLIOTECA, JSON.stringify(datosActuales, null, 2));
    
    // Registramos la acción en el log visor
    let descLog = "";
    let crtDescLog = "";
    let colorLog = "text-neon-cyan";

    if (nuevoLibro.favorito) {
      descLog = `Actualizado podio de favoritos: ${nuevoLibro.titulo} [ONLINE]`;
      crtDescLog = `El núcleo favorito "${nuevoLibro.titulo}" ha sido indexado y cargado en el podio digital.`;
      colorLog = "text-neon-gold";
    } else {
      descLog = `Inyectado nuevo libro: ${nuevoLibro.titulo} por ${nuevoLibro.autor} [ONLINE]`;
      crtDescLog = `El bloque de lectura del sector "${nuevoLibro.titulo}" ha sido indexado con éxito en la biblioteca.`;
    }
    agregarLog(nuevoLibro.favorito ? "FAVORITOS" : "DATABASE", descLog, crtDescLog, colorLog);

    res.json({ success: true, message: 'Terminal: Registro de datos de lectura indexado.' });
  } catch (error) {
    console.error("Error guardando el libro:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});


// ========================================================
// 🖳 FUNCIÓN AUXILIAR: AGREGA REGISTROS DE ACTIVIDAD (LOGS)
// ========================================================
function agregarLog(tag, desc, crtDesc, color = 'text-white') {
  try {
    const datosActuales = fs.existsSync(RUTA_LOGS) 
      ? JSON.parse(fs.readFileSync(RUTA_LOGS, 'utf-8')) 
      : [];

    const nuevoLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      fecha: new Date().toISOString().split('T')[0],
      tag: tag.toUpperCase(),
      desc: desc,
      crtDesc: crtDesc,
      color: color
    };

    datosActuales.push(nuevoLog);
    
    // Mantener un historial circular de máximo 20 entradas en el archivo
    const logsRecortados = datosActuales.slice(-20);

    fs.writeFileSync(RUTA_LOGS, JSON.stringify(logsRecortados, null, 2));
  } catch (error) {
    console.error("Error agregando log:", error);
  }
}

// ========================================================
// ✒️ ENDPOINTS PARA FRASES / CITAS (GET / POST)
// ========================================================
app.get('/api/citas', (req, res) => {
  if (!fs.existsSync(RUTA_CITAS)) {
    fs.writeFileSync(RUTA_CITAS, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_CITAS, 'utf-8');
  res.json(JSON.parse(datos));
});

app.post('/api/citas/nuevo', (req, res) => {
  try {
    const nuevaCita = req.body;
    
    if (nuevaCita.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = fs.existsSync(RUTA_CITAS) 
      ? JSON.parse(fs.readFileSync(RUTA_CITAS, 'utf-8')) 
      : [];
    
    nuevaCita.id = `cita-${Date.now()}`;
    
    delete nuevaCita.password;

    datosActuales.push(nuevaCita);
    fs.writeFileSync(RUTA_CITAS, JSON.stringify(datosActuales, null, 2));

    // Registramos la acción en el log visor
    const descLog = `Inyectada nueva cita de ${nuevaCita.autor} [ONLINE]`;
    const crtDescLog = `Inyectada nueva frase del sector "${nuevaCita.autor}" en la base de datos de transmisiones.`;
    agregarLog("CITAS", descLog, crtDescLog, "text-neon-magenta");

    res.json({ success: true, message: 'Terminal: Registro de datos de cita indexado.' });
  } catch (error) {
    console.error("Error guardando la cita:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

// ========================================================
// 🖳 ENDPOINT PARA LEER LOS LOGS DE ACTIVIDAD (GET)
// ========================================================
app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(RUTA_LOGS)) {
    fs.writeFileSync(RUTA_LOGS, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_LOGS, 'utf-8');
  res.json(JSON.parse(datos));
});


// ========================================================
// 🔍 ENDPOINT METADATA: EXTRAE LA CARÁTULA INTERNA DEL MP3
// ========================================================
app.get('/api/metadata', async (req, res) => {
  const urlCancion = req.query.ruta;
  if (!urlCancion) return res.status(400).json({ error: 'Falta la ruta.' });

  try {
    const rutaLimpia = urlCancion.replace(/^\/audio/, '').replace(/^\/+/, '');
    const rutaFisicaArchivo = path.join(AUDIO_DIR, rutaLimpia);

    if (!fs.existsSync(rutaFisicaArchivo)) {
      return res.json({ src: '/img/default-cassette.jpg' });
    }

    const metadata = await mm.parseFile(rutaFisicaArchivo);
    const foto = metadata.common.picture?.[0];

    if (foto) {
      const base64 = foto.data.toString('base64');
      return res.json({ src: `data:${foto.format};base64,${base64}` });
    }
    return res.json({ src: '/img/default-cassette.jpg' });
  } catch (error) {
    return res.json({ src: '/img/default-cassette.jpg' });
  }
});

// ========================================================
// 📂 FUNCIÓN AUXILIAR: BUSCA UNA IMAGEN EN UNA CARPETA
// ========================================================
function buscarCaratulaEnCarpeta(rutaCarpeta, urlRelativaBase) {
  if (!fs.existsSync(rutaCarpeta)) return null;
  const archivos = fs.readdirSync(rutaCarpeta);
  const imagen = archivos.find(file => {
    const f = file.toLowerCase();
    return f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp');
  });
  return imagen ? `${urlRelativaBase}/${imagen}` : null;
}

// ========================================================
// 🎛️ ENDPOINT MEJORADO: GENERA SUB-BLOQUES DE DISCOS REALES
// ========================================================
app.get('/api/playlist', (req, res) => {
  const audioDir = AUDIO_DIR;
  if (!fs.existsSync(audioDir)) return res.status(404).json({ error: 'Falta carpeta audio.' });

  try {
    const artistas = fs.readdirSync(audioDir).filter(file => fs.statSync(path.join(audioDir, file)).isDirectory());

    const playlist = artistas.map((artistaName, index) => {
      const artistaPath = path.join(audioDir, artistaName);
      const elementosContenidos = fs.readdirSync(artistaPath, { withFileTypes: true });

      let discos = [];
      let tracksSueltos = [];

      // Analizamos qué hay dentro de la carpeta del artista
      elementosContenidos.forEach(elemento => {
        const rutaElemento = path.join(artistaPath, elemento.name);
        const urlRelativaElemento = `/audio/${artistaName}/${elemento.name}`;

        if (elemento.isDirectory()) {
          // 💿 ES UN DISCO (SUB-CARPETA): Escaneamos sus canciones e imagen interna
          const cancionesDisco = fs.readdirSync(rutaElemento)
            .filter(file => file.endsWith('.mp3') || file.endsWith('.mp4'));

          const tracksDelDisco = cancionesDisco.map((songFile, songIndex) => {
            const isVideo = songFile.endsWith('.mp4');
            return {
              title: songFile.replace('.mp3', '').replace('.mp4', '').replace(/_/g, ' ').toUpperCase(),
              status: isVideo ? `PLAYING VIDEO` : `STREAMING ${elemento.name.toUpperCase()}`,
              side: `TRACK ${(songIndex + 1).toString().padStart(2, '0')}`,
              color: index === 0 ? '#a072ff' : '#ff007f',
              src: `${urlRelativaElemento}/${songFile}`,
              type: isVideo ? 'video' : 'audio'
            };
          });

          // Buscamos la carátula específica de ESTE disco dentro de su propia subcarpeta
          const discoCover = buscarCaratulaEnCarpeta(rutaElemento, urlRelativaElemento);

          discos.push({
            id: `disco-${elemento.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            title: elemento.name.replace(/_/g, ' ').toUpperCase(),
            cover: discoCover, // 👈 Portada real del disco
            tracks: tracksDelDisco
          });

        } else if (elemento.isFile() && (elemento.name.endsWith('.mp3') || elemento.name.endsWith('.mp4'))) {
          // 🎵 CANCIÓN SUELTA (En la raíz del artista)
          const isVideo = elemento.name.endsWith('.mp4');
          tracksSueltos.push({
            title: elemento.name.replace('.mp3', '').replace('.mp4', '').replace(/_/g, ' ').toUpperCase(),
            status: isVideo ? `PLAYING VIDEO` : `STREAMING ROOT_BEATS`,
            side: `TRACK ${(tracksSueltos.length + 1).toString().padStart(2, '0')}`,
            color: index === 0 ? '#a072ff' : '#ff007f',
            src: urlRelativaElemento,
            type: isVideo ? 'video' : 'audio'
          });
        }
      });

      // Carátula por defecto del artista (si la hay en su raíz)
      const artistaCover = buscarCaratulaEnCarpeta(artistaPath, `/audio/${artistaName}`);

      return {
        id: `artista-${artistaName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        title: artistaName.replace(/_/g, ' ').toUpperCase(),
        description: `Discografía de ${artistaName.replace(/_/g, ' ')}`,
        color: index === 0 ? '#a072ff' : '#ff007f',
        icon: index === 0 ? 'bi-book-half' : 'bi-fire',
        cover: artistaCover, 
        discos: discos,        // 👈 Enviamos la estructura de discos separada
        tracksSueltos: tracksSueltos // Canciones fuera de carpetas
      };
    });

    res.json(playlist);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error procesando la música.' });
  }
});

// ========================================================
// 📺 ENDPOINTS PARA SERIES (GET / POST)
// ========================================================
app.get('/api/series', (req, res) => {
  if (!fs.existsSync(RUTA_SERIES)) {
    fs.writeFileSync(RUTA_SERIES, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_SERIES, 'utf-8');
  res.json(JSON.parse(datos));
});

app.post('/api/series/nuevo', (req, res) => {
  try {
    const nuevaSerie = req.body;
    
    if (nuevaSerie.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = fs.existsSync(RUTA_SERIES) 
      ? JSON.parse(fs.readFileSync(RUTA_SERIES, 'utf-8')) 
      : [];
    
    if (nuevaSerie.coverFileData && nuevaSerie.coverFileName) {
      const base64Data = nuevaSerie.coverFileData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const dirFavoritos = IMG_FAVORITOS_DIR;
      if (!fs.existsSync(dirFavoritos)) {
        fs.mkdirSync(dirFavoritos, { recursive: true });
      }
      
      const extension = path.extname(nuevaSerie.coverFileName) || '.jpg';
      const nombreLimpio = path.basename(nuevaSerie.coverFileName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const nombreArchivo = `${Date.now()}-${nombreLimpio}${extension}`;
      const rutaFisica = path.join(dirFavoritos, nombreArchivo);
      
      fs.writeFileSync(rutaFisica, buffer);
      nuevaSerie.cover = `/img/favoritos/${nombreArchivo}`;
    }

    nuevaSerie.id = `serie-${Date.now()}`;
    
    delete nuevaSerie.coverFileData;
    delete nuevaSerie.coverFileName;
    delete nuevaSerie.password;

    datosActuales.push(nuevaSerie);
    fs.writeFileSync(RUTA_SERIES, JSON.stringify(datosActuales, null, 2));

    const descLog = `Inyectada nueva serie: ${nuevaSerie.titulo} [ONLINE]`;
    const crtDescLog = `La serie "${nuevaSerie.titulo}" ha sido indexada en el registro de favoritos.`;
    agregarLog("FAVORITOS", descLog, crtDescLog, "text-neon-cyan");

    res.json({ success: true, message: 'Terminal: Registro de serie indexado.' });
  } catch (error) {
    console.error("Error guardando la serie:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/series/eliminar', (req, res) => {
  try {
    const { id, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = fs.existsSync(RUTA_SERIES)
      ? JSON.parse(fs.readFileSync(RUTA_SERIES, 'utf-8'))
      : [];

    const serieAEliminar = datosActuales.find(s => s.id === id);
    if (!serieAEliminar) {
      return res.status(404).json({ error: 'Serie no encontrada.' });
    }

    datosActuales = datosActuales.filter(s => s.id !== id);
    fs.writeFileSync(RUTA_SERIES, JSON.stringify(datosActuales, null, 2));

    const descLog = `Eliminada serie: ${serieAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `La serie "${serieAEliminar.titulo}" fue purgada del registro de favoritos.`;
    agregarLog('FAVORITOS', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: 'Terminal: Registro de serie eliminado.', id });
  } catch (error) {
    console.error('Error eliminando la serie:', error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 🎬 ENDPOINTS PARA PELÍCULAS (GET / POST)
// ========================================================
app.get('/api/peliculas', (req, res) => {
  if (!fs.existsSync(RUTA_PELICULAS)) {
    fs.writeFileSync(RUTA_PELICULAS, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_PELICULAS, 'utf-8');
  res.json(JSON.parse(datos));
});

app.post('/api/peliculas/nuevo', (req, res) => {
  try {
    const nuevaPelicula = req.body;
    
    if (nuevaPelicula.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = fs.existsSync(RUTA_PELICULAS) 
      ? JSON.parse(fs.readFileSync(RUTA_PELICULAS, 'utf-8')) 
      : [];
    
    if (nuevaPelicula.coverFileData && nuevaPelicula.coverFileName) {
      const base64Data = nuevaPelicula.coverFileData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const dirFavoritos = IMG_FAVORITOS_DIR;
      if (!fs.existsSync(dirFavoritos)) {
        fs.mkdirSync(dirFavoritos, { recursive: true });
      }
      
      const extension = path.extname(nuevaPelicula.coverFileName) || '.jpg';
      const nombreLimpio = path.basename(nuevaPelicula.coverFileName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const nombreArchivo = `${Date.now()}-${nombreLimpio}${extension}`;
      const rutaFisica = path.join(dirFavoritos, nombreArchivo);
      
      fs.writeFileSync(rutaFisica, buffer);
      nuevaPelicula.cover = `/img/favoritos/${nombreArchivo}`;
    }

    nuevaPelicula.id = `pelicula-${Date.now()}`;
    
    delete nuevaPelicula.coverFileData;
    delete nuevaPelicula.coverFileName;
    delete nuevaPelicula.password;

    datosActuales.push(nuevaPelicula);
    fs.writeFileSync(RUTA_PELICULAS, JSON.stringify(datosActuales, null, 2));

    const descLog = `Inyectada nueva película: ${nuevaPelicula.titulo} [ONLINE]`;
    const crtDescLog = `La película "${nuevaPelicula.titulo}" ha sido indexada en el registro de favoritos.`;
    agregarLog("FAVORITOS", descLog, crtDescLog, "text-neon-magenta");

    res.json({ success: true, message: 'Terminal: Registro de película indexado.', movie: nuevaPelicula });
  } catch (error) {
    console.error("Error guardando la película:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/peliculas/eliminar', (req, res) => {
  try {
    const { id, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = fs.existsSync(RUTA_PELICULAS)
      ? JSON.parse(fs.readFileSync(RUTA_PELICULAS, 'utf-8'))
      : [];

    const peliculaAEliminar = datosActuales.find(p => p.id === id);
    if (!peliculaAEliminar) {
      return res.status(404).json({ error: 'Película no encontrada.' });
    }

    datosActuales = datosActuales.filter(p => p.id !== id);
    fs.writeFileSync(RUTA_PELICULAS, JSON.stringify(datosActuales, null, 2));

    const descLog = `Eliminada película: ${peliculaAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `La película "${peliculaAEliminar.titulo}" fue purgada del registro de favoritos.`;
    agregarLog('FAVORITOS', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: 'Terminal: Registro de película eliminado.', id });
  } catch (error) {
    console.error('Error eliminando la película:', error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 👤 ENDPOINTS PARA PERSONAJES (GET / POST)
// ========================================================
app.get('/api/personajes', (req, res) => {
  if (!fs.existsSync(RUTA_PERSONAJES)) {
    fs.writeFileSync(RUTA_PERSONAJES, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_PERSONAJES, 'utf-8');
  res.json(JSON.parse(datos));
});

app.post('/api/personajes/nuevo', (req, res) => {
  try {
    const nuevoPersonaje = req.body;
    
    if (nuevoPersonaje.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = fs.existsSync(RUTA_PERSONAJES) 
      ? JSON.parse(fs.readFileSync(RUTA_PERSONAJES, 'utf-8')) 
      : [];
    
    if (nuevoPersonaje.coverFileData && nuevoPersonaje.coverFileName) {
      const base64Data = nuevoPersonaje.coverFileData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const dirFavoritos = IMG_FAVORITOS_DIR;
      if (!fs.existsSync(dirFavoritos)) {
        fs.mkdirSync(dirFavoritos, { recursive: true });
      }
      
      const extension = path.extname(nuevoPersonaje.coverFileName) || '.jpg';
      const nombreLimpio = path.basename(nuevoPersonaje.coverFileName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const nombreArchivo = `${Date.now()}-${nombreLimpio}${extension}`;
      const rutaFisica = path.join(dirFavoritos, nombreArchivo);
      
      fs.writeFileSync(rutaFisica, buffer);
      nuevoPersonaje.cover = `/img/favoritos/${nombreArchivo}`;
    }

    nuevoPersonaje.id = `personaje-${Date.now()}`;
    
    // Asignar el subjectId dinámicamente: SUBJECT_XX
    const count = datosActuales.length;
    nuevoPersonaje.subjectId = `SUBJECT_${String(count + 1).padStart(2, '0')}`;

    delete nuevoPersonaje.coverFileData;
    delete nuevoPersonaje.coverFileName;
    delete nuevoPersonaje.password;

    datosActuales.push(nuevoPersonaje);
    fs.writeFileSync(RUTA_PERSONAJES, JSON.stringify(datosActuales, null, 2));

    const descLog = `Inyectada nueva ficha de personaje: ${nuevoPersonaje.nombre} [ONLINE]`;
    const crtDescLog = `El personaje "${nuevoPersonaje.nombre}" ha sido indexado en el registro de sujetos clasificados.`;
    agregarLog("FAVORITOS", descLog, crtDescLog, "text-warning");

    res.json({ success: true, message: 'Terminal: Registro de personaje indexado.', personaje: nuevoPersonaje });
  } catch (error) {
    console.error("Error guardando el personaje:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/personajes/eliminar', (req, res) => {
  try {
    const { id, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = fs.existsSync(RUTA_PERSONAJES)
      ? JSON.parse(fs.readFileSync(RUTA_PERSONAJES, 'utf-8'))
      : [];

    const personajeAEliminar = datosActuales.find(p => p.id === id);
    if (!personajeAEliminar) {
      return res.status(404).json({ error: 'Personaje no encontrado.' });
    }

    datosActuales = datosActuales.filter(p => p.id !== id);
    fs.writeFileSync(RUTA_PERSONAJES, JSON.stringify(datosActuales, null, 2));

    const descLog = `Eliminado personaje: ${personajeAEliminar.nombre} [OFFLINE]`;
    const crtDescLog = `El personaje "${personajeAEliminar.nombre}" fue purgado del registro de sujetos clasificados.`;
    agregarLog('FAVORITOS', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: 'Terminal: Registro de personaje eliminado.', id });
  } catch (error) {
    console.error('Error eliminando el personaje:', error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 🎙️ ENDPOINTS PARA ENTREVISTAS (GET / POST)
// ========================================================
app.get('/api/entrevistas', (req, res) => {
  if (!fs.existsSync(RUTA_ENTREVISTAS)) {
    fs.writeFileSync(RUTA_ENTREVISTAS, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_ENTREVISTAS, 'utf-8');
  res.json(JSON.parse(datos));
});

app.post('/api/entrevistas/nuevo', (req, res) => {
  try {
    const nuevaEntrevista = req.body;
    
    if (nuevaEntrevista.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = fs.existsSync(RUTA_ENTREVISTAS) 
      ? JSON.parse(fs.readFileSync(RUTA_ENTREVISTAS, 'utf-8')) 
      : [];

    nuevaEntrevista.id = `entrevista-${Date.now()}`;
    
    delete nuevaEntrevista.password;

    datosActuales.push(nuevaEntrevista);
    fs.writeFileSync(RUTA_ENTREVISTAS, JSON.stringify(datosActuales, null, 2));

    const descLog = `Inyectada nueva entrevista: ${nuevaEntrevista.nombre} [ONLINE]`;
    const crtDescLog = `La entrevista con "${nuevaEntrevista.nombre}" ha sido indexada en el registro del Búnker.`;
    agregarLog("FAVORITOS", descLog, crtDescLog, "text-warning");

    res.json({ success: true, message: 'Terminal: Registro de entrevista indexado.', entrevista: nuevaEntrevista });
  } catch (error) {
    console.error("Error guardando la entrevista:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

// ========================================================
// 🎮 ENDPOINTS PARA JUEGOS (GET / POST / ELIMINAR)
// ========================================================
app.get('/api/juegos', (req, res) => {
  if (!fs.existsSync(RUTA_JUEGOS)) {
    fs.writeFileSync(RUTA_JUEGOS, JSON.stringify([]));
  }
  const datos = fs.readFileSync(RUTA_JUEGOS, 'utf-8');
  res.json(JSON.parse(datos));
});

app.post('/api/juegos/nuevo', (req, res) => {
  try {
    const nuevoJuego = req.body;
    
    if (nuevoJuego.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = fs.existsSync(RUTA_JUEGOS) 
      ? JSON.parse(fs.readFileSync(RUTA_JUEGOS, 'utf-8')) 
      : [];

    nuevoJuego.id = `juego-${Date.now()}`;
    
    delete nuevoJuego.password;

    datosActuales.push(nuevoJuego);
    fs.writeFileSync(RUTA_JUEGOS, JSON.stringify(datosActuales, null, 2));

    const descLog = `Inyectado nuevo juego: ${nuevoJuego.titulo} [ONLINE]`;
    const crtDescLog = `El juego "${nuevoJuego.titulo}" ha sido indexada en el registro del Búnker.`;
    agregarLog("GAMING", descLog, crtDescLog, "text-neon-cyan");

    res.json({ success: true, message: 'Terminal: Registro de juego indexado.', juego: nuevoJuego });
  } catch (error) {
    console.error("Error guardando el juego:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/juegos/eliminar', (req, res) => {
  try {
    const { id, password } = req.body;
    
    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    if (!fs.existsSync(RUTA_JUEGOS)) {
      return res.status(404).json({ error: 'Sector de base de datos no encontrado.' });
    }

    let datosActuales = JSON.parse(fs.readFileSync(RUTA_JUEGOS, 'utf-8'));
    const juegoAEliminar = datosActuales.find(j => j.id === id);

    if (!juegoAEliminar) {
      return res.status(404).json({ error: 'Juego no encontrado en el registro.' });
    }

    datosActuales = datosActuales.filter(j => j.id !== id);
    fs.writeFileSync(RUTA_JUEGOS, JSON.stringify(datosActuales, null, 2));

    const descLog = `Eliminado juego: ${juegoAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `El juego "${juegoAEliminar.titulo}" ha sido purgado del registro del Búnker.`;
    agregarLog("GAMING", descLog, crtDescLog, "text-danger");

    res.json({ success: true, message: 'Terminal: Registro de juego eliminado.', id });
  } catch (error) {
    console.error("Error eliminando el juego:", error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 📡 ENDPOINTS PARA REDES SOCIALES (GET)
// ========================================================
app.get('/api/redes', (req, res) => {
  if (!fs.existsSync(RUTA_REDES)) {
    fs.writeFileSync(RUTA_REDES, JSON.stringify({ instagram: [], tiktok: [], wattpad: [] }));
  }
  const datos = fs.readFileSync(RUTA_REDES, 'utf-8');
  res.json(JSON.parse(datos));
});

// ========================================================
// 📡 ENDPOINTS PARA REDES SOCIALES (POST / DELETE)
// ========================================================
app.post('/api/redes/nuevo', (req, res) => {
  try {
    const { red, embedHtml, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    const redesValidas = ['instagram', 'tiktok', 'wattpad'];
    if (!redesValidas.includes(red)) {
      return res.status(400).json({ error: 'Red no válida. Usa: instagram, tiktok o wattpad.' });
    }

    if (!embedHtml || !embedHtml.trim()) {
      return res.status(400).json({ error: 'El campo embedHtml es obligatorio.' });
    }

    // Limpiar etiquetas <script> por seguridad
    const cleanEmbed = embedHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

    if (!fs.existsSync(RUTA_REDES)) {
      fs.writeFileSync(RUTA_REDES, JSON.stringify({ instagram: [], tiktok: [], wattpad: [] }));
    }

    const datos = JSON.parse(fs.readFileSync(RUTA_REDES, 'utf-8'));

    const nuevoPost = {
      id: `${red}-${Date.now()}`,
      embedHtml: cleanEmbed,
      createdAt: new Date().toISOString()
    };

    datos[red].unshift(nuevoPost);

    // Mantener solo los 2 más recientes
    if (datos[red].length > 2) {
      datos[red] = datos[red].slice(0, 2);
    }

    fs.writeFileSync(RUTA_REDES, JSON.stringify(datos, null, 2));

    const descLog = `Inyectado nuevo post en ${red.toUpperCase()} [ONLINE]`;
    const crtDescLog = `El sector ${red.toUpperCase()} recibió una nueva publicación y el feed fue resincronizado.`;
    const colorLog = red === 'instagram'
      ? 'text-neon-magenta'
      : red === 'tiktok'
        ? 'text-neon-cyan'
        : 'text-warning';
    agregarLog('REDES', descLog, crtDescLog, colorLog);

    res.json({ success: true, message: `Post añadido a ${red.toUpperCase()}.` });
  } catch (error) {
    console.error('Error añadiendo post a redes:', error);
    res.status(500).json({ error: 'Fallo al añadir el post.' });
  }
});

app.delete('/api/redes/eliminar/:red/:id', (req, res) => {
  try {
    const { red, id } = req.params;
    const { password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    const redesValidas = ['instagram', 'tiktok', 'wattpad'];
    if (!redesValidas.includes(red)) {
      return res.status(400).json({ error: 'Red no válida. Usa: instagram, tiktok o wattpad.' });
    }

    if (!fs.existsSync(RUTA_REDES)) {
      return res.status(404).json({ error: 'Archivo de redes no encontrado.' });
    }

    const datos = JSON.parse(fs.readFileSync(RUTA_REDES, 'utf-8'));

    const index = datos[red].findIndex(post => post.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Post no encontrado.' });
    }

    const [postEliminado] = datos[red].splice(index, 1);

    fs.writeFileSync(RUTA_REDES, JSON.stringify(datos, null, 2));

    const descLog = `Eliminado post de ${red.toUpperCase()} [OFFLINE]`;
    const crtDescLog = `Un registro del sector ${red.toUpperCase()} fue purgado (${postEliminado?.id || id}).`;
    agregarLog('REDES', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: `Post eliminado de ${red.toUpperCase()}.` });
  } catch (error) {
    console.error('Error eliminando post de redes:', error);
    res.status(500).json({ error: 'Fallo al eliminar el post.' });
  }
});

app.listen(PORT, () => {
  console.log(`============= BÚNKER SERVER ONLINE =============`);
  console.log(`🎧 Deck listo en puerto: ${PORT}`);
  console.log(`================================================`);
});
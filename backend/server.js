import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

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
const DATABASE_URL = process.env.DATABASE_URL || '';
const DATABASE_SSL = (process.env.DATABASE_SSL || 'true').toLowerCase() === 'true';
const AUDIO_PUBLIC_BASE_URL = (process.env.AUDIO_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

const dbPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false
    })
  : null;

let musicDbReady = false;

function slugifySegment(value, fallback = 'item') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return normalized || fallback;
}

function formatDisplayName(value) {
  return String(value || '').replace(/_/g, ' ').toUpperCase();
}

function normalizeTrackTitle(fileName) {
  return formatDisplayName(path.parse(fileName).name);
}

function isMediaFile(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.mp3') || lower.endsWith('.mp4');
}

function buildAudioPublicUrl(srcPath) {
  if (!srcPath) {
    return srcPath;
  }

  if (/^https?:\/\//i.test(srcPath)) {
    return srcPath;
  }

  const normalizedPath = srcPath.startsWith('/') ? srcPath : `/${srcPath}`;

  if (!AUDIO_PUBLIC_BASE_URL || !normalizedPath.startsWith('/audio/')) {
    return normalizedPath;
  }

  return `${AUDIO_PUBLIC_BASE_URL}${normalizedPath.replace(/^\/audio/, '')}`;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function toRebasedAudioUrl(sourceUrl, nextBaseUrl) {
  if (!sourceUrl) {
    return sourceUrl;
  }

  const baseUrl = normalizeBaseUrl(nextBaseUrl);
  if (!baseUrl) {
    return sourceUrl;
  }

  if (sourceUrl.startsWith('/audio/')) {
    return `${baseUrl}${sourceUrl.replace(/^\/audio/, '')}`;
  }

  if (sourceUrl.startsWith(`${baseUrl}/`)) {
    return sourceUrl;
  }

  return sourceUrl;
}

function getArtistColor(index) {
  return index === 0 ? '#a072ff' : '#ff007f';
}

function getArtistIcon(index) {
  return index === 0 ? 'bi-book-half' : 'bi-fire';
}

async function initMusicDatabase() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS artists (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      cover_url TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS albums (
      id BIGSERIAL PRIMARY KEY,
      artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cover_url TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (artist_id, name)
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS tracks (
      id BIGSERIAL PRIMARY KEY,
      artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      album_id BIGINT REFERENCES albums(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      src_url TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'video')),
      track_no INT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function getPlaylistFromFilesystem() {
  const audioDir = AUDIO_DIR;

  if (!fs.existsSync(audioDir)) {
    const error = new Error('Falta carpeta audio.');
    error.status = 404;
    throw error;
  }

  const artistas = fs
    .readdirSync(audioDir)
    .filter(file => fs.statSync(path.join(audioDir, file)).isDirectory());

  return artistas.map((artistaName, index) => {
    const artistaPath = path.join(audioDir, artistaName);
    const elementosContenidos = fs.readdirSync(artistaPath, { withFileTypes: true });

    const discos = [];
    const tracksSueltos = [];

    elementosContenidos.forEach((elemento) => {
      const rutaElemento = path.join(artistaPath, elemento.name);
      const urlRelativaElemento = `/audio/${artistaName}/${elemento.name}`;

      if (elemento.isDirectory()) {
        const cancionesDisco = fs.readdirSync(rutaElemento).filter(isMediaFile);

        const tracksDelDisco = cancionesDisco.map((songFile, songIndex) => {
          const isVideo = songFile.toLowerCase().endsWith('.mp4');
          return {
            title: normalizeTrackTitle(songFile),
            status: isVideo ? 'PLAYING VIDEO' : `STREAMING ${formatDisplayName(elemento.name)}`,
            side: `TRACK ${(songIndex + 1).toString().padStart(2, '0')}`,
            color: getArtistColor(index),
            src: buildAudioPublicUrl(`${urlRelativaElemento}/${songFile}`),
            type: isVideo ? 'video' : 'audio'
          };
        });

        const discoCover = buscarCaratulaEnCarpeta(rutaElemento, urlRelativaElemento);

        discos.push({
          id: `disco-${slugifySegment(elemento.name, String(discos.length + 1))}`,
          title: formatDisplayName(elemento.name),
          cover: discoCover,
          tracks: tracksDelDisco
        });
      } else if (elemento.isFile() && isMediaFile(elemento.name)) {
        const isVideo = elemento.name.toLowerCase().endsWith('.mp4');
        tracksSueltos.push({
          title: normalizeTrackTitle(elemento.name),
          status: isVideo ? 'PLAYING VIDEO' : 'STREAMING ROOT_BEATS',
          side: `TRACK ${(tracksSueltos.length + 1).toString().padStart(2, '0')}`,
          color: getArtistColor(index),
          src: buildAudioPublicUrl(urlRelativaElemento),
          type: isVideo ? 'video' : 'audio'
        });
      }
    });

    const artistaCover = buscarCaratulaEnCarpeta(artistaPath, `/audio/${artistaName}`);

    return {
      id: `artista-${slugifySegment(artistaName, String(index + 1))}`,
      title: formatDisplayName(artistaName),
      description: `Discografía de ${artistaName.replace(/_/g, ' ')}`,
      color: getArtistColor(index),
      icon: getArtistIcon(index),
      cover: buildAudioPublicUrl(artistaCover),
      discos,
      tracksSueltos
    };
  });
}

async function syncMusicDbFromFilesystem() {
  if (!dbPool) {
    throw new Error('DATABASE_URL no configurado.');
  }

  if (!fs.existsSync(AUDIO_DIR)) {
    return { artists: 0, albums: 0, tracks: 0 };
  }

  const artistas = fs
    .readdirSync(AUDIO_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  const client = await dbPool.connect();
  let insertedArtists = 0;
  let insertedAlbums = 0;
  let insertedTracks = 0;

  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE tracks, albums, artists RESTART IDENTITY CASCADE');

    for (let artistIndex = 0; artistIndex < artistas.length; artistIndex += 1) {
      const artistaName = artistas[artistIndex];
      const artistaPath = path.join(AUDIO_DIR, artistaName);
      const artistaCover = buildAudioPublicUrl(buscarCaratulaEnCarpeta(artistaPath, `/audio/${artistaName}`));

      const artistInsert = await client.query(
        `
          INSERT INTO artists (name, cover_url, sort_order)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [artistaName, artistaCover, artistIndex]
      );

      const artistId = artistInsert.rows[0].id;
      insertedArtists += 1;

      const elementosContenidos = fs.readdirSync(artistaPath, { withFileTypes: true });
      let rootTrackOrder = 0;
      let albumOrder = 0;

      for (const elemento of elementosContenidos) {
        const rutaElemento = path.join(artistaPath, elemento.name);

        if (elemento.isDirectory()) {
          const urlRelativaElemento = `/audio/${artistaName}/${elemento.name}`;
          const coverAlbum = buildAudioPublicUrl(buscarCaratulaEnCarpeta(rutaElemento, urlRelativaElemento));

          const albumInsert = await client.query(
            `
              INSERT INTO albums (artist_id, name, cover_url, sort_order)
              VALUES ($1, $2, $3, $4)
              RETURNING id
            `,
            [artistId, elemento.name, coverAlbum, albumOrder]
          );

          const albumId = albumInsert.rows[0].id;
          albumOrder += 1;
          insertedAlbums += 1;

          const cancionesDisco = fs.readdirSync(rutaElemento).filter(isMediaFile);

          for (let songIndex = 0; songIndex < cancionesDisco.length; songIndex += 1) {
            const songFile = cancionesDisco[songIndex];
            const isVideo = songFile.toLowerCase().endsWith('.mp4');

            await client.query(
              `
                INSERT INTO tracks (artist_id, album_id, title, src_url, media_type, track_no, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `,
              [
                artistId,
                albumId,
                normalizeTrackTitle(songFile),
                buildAudioPublicUrl(`${urlRelativaElemento}/${songFile}`),
                isVideo ? 'video' : 'audio',
                songIndex + 1,
                songIndex
              ]
            );

            insertedTracks += 1;
          }
        } else if (elemento.isFile() && isMediaFile(elemento.name)) {
          const isVideo = elemento.name.toLowerCase().endsWith('.mp4');
          await client.query(
            `
              INSERT INTO tracks (artist_id, album_id, title, src_url, media_type, track_no, sort_order)
              VALUES ($1, NULL, $2, $3, $4, $5, $6)
            `,
            [
              artistId,
              normalizeTrackTitle(elemento.name),
              buildAudioPublicUrl(`/audio/${artistaName}/${elemento.name}`),
              isVideo ? 'video' : 'audio',
              rootTrackOrder + 1,
              rootTrackOrder
            ]
          );

          rootTrackOrder += 1;
          insertedTracks += 1;
        }
      }
    }

    await client.query('COMMIT');
    musicDbReady = true;
    return { artists: insertedArtists, albums: insertedAlbums, tracks: insertedTracks };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getPlaylistFromDatabase() {
  if (!dbPool) {
    return [];
  }

  const [artistsResult, albumsResult, tracksResult] = await Promise.all([
    dbPool.query('SELECT id, name, cover_url, sort_order FROM artists ORDER BY sort_order ASC, id ASC'),
    dbPool.query('SELECT id, artist_id, name, cover_url, sort_order FROM albums ORDER BY sort_order ASC, id ASC'),
    dbPool.query(`
      SELECT id, artist_id, album_id, title, src_url, media_type, track_no, sort_order
      FROM tracks
      ORDER BY sort_order ASC, id ASC
    `)
  ]);

  const artists = artistsResult.rows;
  const albums = albumsResult.rows;
  const tracks = tracksResult.rows;

  const albumsByArtist = new Map();
  const tracksByAlbum = new Map();
  const rootTracksByArtist = new Map();

  albums.forEach((album) => {
    if (!albumsByArtist.has(album.artist_id)) {
      albumsByArtist.set(album.artist_id, []);
    }
    albumsByArtist.get(album.artist_id).push(album);
  });

  tracks.forEach((track) => {
    if (track.album_id) {
      if (!tracksByAlbum.has(track.album_id)) {
        tracksByAlbum.set(track.album_id, []);
      }
      tracksByAlbum.get(track.album_id).push(track);
    } else {
      if (!rootTracksByArtist.has(track.artist_id)) {
        rootTracksByArtist.set(track.artist_id, []);
      }
      rootTracksByArtist.get(track.artist_id).push(track);
    }
  });

  return artists.map((artist, index) => {
    const color = getArtistColor(index);
    const discosRaw = albumsByArtist.get(artist.id) || [];
    const tracksSueltosRaw = rootTracksByArtist.get(artist.id) || [];

    const discos = discosRaw.map((album, albumIndex) => {
      const tracksDelDisco = (tracksByAlbum.get(album.id) || []).map((track, trackIndex) => ({
        title: track.title,
        status: track.media_type === 'video' ? 'PLAYING VIDEO' : `STREAMING ${formatDisplayName(album.name)}`,
        side: `TRACK ${String(track.track_no || trackIndex + 1).padStart(2, '0')}`,
        color,
        src: track.src_url,
        type: track.media_type
      }));

      return {
        id: `disco-${slugifySegment(album.name, String(albumIndex + 1))}-${album.id}`,
        title: formatDisplayName(album.name),
        cover: album.cover_url,
        tracks: tracksDelDisco
      };
    });

    const tracksSueltos = tracksSueltosRaw.map((track, trackIndex) => ({
      title: track.title,
      status: track.media_type === 'video' ? 'PLAYING VIDEO' : 'STREAMING ROOT_BEATS',
      side: `TRACK ${String(track.track_no || trackIndex + 1).padStart(2, '0')}`,
      color,
      src: track.src_url,
      type: track.media_type
    }));

    return {
      id: `artista-${slugifySegment(artist.name, String(index + 1))}-${artist.id}`,
      title: formatDisplayName(artist.name),
      description: `Discografía de ${artist.name.replace(/_/g, ' ')}`,
      color,
      icon: getArtistIcon(index),
      cover: artist.cover_url,
      discos,
      tracksSueltos
    };
  });
}

async function ensureMusicDbReady() {
  if (!dbPool) {
    return false;
  }

  if (musicDbReady) {
    return true;
  }

  await initMusicDatabase();

  const countResult = await dbPool.query('SELECT COUNT(*)::int AS total FROM artists');
  const totalArtists = countResult.rows[0]?.total || 0;

  if (totalArtists === 0 && fs.existsSync(AUDIO_DIR)) {
    await syncMusicDbFromFilesystem();
  }

  musicDbReady = true;
  return true;
}

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
app.get('/api/playlist', async (req, res) => {
  try {
    if (await ensureMusicDbReady()) {
      const playlistDesdeDb = await getPlaylistFromDatabase();
      if (playlistDesdeDb.length > 0) {
        return res.json(playlistDesdeDb);
      }
    }

    const playlistDesdeFs = getPlaylistFromFilesystem();
    return res.json(playlistDesdeFs);
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return res.status(status).json({ error: status === 404 ? 'Falta carpeta audio.' : 'Error procesando la música.' });
  }
});

app.post('/api/playlist/sync', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    if (!dbPool) {
      return res.status(400).json({ error: 'DATABASE_URL no configurado. El modo DB no está activo.' });
    }

    await initMusicDatabase();
    const result = await syncMusicDbFromFilesystem();

    return res.json({
      success: true,
      message: 'Playlist sincronizada desde carpetas a PostgreSQL.',
      synced: result
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error sincronizando playlist con PostgreSQL.' });
  }
});

app.post('/api/playlist/rebase-urls', async (req, res) => {
  try {
    const { password, baseUrl } = req.body || {};
    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    if (!dbPool) {
      return res.status(400).json({ error: 'DATABASE_URL no configurado. El modo DB no está activo.' });
    }

    const targetBaseUrl = normalizeBaseUrl(baseUrl || AUDIO_PUBLIC_BASE_URL);
    if (!targetBaseUrl) {
      return res.status(400).json({ error: 'Debes enviar baseUrl o definir AUDIO_PUBLIC_BASE_URL.' });
    }

    const [tracksResult, artistsResult, albumsResult] = await Promise.all([
      dbPool.query('SELECT id, src_url FROM tracks'),
      dbPool.query('SELECT id, cover_url FROM artists'),
      dbPool.query('SELECT id, cover_url FROM albums')
    ]);

    let updatedTracks = 0;
    let updatedArtists = 0;
    let updatedAlbums = 0;

    for (const track of tracksResult.rows) {
      const rebased = toRebasedAudioUrl(track.src_url, targetBaseUrl);
      if (rebased !== track.src_url) {
        await dbPool.query('UPDATE tracks SET src_url = $1 WHERE id = $2', [rebased, track.id]);
        updatedTracks += 1;
      }
    }

    for (const artist of artistsResult.rows) {
      const rebased = toRebasedAudioUrl(artist.cover_url, targetBaseUrl);
      if (rebased !== artist.cover_url) {
        await dbPool.query('UPDATE artists SET cover_url = $1 WHERE id = $2', [rebased, artist.id]);
        updatedArtists += 1;
      }
    }

    for (const album of albumsResult.rows) {
      const rebased = toRebasedAudioUrl(album.cover_url, targetBaseUrl);
      if (rebased !== album.cover_url) {
        await dbPool.query('UPDATE albums SET cover_url = $1 WHERE id = $2', [rebased, album.id]);
        updatedAlbums += 1;
      }
    }

    return res.json({
      success: true,
      message: 'Rutas de audio rebased correctamente.',
      baseUrl: targetBaseUrl,
      updated: {
        tracks: updatedTracks,
        artists: updatedArtists,
        albums: updatedAlbums
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error rebasing URLs de audio.' });
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
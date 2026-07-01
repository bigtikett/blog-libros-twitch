import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';
import { buildPublicAssetUrl } from './utils/public-url.js';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { buildStorageKey, buildStoragePublicUrl } from './utils/r2-storage.js';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_PACKAGE_PATH = path.join(__dirname, 'package.json');
const DATA_DIR = path.join(__dirname, 'data');
const AUDIO_DIR = path.join(FRONTEND_DIR, 'audio');
const IMG_BIBLIOTECA_DIR = path.join(FRONTEND_DIR, 'img', 'biblioteca');
const IMG_FAVORITOS_DIR = path.join(FRONTEND_DIR, 'img', 'favoritos');

fs.mkdirSync(DATA_DIR, { recursive: true });

let APP_PACKAGE_VERSION = '1.0.0';
try {
  const pkgRaw = fs.readFileSync(BACKEND_PACKAGE_PATH, 'utf-8');
  const pkgJson = JSON.parse(pkgRaw);
  APP_PACKAGE_VERSION = String(pkgJson.version || APP_PACKAGE_VERSION);
} catch (error) {
  console.warn('No se pudo leer la version de package.json del backend:', error?.message || error);
}

const DEPLOY_COMMIT_SHA = (
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  ''
).trim();
const DEPLOY_COMMIT_SHORT = DEPLOY_COMMIT_SHA ? DEPLOY_COMMIT_SHA.slice(0, 7) : '';
const DEPLOY_PLATFORM = DEPLOY_COMMIT_SHA
  ? (process.env.RENDER_GIT_COMMIT ? 'render' : process.env.VERCEL_GIT_COMMIT_SHA ? 'vercel' : 'git')
  : 'local';
const SERVER_BOOTED_AT = new Date().toISOString();
const DEPLOY_VERSION_LABEL = [APP_PACKAGE_VERSION, DEPLOY_COMMIT_SHORT ? `build.${DEPLOY_COMMIT_SHORT}` : 'runtime'].join(' / ');

const RUTA_BIBLIOTECA = path.join(DATA_DIR, 'biblioteca.json');
const RUTA_CITAS = path.join(DATA_DIR, 'citas.json');
const RUTA_LOGS = path.join(DATA_DIR, 'logs.json');
const RUTA_SERIES = path.join(DATA_DIR, 'series.json');
const RUTA_PELICULAS = path.join(DATA_DIR, 'peliculas.json');
const RUTA_PERSONAJES = path.join(DATA_DIR, 'personajes.json');
const RUTA_ENTREVISTAS = path.join(DATA_DIR, 'entrevistas.json');
const RUTA_JUEGOS = path.join(DATA_DIR, 'juegos.json');
const RUTA_REDES = path.join(DATA_DIR, 'redes.json');
const RUTA_BITACORA = path.join(DATA_DIR, 'bitacora.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
const DATABASE_SSL = (process.env.DATABASE_SSL || 'true').toLowerCase() === 'true';
const AUDIO_PUBLIC_BASE_URL = (process.env.AUDIO_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const IMAGE_PUBLIC_BASE_URL = (process.env.IMAGE_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const R2_ENDPOINT = (process.env.R2_ENDPOINT || '').trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID || '').trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME || '').trim();
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

const r2Client = R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const dbPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false
    })
  : null;

let musicDbReady = false;
let collectionsDbReady = false;

async function ensureCollectionsDbReady() {
  if (!dbPool) {
    return false;
  }
  if (collectionsDbReady) {
    return true;
  }

  try {
    // Crear tabla si no existe
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS site_collections (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '[]'::jsonb
      );
    `);

    // Sembrar automáticamente si la clave no existe
    const collections = [
      { key: 'biblioteca', path: RUTA_BIBLIOTECA, default: [] },
      { key: 'citas', path: RUTA_CITAS, default: [] },
      { key: 'logs', path: RUTA_LOGS, default: [] },
      { key: 'series', path: RUTA_SERIES, default: [] },
      { key: 'peliculas', path: RUTA_PELICULAS, default: [] },
      { key: 'personajes', path: RUTA_PERSONAJES, default: [] },
      { key: 'entrevistas', path: RUTA_ENTREVISTAS, default: [] },
      { key: 'juegos', path: RUTA_JUEGOS, default: [] },
      { key: 'redes', path: RUTA_REDES, default: { instagram: [], tiktok: [], wattpad: [] } },
      { key: 'bitacora', path: RUTA_BITACORA, default: [] }
    ];

    for (const col of collections) {
      const checkRes = await dbPool.query('SELECT 1 FROM site_collections WHERE key = $1', [col.key]);
      if (checkRes.rowCount === 0) {
        let initialData = col.default;
        if (fs.existsSync(col.path)) {
          try {
            const raw = fs.readFileSync(col.path, 'utf-8');
            initialData = JSON.parse(raw);
          } catch (e) {
            console.error(`Error reading initial JSON for ${col.key}:`, e);
          }
        }
        await dbPool.query(
          'INSERT INTO site_collections (key, data) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
          [col.key, JSON.stringify(initialData)]
        );
      }
    }

    collectionsDbReady = true;
    return true;
  } catch (err) {
    console.error('Error initializing collections database table:', err);
    return false;
  }
}

async function getCollection(key, fallbackFilePath, defaultVal = []) {
  const useDb = await ensureCollectionsDbReady();
  if (useDb) {
    try {
      const res = await dbPool.query('SELECT data FROM site_collections WHERE key = $1', [key]);
      if (res.rows.length > 0) {
        return res.rows[0].data;
      }
    } catch (err) {
      console.error(`Error getting collection ${key} from DB, falling back to disk:`, err);
    }
  }

  // Fallback a archivo local
  if (!fs.existsSync(fallbackFilePath)) {
    fs.writeFileSync(fallbackFilePath, JSON.stringify(defaultVal, null, 2));
  }
  const raw = fs.readFileSync(fallbackFilePath, 'utf-8');
  return JSON.parse(raw);
}

async function saveCollection(key, data, fallbackFilePath) {
  const useDb = await ensureCollectionsDbReady();
  if (useDb) {
    try {
      await dbPool.query(
        'INSERT INTO site_collections (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = $2',
        [key, JSON.stringify(data)]
      );
    } catch (err) {
      console.error(`Error saving collection ${key} to DB:`, err);
    }
  }

  // Siempre escribir en local para desarrollo/seguridad
  try {
    fs.writeFileSync(fallbackFilePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing fallback file ${fallbackFilePath}:`, err);
  }
}

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

function extractR2ObjectKeyFromCoverUrl(coverUrl) {
  if (!coverUrl || typeof coverUrl !== 'string') {
    return null;
  }

  if (!/^https?:\/\//i.test(coverUrl)) {
    return null;
  }

  try {
    const parsed = new URL(coverUrl);
    const allowedHosts = [R2_PUBLIC_BASE_URL, IMAGE_PUBLIC_BASE_URL]
      .filter(Boolean)
      .map(value => {
        try {
          return new URL(value).host;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (!allowedHosts.includes(parsed.host)) {
      return null;
    }

    const key = parsed.pathname.replace(/^\/+/, '');
    return key || null;
  } catch {
    return null;
  }
}

async function deleteCoverFromR2IfNeeded(coverUrl) {
  if (!r2Client) {
    return;
  }

  const objectKey = extractR2ObjectKeyFromCoverUrl(coverUrl);
  if (!objectKey) {
    return;
  }

  try {
    await r2Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey
    }));
  } catch (error) {
    console.error('No se pudo eliminar la portada en R2:', error);
  }
}

async function uploadCoverAndGetUrl(fileData, fileName, prefix, localDir, localRoutePrefix) {
  if (!fileData || !fileName) {
    return null;
  }

  const base64Data = fileData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const contentType = fileData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

  if (r2Client) {
    const objectKey = buildStorageKey(fileName, prefix);
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read'
    }));
    return buildStoragePublicUrl(R2_PUBLIC_BASE_URL || IMAGE_PUBLIC_BASE_URL, objectKey);
  }

  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const extension = path.extname(fileName) || '.jpg';
  const nombreLimpio = path.basename(fileName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const nombreArchivo = `${Date.now()}-${nombreLimpio}${extension}`;
  const rutaFisica = path.join(localDir, nombreArchivo);
  fs.writeFileSync(rutaFisica, buffer);
  return `${localRoutePrefix}/${nombreArchivo}`;
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
  res.json({
    ok: true,
    service: 'bunker-backend',
    version: {
      label: DEPLOY_VERSION_LABEL,
      packageVersion: APP_PACKAGE_VERSION,
      commitSha: DEPLOY_COMMIT_SHA,
      commitShort: DEPLOY_COMMIT_SHORT,
      platform: DEPLOY_PLATFORM,
      bootedAt: SERVER_BOOTED_AT
    }
  });
});

// 1. ENDPOINT PARA LEER LOS LIBROS (FETCH GET)
app.get('/api/biblioteca', async (req, res) => {
  try {
    const datos = await getCollection('biblioteca', RUTA_BIBLIOTECA, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo biblioteca:", error);
    res.status(500).json({ error: "Fallo al leer biblioteca." });
  }
});

// 2. ENDPOINT PARA AÑADIR UN NUEVO LIBRO (FETCH POST)
app.post('/api/biblioteca/nuevo', async (req, res) => {
  try {
    const nuevoLibro = req.body; // Captura los datos del formulario de la web
    
    // Validamos la contraseña de seguridad
    if (nuevoLibro.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    // Leemos lo que ya hay guardado
    const datosActuales = await getCollection('biblioteca', RUTA_BIBLIOTECA, []);
    
    // Procesamos la subida del archivo si viene en base64
    if (nuevoLibro.coverFileData && nuevoLibro.coverFileName) {
      const base64Data = nuevoLibro.coverFileData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const contentType = nuevoLibro.coverFileData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

      if (r2Client) {
        const objectKey = buildStorageKey(nuevoLibro.coverFileName, 'books');
        await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read'
        }));

        const publicUrl = buildStoragePublicUrl(R2_PUBLIC_BASE_URL || IMAGE_PUBLIC_BASE_URL, objectKey);
        nuevoLibro.cover = publicUrl;
      } else {
        nuevoLibro.cover = nuevoLibro.coverFileData;
      }
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
    
    // Guardamos el archivo actualizado en el disco duro / DB
    await saveCollection('biblioteca', datosActuales, RUTA_BIBLIOTECA);
    
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
    await agregarLog(nuevoLibro.favorito ? "FAVORITOS" : "DATABASE", descLog, crtDescLog, colorLog);

    res.json({ success: true, message: 'Terminal: Registro de datos de lectura indexado.' });
  } catch (error) {
    console.error("Error guardando el libro:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/biblioteca/editar', async (req, res) => {
  try {
    const cambiosLibro = req.body || {};
    const { id, password } = cambiosLibro;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    if (!id) {
      return res.status(400).json({ error: 'ID de libro requerido para editar.' });
    }

    const datosActuales = await getCollection('biblioteca', RUTA_BIBLIOTECA, []);
    const index = datosActuales.findIndex(libro => libro.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Libro no encontrado en el registro.' });
    }

    const libroActual = datosActuales[index];
    let coverActualizada = libroActual.cover;

    if (cambiosLibro.coverFileData && cambiosLibro.coverFileName) {
      coverActualizada = await uploadCoverAndGetUrl(
        cambiosLibro.coverFileData,
        cambiosLibro.coverFileName,
        'books',
        IMG_BIBLIOTECA_DIR,
        '/img/biblioteca'
      );
      await deleteCoverFromR2IfNeeded(libroActual.cover);
    }

    const libroEditado = {
      ...libroActual,
      ...cambiosLibro,
      id: libroActual.id,
      cover: coverActualizada
    };

    delete libroEditado.password;
    delete libroEditado.coverFileData;
    delete libroEditado.coverFileName;

    if (libroEditado.favorito && libroEditado.podio) {
      datosActuales.forEach((libro, i) => {
        if (i !== index && libro.favorito && parseInt(libro.podio) === parseInt(libroEditado.podio)) {
          libro.podio = null;
        }
      });
    }

    datosActuales[index] = libroEditado;
    await saveCollection('biblioteca', datosActuales, RUTA_BIBLIOTECA);

    const descLog = `Editado libro: ${libroEditado.titulo} [UPDATE]`;
    const crtDescLog = `El bloque de lectura "${libroEditado.titulo}" ha sido actualizado en la biblioteca.`;
    await agregarLog('DATABASE', descLog, crtDescLog, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de libro editado.', libro: libroEditado });
  } catch (error) {
    console.error('Error editando libro:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/biblioteca/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body;
    
    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = await getCollection('biblioteca', RUTA_BIBLIOTECA, []);
    const libroAEliminar = datosActuales.find(l => l.id === id);

    if (!libroAEliminar) {
      return res.status(404).json({ error: 'Libro no encontrado en el registro.' });
    }

    await deleteCoverFromR2IfNeeded(libroAEliminar.cover);

    datosActuales = datosActuales.filter(l => l.id !== id);
    await saveCollection('biblioteca', datosActuales, RUTA_BIBLIOTECA);

    const descLog = `Eliminado libro: ${libroAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `El libro "${libroAEliminar.titulo}" ha sido purgado del registro de la biblioteca.`;
    await agregarLog("DATABASE", descLog, crtDescLog, "text-danger");

    res.json({ success: true, message: 'Terminal: Registro de libro eliminado.', id });
  } catch (error) {
    console.error("Error eliminando el libro:", error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});



// ========================================================
// 🖳 FUNCIÓN AUXILIAR: AGREGA REGISTROS DE ACTIVIDAD (LOGS)
// ========================================================
async function agregarLog(tag, desc, crtDesc, color = 'text-white') {
  try {
    const datosActuales = await getCollection('logs', RUTA_LOGS, []);

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

    await saveCollection('logs', logsRecortados, RUTA_LOGS);
  } catch (error) {
    console.error("Error agregando log:", error);
  }
}

// ========================================================
// ✒️ ENDPOINTS PARA FRASES / CITAS (GET / POST)
// ========================================================
app.get('/api/citas', async (req, res) => {
  try {
    const datos = await getCollection('citas', RUTA_CITAS, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo citas:", error);
    res.status(500).json({ error: "Fallo al leer citas." });
  }
});

app.post('/api/citas/nuevo', async (req, res) => {
  try {
    const nuevaCita = req.body;
    
    if (nuevaCita.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = await getCollection('citas', RUTA_CITAS, []);
    
    nuevaCita.id = `cita-${Date.now()}`;
    
    delete nuevaCita.password;

    datosActuales.push(nuevaCita);
    await saveCollection('citas', datosActuales, RUTA_CITAS);

    // Registramos la acción en el log visor
    const descLog = `Inyectada nueva cita de ${nuevaCita.autor} [ONLINE]`;
    const crtDescLog = `Inyectada nueva frase del sector "${nuevaCita.autor}" en la base de datos de transmisiones.`;
    await agregarLog("CITAS", descLog, crtDescLog, "text-neon-magenta");

    res.json({ success: true, message: 'Terminal: Registro de datos de cita indexado.' });
  } catch (error) {
    console.error("Error guardando la cita:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/citas/editar', async (req, res) => {
  try {
    const cambiosCita = req.body || {};
    const { id, password } = cambiosCita;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    if (!id) {
      return res.status(400).json({ error: 'ID de cita requerido para editar.' });
    }

    const datosActuales = await getCollection('citas', RUTA_CITAS, []);
    const index = datosActuales.findIndex(cita => cita.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Cita no encontrada en el registro.' });
    }

    const citaEditada = {
      ...datosActuales[index],
      ...cambiosCita,
      id
    };

    delete citaEditada.password;
    datosActuales[index] = citaEditada;
    await saveCollection('citas', datosActuales, RUTA_CITAS);

    const descLog = `Editada cita de: ${citaEditada.autor} [UPDATE]`;
    const crtDescLog = `La cita de "${citaEditada.autor}" ha sido actualizada en el registro de citas.`;
    await agregarLog('CITAS', descLog, crtDescLog, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de cita editado.', cita: citaEditada });
  } catch (error) {
    console.error('Error editando cita:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/citas/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body;
    
    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = await getCollection('citas', RUTA_CITAS, []);
    const citaAEliminar = datosActuales.find(c => c.id === id);

    if (!citaAEliminar) {
      return res.status(404).json({ error: 'Cita no encontrada en el registro.' });
    }

    datosActuales = datosActuales.filter(c => c.id !== id);
    await saveCollection('citas', datosActuales, RUTA_CITAS);

    const descLog = `Eliminada cita de: ${citaAEliminar.autor} [OFFLINE]`;
    const crtDescLog = `La cita de "${citaAEliminar.autor}" ha sido purgada del registro de citas.`;
    await agregarLog("CITAS", descLog, crtDescLog, "text-danger");

    res.json({ success: true, message: 'Terminal: Registro de cita eliminado.', id });
  } catch (error) {
    console.error("Error eliminando la cita:", error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});


// ========================================================
// 🖳 ENDPOINT PARA LEER LOS LOGS DE ACTIVIDAD (GET)
// ========================================================
app.get('/api/logs', async (req, res) => {
  try {
    const datos = await getCollection('logs', RUTA_LOGS, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo logs:", error);
    res.status(500).json({ error: "Fallo al leer logs." });
  }
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
app.get('/api/series', async (req, res) => {
  try {
    const datos = await getCollection('series', RUTA_SERIES, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo series:", error);
    res.status(500).json({ error: "Fallo al leer series." });
  }
});

app.post('/api/series/nuevo', async (req, res) => {
  try {
    const nuevaSerie = req.body;
    
    if (nuevaSerie.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = await getCollection('series', RUTA_SERIES, []);
    
    if (nuevaSerie.coverFileData && nuevaSerie.coverFileName) {
      const base64Data = nuevaSerie.coverFileData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const contentType = nuevaSerie.coverFileData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

      if (r2Client) {
        const objectKey = buildStorageKey(nuevaSerie.coverFileName, 'series');
        await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read'
        }));

        nuevaSerie.cover = buildStoragePublicUrl(R2_PUBLIC_BASE_URL || IMAGE_PUBLIC_BASE_URL, objectKey);
      } else {
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
    }

    nuevaSerie.id = `serie-${Date.now()}`;
    
    delete nuevaSerie.coverFileData;
    delete nuevaSerie.coverFileName;
    delete nuevaSerie.password;

    datosActuales.push(nuevaSerie);
    await saveCollection('series', datosActuales, RUTA_SERIES);

    const descLog = `Inyectada nueva serie: ${nuevaSerie.titulo} [ONLINE]`;
    const crtDescLog = `La serie "${nuevaSerie.titulo}" ha sido indexada en el registro de favoritos.`;
    await agregarLog("FAVORITOS", descLog, crtDescLog, "text-neon-cyan");

    res.json({ success: true, message: 'Terminal: Registro de serie indexado.' });
  } catch (error) {
    console.error("Error guardando la serie:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/series/editar', async (req, res) => {
  try {
    const cambiosSerie = req.body || {};
    const { id, password } = cambiosSerie;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de serie requerido para editar.' });
    }

    const datosActuales = await getCollection('series', RUTA_SERIES, []);
    const index = datosActuales.findIndex(serie => serie.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Serie no encontrada.' });
    }

    const serieActual = datosActuales[index];
    let coverActualizada = serieActual.cover;
    if (cambiosSerie.coverFileData && cambiosSerie.coverFileName) {
      coverActualizada = await uploadCoverAndGetUrl(
        cambiosSerie.coverFileData,
        cambiosSerie.coverFileName,
        'series',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      );
      await deleteCoverFromR2IfNeeded(serieActual.cover);
    }

    const serieEditada = {
      ...serieActual,
      ...cambiosSerie,
      id,
      cover: coverActualizada
    };
    delete serieEditada.password;
    delete serieEditada.coverFileData;
    delete serieEditada.coverFileName;

    datosActuales[index] = serieEditada;
    await saveCollection('series', datosActuales, RUTA_SERIES);
    await agregarLog('FAVORITOS', `Editada serie: ${serieEditada.titulo} [UPDATE]`, `La serie "${serieEditada.titulo}" ha sido actualizada.`, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de serie editado.', serie: serieEditada });
  } catch (error) {
    console.error('Error editando la serie:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/series/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = await getCollection('series', RUTA_SERIES, []);

    const serieAEliminar = datosActuales.find(s => s.id === id);
    if (!serieAEliminar) {
      return res.status(404).json({ error: 'Serie no encontrada.' });
    }

    await deleteCoverFromR2IfNeeded(serieAEliminar.cover);

    datosActuales = datosActuales.filter(s => s.id !== id);
    await saveCollection('series', datosActuales, RUTA_SERIES);

    const descLog = `Eliminada serie: ${serieAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `La serie "${serieAEliminar.titulo}" fue purgada del registro de favoritos.`;
    await agregarLog('FAVORITOS', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: 'Terminal: Registro de serie eliminado.', id });
  } catch (error) {
    console.error('Error eliminando la serie:', error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 🎬 ENDPOINTS PARA PELÍCULAS (GET / POST)
// ========================================================
app.get('/api/peliculas', async (req, res) => {
  try {
    const datos = await getCollection('peliculas', RUTA_PELICULAS, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo peliculas:", error);
    res.status(500).json({ error: "Fallo al leer peliculas." });
  }
});

app.post('/api/peliculas/nuevo', async (req, res) => {
  try {
    const nuevaPelicula = req.body;
    
    if (nuevaPelicula.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = await getCollection('peliculas', RUTA_PELICULAS, []);
    
    if (nuevaPelicula.coverFileData && nuevaPelicula.coverFileName) {
      const base64Data = nuevaPelicula.coverFileData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const contentType = nuevaPelicula.coverFileData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

      if (r2Client) {
        const objectKey = buildStorageKey(nuevaPelicula.coverFileName, 'peliculas');
        await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read'
        }));

        nuevaPelicula.cover = buildStoragePublicUrl(R2_PUBLIC_BASE_URL || IMAGE_PUBLIC_BASE_URL, objectKey);
      } else {
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
    }

    nuevaPelicula.id = `pelicula-${Date.now()}`;
    
    delete nuevaPelicula.coverFileData;
    delete nuevaPelicula.coverFileName;
    delete nuevaPelicula.password;

    datosActuales.push(nuevaPelicula);
    await saveCollection('peliculas', datosActuales, RUTA_PELICULAS);

    const descLog = `Inyectada nueva película: ${nuevaPelicula.titulo} [ONLINE]`;
    const crtDescLog = `La película "${nuevaPelicula.titulo}" ha sido indexada en el registro de favoritos.`;
    await agregarLog("FAVORITOS", descLog, crtDescLog, "text-neon-magenta");

    res.json({ success: true, message: 'Terminal: Registro de película indexado.', movie: nuevaPelicula });
  } catch (error) {
    console.error("Error guardando la película:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/peliculas/editar', async (req, res) => {
  try {
    const cambiosPelicula = req.body || {};
    const { id, password } = cambiosPelicula;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de película requerido para editar.' });
    }

    const datosActuales = await getCollection('peliculas', RUTA_PELICULAS, []);
    const index = datosActuales.findIndex(pelicula => pelicula.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Película no encontrada.' });
    }

    const peliculaActual = datosActuales[index];
    let coverActualizada = peliculaActual.cover;
    if (cambiosPelicula.coverFileData && cambiosPelicula.coverFileName) {
      coverActualizada = await uploadCoverAndGetUrl(
        cambiosPelicula.coverFileData,
        cambiosPelicula.coverFileName,
        'peliculas',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      );
      await deleteCoverFromR2IfNeeded(peliculaActual.cover);
    }

    const peliculaEditada = {
      ...peliculaActual,
      ...cambiosPelicula,
      id,
      cover: coverActualizada
    };
    delete peliculaEditada.password;
    delete peliculaEditada.coverFileData;
    delete peliculaEditada.coverFileName;

    datosActuales[index] = peliculaEditada;
    await saveCollection('peliculas', datosActuales, RUTA_PELICULAS);
    await agregarLog('FAVORITOS', `Editada película: ${peliculaEditada.titulo} [UPDATE]`, `La película "${peliculaEditada.titulo}" ha sido actualizada.`, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de película editado.', pelicula: peliculaEditada });
  } catch (error) {
    console.error('Error editando la película:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/peliculas/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = await getCollection('peliculas', RUTA_PELICULAS, []);

    const peliculaAEliminar = datosActuales.find(p => p.id === id);
    if (!peliculaAEliminar) {
      return res.status(404).json({ error: 'Película no encontrada.' });
    }

    await deleteCoverFromR2IfNeeded(peliculaAEliminar.cover);

    datosActuales = datosActuales.filter(p => p.id !== id);
    await saveCollection('peliculas', datosActuales, RUTA_PELICULAS);

    const descLog = `Eliminada película: ${peliculaAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `La película "${peliculaAEliminar.titulo}" fue purgada del registro de favoritos.`;
    await agregarLog('FAVORITOS', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: 'Terminal: Registro de película eliminado.', id });
  } catch (error) {
    console.error('Error eliminando la película:', error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 👤 ENDPOINTS PARA PERSONAJES (GET / POST)
// ========================================================
app.get('/api/personajes', async (req, res) => {
  try {
    const datos = await getCollection('personajes', RUTA_PERSONAJES, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo personajes:", error);
    res.status(500).json({ error: "Fallo al leer personajes." });
  }
});

app.post('/api/personajes/nuevo', async (req, res) => {
  try {
    const nuevoPersonaje = req.body;
    
    if (nuevoPersonaje.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = await getCollection('personajes', RUTA_PERSONAJES, []);
    
    if (nuevoPersonaje.coverFileData && nuevoPersonaje.coverFileName) {
      const base64Data = nuevoPersonaje.coverFileData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const contentType = nuevoPersonaje.coverFileData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

      if (r2Client) {
        const objectKey = buildStorageKey(nuevoPersonaje.coverFileName, 'personajes');
        await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read'
        }));

        nuevoPersonaje.cover = buildStoragePublicUrl(R2_PUBLIC_BASE_URL || IMAGE_PUBLIC_BASE_URL, objectKey);
      } else {
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
    }

    nuevoPersonaje.id = `personaje-${Date.now()}`;
    
    // Asignar el subjectId dinámicamente: SUBJECT_XX
    const count = datosActuales.length;
    nuevoPersonaje.subjectId = `SUBJECT_${String(count + 1).padStart(2, '0')}`;

    delete nuevoPersonaje.coverFileData;
    delete nuevoPersonaje.coverFileName;
    delete nuevoPersonaje.password;

    datosActuales.push(nuevoPersonaje);
    await saveCollection('personajes', datosActuales, RUTA_PERSONAJES);

    const descLog = `Inyectada nueva ficha de personaje: ${nuevoPersonaje.nombre} [ONLINE]`;
    const crtDescLog = `El personaje "${nuevoPersonaje.nombre}" ha sido indexado en el registro de sujetos clasificados.`;
    await agregarLog("FAVORITOS", descLog, crtDescLog, "text-warning");

    res.json({ success: true, message: 'Terminal: Registro de personaje indexado.', personaje: nuevoPersonaje });
  } catch (error) {
    console.error("Error guardando el personaje:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/personajes/editar', async (req, res) => {
  try {
    const cambiosPersonaje = req.body || {};
    const { id, password } = cambiosPersonaje;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de personaje requerido para editar.' });
    }

    const datosActuales = await getCollection('personajes', RUTA_PERSONAJES, []);
    const index = datosActuales.findIndex(personaje => personaje.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Personaje no encontrado.' });
    }

    const personajeActual = datosActuales[index];
    let coverActualizada = personajeActual.cover;
    if (cambiosPersonaje.coverFileData && cambiosPersonaje.coverFileName) {
      coverActualizada = await uploadCoverAndGetUrl(
        cambiosPersonaje.coverFileData,
        cambiosPersonaje.coverFileName,
        'personajes',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      );
      await deleteCoverFromR2IfNeeded(personajeActual.cover);
    }

    const personajeEditado = {
      ...personajeActual,
      ...cambiosPersonaje,
      id,
      subjectId: personajeActual.subjectId,
      cover: coverActualizada
    };
    delete personajeEditado.password;
    delete personajeEditado.coverFileData;
    delete personajeEditado.coverFileName;

    datosActuales[index] = personajeEditado;
    await saveCollection('personajes', datosActuales, RUTA_PERSONAJES);
    await agregarLog('FAVORITOS', `Editado personaje: ${personajeEditado.nombre} [UPDATE]`, `La ficha de "${personajeEditado.nombre}" ha sido actualizada.`, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de personaje editado.', personaje: personajeEditado });
  } catch (error) {
    console.error('Error editando el personaje:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/personajes/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = await getCollection('personajes', RUTA_PERSONAJES, []);

    const personajeAEliminar = datosActuales.find(p => p.id === id);
    if (!personajeAEliminar) {
      return res.status(404).json({ error: 'Personaje no encontrado.' });
    }

    await deleteCoverFromR2IfNeeded(personajeAEliminar.cover);

    datosActuales = datosActuales.filter(p => p.id !== id);
    await saveCollection('personajes', datosActuales, RUTA_PERSONAJES);

    const descLog = `Eliminado personaje: ${personajeAEliminar.nombre} [OFFLINE]`;
    const crtDescLog = `El personaje "${personajeAEliminar.nombre}" fue purgado del registro de sujetos clasificados.`;
    await agregarLog('FAVORITOS', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: 'Terminal: Registro de personaje eliminado.', id });
  } catch (error) {
    console.error('Error eliminando el personaje:', error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 🎙️ ENDPOINTS PARA ENTREVISTAS (GET / POST)
// ========================================================
app.get('/api/entrevistas', async (req, res) => {
  try {
    const datos = await getCollection('entrevistas', RUTA_ENTREVISTAS, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo entrevistas:", error);
    res.status(500).json({ error: "Fallo al leer entrevistas." });
  }
});

app.post('/api/entrevistas/nuevo', async (req, res) => {
  try {
    const nuevaEntrevista = req.body;
    
    if (nuevaEntrevista.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = await getCollection('entrevistas', RUTA_ENTREVISTAS, []);

    nuevaEntrevista.id = `entrevista-${Date.now()}`;
    
    delete nuevaEntrevista.password;

    datosActuales.push(nuevaEntrevista);
    await saveCollection('entrevistas', datosActuales, RUTA_ENTREVISTAS);

    const descLog = `Inyectada nueva entrevista: ${nuevaEntrevista.nombre} [ONLINE]`;
    const crtDescLog = `La entrevista con "${nuevaEntrevista.nombre}" ha sido indexada en el registro del Búnker.`;
    await agregarLog("FAVORITOS", descLog, crtDescLog, "text-warning");

    res.json({ success: true, message: 'Terminal: Registro de entrevista indexado.', entrevista: nuevaEntrevista });
  } catch (error) {
    console.error("Error guardando la entrevista:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/entrevistas/editar', async (req, res) => {
  try {
    const cambiosEntrevista = req.body || {};
    const { id, password } = cambiosEntrevista;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de entrevista requerido para editar.' });
    }

    const datosActuales = await getCollection('entrevistas', RUTA_ENTREVISTAS, []);
    const index = datosActuales.findIndex(entrevista => entrevista.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Entrevista no encontrada.' });
    }

    const entrevistaEditada = {
      ...datosActuales[index],
      ...cambiosEntrevista,
      id
    };
    delete entrevistaEditada.password;

    datosActuales[index] = entrevistaEditada;
    await saveCollection('entrevistas', datosActuales, RUTA_ENTREVISTAS);
    await agregarLog('FAVORITOS', `Editada entrevista: ${entrevistaEditada.nombre} [UPDATE]`, `La entrevista con "${entrevistaEditada.nombre}" ha sido actualizada.`, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de entrevista editado.', entrevista: entrevistaEditada });
  } catch (error) {
    console.error('Error editando la entrevista:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/entrevistas/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body || {};

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de entrevista requerido para eliminar.' });
    }

    const datosActuales = await getCollection('entrevistas', RUTA_ENTREVISTAS, []);
    const entrevistaAEliminar = datosActuales.find(entry => entry.id === id);
    if (!entrevistaAEliminar) {
      return res.status(404).json({ error: 'Entrevista no encontrada.' });
    }

    const actualizados = datosActuales.filter(entry => entry.id !== id);
    await saveCollection('entrevistas', actualizados, RUTA_ENTREVISTAS);

    await agregarLog(
      'FAVORITOS',
      `Eliminada entrevista: ${entrevistaAEliminar.nombre} [OFFLINE]`,
      `La entrevista con "${entrevistaAEliminar.nombre}" fue purgada del registro.`,
      'text-danger'
    );

    res.json({ success: true, message: 'Terminal: Registro de entrevista eliminado.', id });
  } catch (error) {
    console.error('Error eliminando entrevista:', error);
    res.status(500).json({ error: 'Fallo al eliminar el bloque de datos.' });
  }
});

// ========================================================
// 🎮 ENDPOINTS PARA JUEGOS (GET / POST / ELIMINAR)
// ========================================================
app.get('/api/juegos', async (req, res) => {
  try {
    const datos = await getCollection('juegos', RUTA_JUEGOS, []);
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo juegos:", error);
    res.status(500).json({ error: "Fallo al leer juegos." });
  }
});

app.post('/api/juegos/nuevo', async (req, res) => {
  try {
    const nuevoJuego = req.body;
    
    if (nuevoJuego.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    const datosActuales = await getCollection('juegos', RUTA_JUEGOS, []);

    if (nuevoJuego.coverFileData && nuevoJuego.coverFileName) {
      nuevoJuego.imagen = await uploadCoverAndGetUrl(
        nuevoJuego.coverFileData,
        nuevoJuego.coverFileName,
        'games',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      ) || (nuevoJuego.imagen || '');
    } else if (typeof nuevoJuego.imagen === 'string' && /^data:image\//i.test(nuevoJuego.imagen)) {
      nuevoJuego.imagen = await uploadCoverAndGetUrl(
        nuevoJuego.imagen,
        `game-${Date.now()}.png`,
        'games',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      ) || nuevoJuego.imagen;
    }

    nuevoJuego.id = `juego-${Date.now()}`;

    delete nuevoJuego.coverFileData;
    delete nuevoJuego.coverFileName;
    delete nuevoJuego.password;

    datosActuales.push(nuevoJuego);
    await saveCollection('juegos', datosActuales, RUTA_JUEGOS);

    const descLog = `Inyectado nuevo juego: ${nuevoJuego.titulo} [ONLINE]`;
    const crtDescLog = `El juego "${nuevoJuego.titulo}" ha sido indexada en el registro del Búnker.`;
    await agregarLog("GAMING", descLog, crtDescLog, "text-neon-cyan");

    res.json({ success: true, message: 'Terminal: Registro de juego indexado.', juego: nuevoJuego });
  } catch (error) {
    console.error("Error guardando el juego:", error);
    res.status(500).json({ error: 'Fallo en la escritura del bloque de datos.' });
  }
});

app.post('/api/juegos/editar', async (req, res) => {
  try {
    const cambiosJuego = req.body || {};
    const { id, password } = cambiosJuego;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de juego requerido para editar.' });
    }

    const datosActuales = await getCollection('juegos', RUTA_JUEGOS, []);
    const index = datosActuales.findIndex(juego => juego.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Juego no encontrado en el registro.' });
    }

    const juegoActual = datosActuales[index];
    let imagenActualizada = String(juegoActual.imagen || '');

    if (cambiosJuego.coverFileData && cambiosJuego.coverFileName) {
      imagenActualizada = await uploadCoverAndGetUrl(
        cambiosJuego.coverFileData,
        cambiosJuego.coverFileName,
        'games',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      ) || imagenActualizada;
      await deleteCoverFromR2IfNeeded(juegoActual.imagen);
    } else if (typeof cambiosJuego.imagen === 'string' && /^data:image\//i.test(cambiosJuego.imagen)) {
      imagenActualizada = await uploadCoverAndGetUrl(
        cambiosJuego.imagen,
        `game-${Date.now()}.png`,
        'games',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      ) || imagenActualizada;
      await deleteCoverFromR2IfNeeded(juegoActual.imagen);
    } else if (typeof cambiosJuego.imagen === 'string' && cambiosJuego.imagen.trim()) {
      imagenActualizada = cambiosJuego.imagen.trim();
    }

    const juegoEditado = {
      ...juegoActual,
      ...cambiosJuego,
      id,
      imagen: imagenActualizada
    };
    delete juegoEditado.password;
    delete juegoEditado.coverFileData;
    delete juegoEditado.coverFileName;

    datosActuales[index] = juegoEditado;
    await saveCollection('juegos', datosActuales, RUTA_JUEGOS);
    await agregarLog('GAMING', `Editado juego: ${juegoEditado.titulo} [UPDATE]`, `El juego "${juegoEditado.titulo}" fue actualizado en el registro.`, 'text-warning');

    res.json({ success: true, message: 'Terminal: Registro de juego editado.', juego: juegoEditado });
  } catch (error) {
    console.error('Error editando juego:', error);
    res.status(500).json({ error: 'Fallo al editar el bloque de datos.' });
  }
});

app.post('/api/juegos/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body;
    
    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    let datosActuales = await getCollection('juegos', RUTA_JUEGOS, []);
    const juegoAEliminar = datosActuales.find(j => j.id === id);

    if (!juegoAEliminar) {
      return res.status(404).json({ error: 'Juego no encontrado en el registro.' });
    }

    await deleteCoverFromR2IfNeeded(juegoAEliminar.imagen);

    datosActuales = datosActuales.filter(j => j.id !== id);
    await saveCollection('juegos', datosActuales, RUTA_JUEGOS);

    const descLog = `Eliminado juego: ${juegoAEliminar.titulo} [OFFLINE]`;
    const crtDescLog = `El juego "${juegoAEliminar.titulo}" ha sido purgado del registro del Búnker.`;
    await agregarLog("GAMING", descLog, crtDescLog, "text-danger");

    res.json({ success: true, message: 'Terminal: Registro de juego eliminado.', id });
  } catch (error) {
    console.error("Error eliminando el juego:", error);
    res.status(500).json({ error: 'Fallo en la purga del bloque de datos.' });
  }
});

// ========================================================
// 📡 ENDPOINTS PARA REDES SOCIALES (GET)
// ========================================================
app.get('/api/redes', async (req, res) => {
  try {
    const datos = await getCollection('redes', RUTA_REDES, { instagram: [], tiktok: [], wattpad: [] });
    res.json(datos);
  } catch (error) {
    console.error("Error leyendo redes:", error);
    res.status(500).json({ error: "Fallo al leer redes." });
  }
});

// ========================================================
// 📡 ENDPOINTS PARA REDES SOCIALES (POST / DELETE)
// ========================================================
app.post('/api/redes/nuevo', async (req, res) => {
  try {
    const { red, embedHtml, password, imageFileData, imageFileName } = req.body;

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
    let cleanEmbed = embedHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Procesar la subida del archivo si viene en base64
    if (imageFileData && imageFileName) {
      const uploadedImageUrl = await uploadCoverAndGetUrl(
        imageFileData,
        imageFileName,
        `redes/${red}`,
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      );
      if (uploadedImageUrl) {
        cleanEmbed = cleanEmbed.replace(/__IMAGE_PLACEHOLDER__/g, uploadedImageUrl);
      }
    }

    const datos = await getCollection('redes', RUTA_REDES, { instagram: [], tiktok: [], wattpad: [] });

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

    await saveCollection('redes', datos, RUTA_REDES);

    const descLog = `Inyectado nuevo post en ${red.toUpperCase()} [ONLINE]`;
    const crtDescLog = `El sector ${red.toUpperCase()} recibió una nueva publicación y el feed fue resincronizado.`;
    const colorLog = red === 'instagram'
      ? 'text-neon-magenta'
      : red === 'tiktok'
        ? 'text-neon-cyan'
        : 'text-warning';
    await agregarLog('REDES', descLog, crtDescLog, colorLog);

    res.json({ success: true, message: `Post añadido a ${red.toUpperCase()}.` });
  } catch (error) {
    console.error('Error añadiendo post a redes:', error);
    res.status(500).json({ error: 'Fallo al añadir el post.' });
  }
});

app.post('/api/redes/editar/:red/:id', async (req, res) => {
  try {
    const { red, id } = req.params;
    const { embedHtml, password, imageFileData, imageFileName } = req.body || {};

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    const redesValidas = ['instagram', 'tiktok', 'wattpad'];
    if (!redesValidas.includes(red)) {
      return res.status(400).json({ error: 'Red no válida. Usa: instagram, tiktok o wattpad.' });
    }

    const datos = await getCollection('redes', RUTA_REDES, { instagram: [], tiktok: [], wattpad: [] });
    const index = datos[red].findIndex(post => post.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Post no encontrado.' });
    }

    let cleanEmbed = String(embedHtml || '').replace(/<script[\s\S]*?<\/script>/gi, '').trim();
    if (!cleanEmbed) {
      cleanEmbed = datos[red][index].embedHtml || '';
    }

    if (imageFileData && imageFileName) {
      const currentEmbed = String(datos[red][index].embedHtml || '');
      const currentImgMatch = currentEmbed.match(/(?:src|href)=["']([^"']+)["']/i);
      const uploadedImageUrl = await uploadCoverAndGetUrl(
        imageFileData,
        imageFileName,
        `redes/${red}`,
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      );
      if (uploadedImageUrl) {
        cleanEmbed = cleanEmbed.replace(/__IMAGE_PLACEHOLDER__/g, uploadedImageUrl);
      }
      if (currentImgMatch && currentImgMatch[1]) {
        await deleteCoverFromR2IfNeeded(currentImgMatch[1]);
      }
    }

    datos[red][index] = {
      ...datos[red][index],
      embedHtml: cleanEmbed,
      updatedAt: new Date().toISOString()
    };

    await saveCollection('redes', datos, RUTA_REDES);

    const descLog = `Editado post en ${red.toUpperCase()} [UPDATE]`;
    const crtDescLog = `Se actualizó un registro del sector ${red.toUpperCase()} (${id}).`;
    await agregarLog('REDES', descLog, crtDescLog, 'text-warning');

    res.json({ success: true, message: `Post editado en ${red.toUpperCase()}.`, post: datos[red][index] });
  } catch (error) {
    console.error('Error editando post de redes:', error);
    res.status(500).json({ error: 'Fallo al editar el post.' });
  }
});

app.delete('/api/redes/eliminar/:red/:id', async (req, res) => {
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

    const datos = await getCollection('redes', RUTA_REDES, { instagram: [], tiktok: [], wattpad: [] });

    const index = datos[red].findIndex(post => post.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Post no encontrado.' });
    }

    const [postEliminado] = datos[red].splice(index, 1);
    const embed = String(postEliminado?.embedHtml || '');
    const imageMatch = embed.match(/(?:src|href)=["']([^"']+)["']/i);
    if (imageMatch && imageMatch[1]) {
      await deleteCoverFromR2IfNeeded(imageMatch[1]);
    }

    await saveCollection('redes', datos, RUTA_REDES);

    const descLog = `Eliminado post de ${red.toUpperCase()} [OFFLINE]`;
    const crtDescLog = `Un registro del sector ${red.toUpperCase()} fue purgado (${postEliminado?.id || id}).`;
    await agregarLog('REDES', descLog, crtDescLog, 'text-danger');

    res.json({ success: true, message: `Post eliminado de ${red.toUpperCase()}.` });
  } catch (error) {
    console.error('Error eliminando post de redes:', error);
    res.status(500).json({ error: 'Fallo al eliminar el post.' });
  }
});

// ========================================================
// 📓 ENDPOINTS PARA BITÁCORA EXCLUSIVA (GET / POST)
// ========================================================
app.get('/api/bitacora', async (req, res) => {
  try {
    const datos = await getCollection('bitacora', RUTA_BITACORA, []);
    res.json(Array.isArray(datos) ? datos : []);
  } catch (error) {
    console.error('Error leyendo bitácora:', error);
    res.status(500).json({ error: 'Fallo al leer bitácora.' });
  }
});

app.post('/api/bitacora/nuevo', async (req, res) => {
  try {
    const nuevaEntrada = req.body || {};

    if (nuevaEntrada.password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }

    if (!nuevaEntrada.titulo || !String(nuevaEntrada.titulo).trim()) {
      return res.status(400).json({ error: 'El título de la entrada es obligatorio.' });
    }

    const datosActuales = await getCollection('bitacora', RUTA_BITACORA, []);
    let miniaturaFinal = String(nuevaEntrada.miniatura || '').trim();

    if (nuevaEntrada.miniaturaFileData && nuevaEntrada.miniaturaFileName) {
      miniaturaFinal = await uploadCoverAndGetUrl(
        nuevaEntrada.miniaturaFileData,
        nuevaEntrada.miniaturaFileName,
        'bitacora',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      ) || miniaturaFinal;
    }

    const entrada = {
      id: `bitacora-${Date.now()}`,
      capitulo: String(nuevaEntrada.capitulo || '').trim() || '00',
      fecha: String(nuevaEntrada.fecha || '').trim() || new Date().toISOString().slice(0, 10),
      tipo: String(nuevaEntrada.tipo || 'BITACORA').trim().toUpperCase(),
      spoiler: String(nuevaEntrada.spoiler || 'MEDIO').trim().toUpperCase(),
      titulo: String(nuevaEntrada.titulo || '').trim(),
      descripcion: String(nuevaEntrada.descripcion || '').trim(),
      miniatura: miniaturaFinal,
      url: String(nuevaEntrada.url || '').trim(),
      createdAt: new Date().toISOString()
    };

    datosActuales.unshift(entrada);
    await saveCollection('bitacora', datosActuales, RUTA_BITACORA);

    await agregarLog(
      'FAVORITOS',
      `Nueva entrada de bitácora: ${entrada.titulo} [ONLINE]`,
      `Se publicó un registro exclusivo del capítulo ${entrada.capitulo}.`,
      'text-neon-purple'
    );

    res.json({ success: true, message: 'Terminal: Registro de bitácora indexado.', entry: entrada });
  } catch (error) {
    console.error('Error guardando bitácora:', error);
    res.status(500).json({ error: 'Fallo en la escritura de bitácora.' });
  }
});

app.post('/api/bitacora/editar', async (req, res) => {
  try {
    const cambios = req.body || {};
    const { id, password } = cambios;

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de bitácora requerido para editar.' });
    }

    const datosActuales = await getCollection('bitacora', RUTA_BITACORA, []);
    const index = datosActuales.findIndex(item => item.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Entrada de bitácora no encontrada.' });
    }

    const actual = datosActuales[index];
    let miniaturaActualizada = String(cambios.miniatura || actual.miniatura || '').trim();

    if (cambios.miniaturaFileData && cambios.miniaturaFileName) {
      miniaturaActualizada = await uploadCoverAndGetUrl(
        cambios.miniaturaFileData,
        cambios.miniaturaFileName,
        'bitacora',
        IMG_FAVORITOS_DIR,
        '/img/favoritos'
      ) || miniaturaActualizada;

      await deleteCoverFromR2IfNeeded(actual.miniatura);
    }

    const editada = {
      ...actual,
      capitulo: String(cambios.capitulo || actual.capitulo || '').trim() || '00',
      fecha: String(cambios.fecha || actual.fecha || '').trim() || new Date().toISOString().slice(0, 10),
      tipo: String(cambios.tipo || actual.tipo || 'BITACORA').trim().toUpperCase(),
      spoiler: String(cambios.spoiler || actual.spoiler || 'MEDIO').trim().toUpperCase(),
      titulo: String(cambios.titulo || actual.titulo || '').trim(),
      descripcion: String(cambios.descripcion || actual.descripcion || '').trim(),
      miniatura: miniaturaActualizada,
      url: String(cambios.url || actual.url || '').trim(),
      id,
      updatedAt: new Date().toISOString()
    };

    delete editada.miniaturaFileData;
    delete editada.miniaturaFileName;

    datosActuales[index] = editada;
    await saveCollection('bitacora', datosActuales, RUTA_BITACORA);

    await agregarLog(
      'FAVORITOS',
      `Editada entrada de bitácora: ${editada.titulo} [UPDATE]`,
      `Se actualizó un registro exclusivo del capítulo ${editada.capitulo}.`,
      'text-warning'
    );

    res.json({ success: true, message: 'Terminal: Registro de bitácora editado.', entry: editada });
  } catch (error) {
    console.error('Error editando bitácora:', error);
    res.status(500).json({ error: 'Fallo al editar bitácora.' });
  }
});

app.post('/api/bitacora/eliminar', async (req, res) => {
  try {
    const { id, password } = req.body || {};

    if (password !== BIBLIOTECA_PASSWORD) {
      return res.status(401).json({ error: 'Código de acceso incorrecto. Interrupción del sector.' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID de bitácora requerido para eliminar.' });
    }

    const datosActuales = await getCollection('bitacora', RUTA_BITACORA, []);
    const item = datosActuales.find(entry => entry.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Entrada de bitácora no encontrada.' });
    }

    await deleteCoverFromR2IfNeeded(item.miniatura);

    const actualizados = datosActuales.filter(entry => entry.id !== id);
    await saveCollection('bitacora', actualizados, RUTA_BITACORA);

    await agregarLog(
      'FAVORITOS',
      `Eliminada entrada de bitácora: ${item.titulo} [OFFLINE]`,
      `Se purgó un registro exclusivo del capítulo ${item.capitulo}.`,
      'text-danger'
    );

    res.json({ success: true, message: 'Terminal: Registro de bitácora eliminado.', id });
  } catch (error) {
    console.error('Error eliminando bitácora:', error);
    res.status(500).json({ error: 'Fallo al eliminar bitácora.' });
  }
});

app.listen(PORT, () => {
  console.log(`============= BÚNKER SERVER ONLINE =============`);
  console.log(`🎧 Deck listo en puerto: ${PORT}`);
  console.log(`================================================`);
});
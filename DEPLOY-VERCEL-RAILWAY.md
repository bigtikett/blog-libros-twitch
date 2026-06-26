# Deploy frontend (Vercel) + backend (Railway)

## Alternativa 100% gratuita y sencilla (recomendada)

Si no quieres depender del trial de Railway, la opcion mas simple para ti es:

- Backend: **Render (Web Service free)**
- Base de datos: **Supabase Postgres free** (o Neon free)
- Audio: **Cloudflare R2 free**

Es mas facil que Oracle Cloud y suficiente para este proyecto.

### Backend en Render (paso a paso)

1. Crea cuenta en Render y conecta tu GitHub.
2. `New +` -> `Web Service` -> selecciona este repo.
3. Configura:
- Root Directory: `backend`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
4. Variables de entorno en Render:
- `ALLOWED_ORIGINS` = `https://riddleyai.vercel.app`
- `DATABASE_URL` = (conexion de Supabase/Neon)
- `DATABASE_SSL` = `true`
- `AUDIO_PUBLIC_BASE_URL` = `https://TU_DOMINIO_PUBLICO_R2/audio`

Render inyecta `PORT` automaticamente, no hace falta definirlo manualmente.

### Base de datos gratis (Supabase)

1. Crea proyecto en Supabase (free).
2. Ve a `Project Settings -> Database` y copia la connection string de Postgres.
3. Pegala en `DATABASE_URL` de Render.
4. Deja `DATABASE_SSL=true`.

### Migracion de playlist (igual que ya tienes)

Con el backend levantado en Render:

1. `POST https://TU_BACKEND_RENDER/api/playlist/sync`
2. `POST https://TU_BACKEND_RENDER/api/playlist/rebase-urls`

Body del segundo:

```json
{ "password": "TU_PASSWORD_BIBLIOTECA", "baseUrl": "https://TU_DOMINIO_PUBLICO_R2/audio" }
```

Despues conectas Vercel con rewrite apuntando a tu URL de Render.

## 1) Subir el proyecto a GitHub

1. Crea un repo nuevo en GitHub (por ejemplo: `blog-libros-twitch`).
2. Desde la raiz del proyecto local:

```bash
git init
git add .
git commit -m "chore: split backend/frontend + deploy ready"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/blog-libros-twitch.git
git push -u origin main
```

## 2) Desplegar backend en Railway

1. En Railway: `New Project` -> `Deploy from GitHub Repo`.
2. Selecciona este repo.
3. Configura:
- Root Directory: `backend`
- Start Command: `npm start`

4. Variables de entorno en Railway:
- `PORT` = `3000`
- `ALLOWED_ORIGINS` = `https://riddleyai.vercel.app`
- `DATABASE_URL` = (la inyecta Railway si anades PostgreSQL al proyecto)
- `DATABASE_SSL` = `true`
- `AUDIO_PUBLIC_BASE_URL` = `https://TU_CDN_O_BUCKET/audio` (sin slash final)

5. Espera a que termine el build y copia la URL publica, por ejemplo:
- `https://riddleyai-backend.up.railway.app`

6. Comprueba health:
- `https://TU_BACKEND_RAILWAY/api/health`

7. (Opcional recomendado) Sincroniza la musica desde carpetas a PostgreSQL:
- `POST https://TU_BACKEND_RAILWAY/api/playlist/sync`
- Body JSON: `{ "password": "TU_PASSWORD_BIBLIOTECA" }`

8. (Opcional recomendado) Reescribe rutas locales `/audio/...` a tu CDN/bucket:
- `POST https://TU_BACKEND_RAILWAY/api/playlist/rebase-urls`
- Body JSON: `{ "password": "TU_PASSWORD_BIBLIOTECA", "baseUrl": "https://TU_CDN_O_BUCKET/audio" }`

Con esto, `/api/playlist` empezara a leer desde base de datos (con fallback a carpetas si no hay datos).

Cuando ya verifiques que todo carga desde URLs externas, puedes quitar la carpeta `frontend/audio` del repo sin romper el reproductor.

## 2.1) Opcion recomendada: Cloudflare R2 (gratis)

Si quieres usar R2 como almacenamiento externo de audio (recomendado para este proyecto), sigue este flujo:

1. En Cloudflare, crea un bucket R2 (ejemplo: `riddleyai-audio`).
2. Activa acceso publico del bucket con un dominio publico (r2.dev o dominio propio).
3. Dentro del bucket crea el prefijo/carpeta `audio/` y sube ahi todo el contenido de `frontend/audio` respetando estructura.
4. En Railway define:
- `AUDIO_PUBLIC_BASE_URL` = `https://TU_DOMINIO_PUBLICO_R2/audio`

Ejemplo de ruta final de fichero:
- `https://TU_DOMINIO_PUBLICO_R2/audio/Coldplay/cancion.mp3`

5. Sincroniza metadatos desde tus carpetas actuales a PostgreSQL:
- `POST https://TU_BACKEND_RAILWAY/api/playlist/sync`
- Body JSON: `{ "password": "TU_PASSWORD_BIBLIOTECA" }`

6. Reescribe rutas guardadas para que apunten a R2:
- `POST https://TU_BACKEND_RAILWAY/api/playlist/rebase-urls`
- Body JSON: `{ "password": "TU_PASSWORD_BIBLIOTECA", "baseUrl": "https://TU_DOMINIO_PUBLICO_R2/audio" }`

7. Comprueba que `/api/playlist` devuelve `src` con URL completa `https://...`.
8. Cuando todo suene bien en web, elimina audio del repo (sin borrar local):

```bash
git rm -r --cached frontend/audio
git add .gitignore
git commit -m "chore: move audio to Cloudflare R2"
git push
```

Notas:
- `git rm --cached` quita archivos del control de versiones, pero no los borra de tu disco local.
- Si usas dominio propio o r2.dev, solo cambia la variable `AUDIO_PUBLIC_BASE_URL`; no hace falta tocar frontend.

## 3) Desplegar frontend en Vercel (riddleyai)

1. En Vercel: `Add New...` -> `Project` -> importa el mismo repo.
2. Configura:
- Framework Preset: `Other`
- Root Directory: `frontend`
- Build Command: vacio
- Output Directory: vacio

3. En `Settings -> Domains`, asigna nombre/proyecto `riddleyai` (si esta libre, quedara como `riddleyai.vercel.app`).

## 4) Conectar frontend y backend

La forma mas simple y robusta es configurar un **rewrite** en Vercel para que el frontend siga llamando a `/api/...`.

En Vercel, ve a `Project Settings -> Rewrites` y agrega:

- Source: `/api/(.*)`
- Destination: `https://TU_BACKEND_RAILWAY/api/$1`

Con esto no tienes que tocar el codigo del frontend para fetches.

## 5) Ajuste necesario para Twitch embed

El iframe ya esta preparado para usar automaticamente el dominio actual como `parent`, por lo que funciona en local y en Vercel sin hardcodear localhost.

## 6) Despliegue automatico en cada push

Ya queda automatico por integracion Git en ambos:

1. `git add .`
2. `git commit -m "feat: cambios"`
3. `git push`

Vercel y Railway detectan el push y redeployan.

## 7) Checklist final

- Backend responde: `GET /api/health`
- Frontend carga en HTTPS (`https://riddleyai.vercel.app`)
- Rewrites activos en Vercel
- Operaciones de lectura/escritura funcionando

## Notas importantes

- Railway puede usar filesystem efimero en algunos planes/entornos. Si en el futuro quieres persistencia total de imagenes/datos, conviene migrar `backend/data` y uploads a una base de datos + storage (S3/Cloudinary).
- Mientras tanto, para este despliegue inicial, el setup actual funciona para arrancar rapido.

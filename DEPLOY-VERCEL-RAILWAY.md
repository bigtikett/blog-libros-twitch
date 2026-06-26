# Deploy frontend (Vercel) + backend (Railway)

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

5. Espera a que termine el build y copia la URL publica, por ejemplo:
- `https://riddleyai-backend.up.railway.app`

6. Comprueba health:
- `https://TU_BACKEND_RAILWAY/api/health`

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

# CeX Price Tracker

Aplicación web (PWA) para buscar móviles en **CeX España** ([es.webuy.com](https://es.webuy.com/)), vigilar un listado concreto (`boxId`) y consultar historial de precio y disponibilidad en tienda. Backend en **Cloudflare Workers + D1** con actualización programada por cron.

## Stack

- React 19 + Vite 8
- Cloudflare Workers, Assets y D1
- API pública de catálogo CeX: `https://wss2.cex.es.webuy.io/v3`

## Desarrollo local

```bash
npm install
npm run dev:full
```

Abre `http://localhost:8788`. El comando ejecuta build de Vite, aplica `schema.sql` en D1 local y arranca Wrangler.

Solo UI con proxy al Worker:

```bash
npm run dev:full   # terminal 1 — Worker en :8788
npm run dev        # terminal 2 — Vite en :5173 (proxy /api)
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Vite en modo desarrollo |
| `npm run build` | Genera `dist/` |
| `npm run dev:full` | Build + D1 local + Worker |
| `npm run cf:db:local` | Aplica `schema.sql` en D1 local |
| `npm run check` | ESLint + build |
| `npm run deploy` | Build + `wrangler deploy` |

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado |
| GET | `/api/cex/search?q=` | Búsqueda CeX |
| GET | `/api/cex/new-arrivals?days=` | Novedades por `firstStockInDate` (1, 3 o 5 días) con stock en Málaga |
| GET | `/api/cex/product?boxId=` | Detalle de un listado |
| GET | `/api/watches` | Lista de seguimientos |
| POST | `/api/watches` | Añadir seguimiento (`cexBoxId`, …) |
| DELETE | `/api/watches/:id` | Quitar seguimiento |
| GET | `/api/watches/:id/history` | Historial precio y tiendas |
| POST | `/api/watches/:id/refresh` | Refresco manual |
| PATCH | `/api/watches/:id/favorite` | Marcar o desmarcar favorito |
| POST | `/api/scope/share` | Generar código de sincronización (30 días) |
| DELETE | `/api/scope/share` | Revocar código activo |
| POST | `/api/scope/link` | Vincular este navegador a otra lista (`{ "code": "XXXX-XXXX" }`) |
| GET | `/api/planner` | Datos de cumpleaños (fecha y deseos) del scope actual |
| PUT | `/api/planner` | Guardar cumpleaños (`{ "birthDate": "YYYY-MM-DD", "gifts": [...] }`) |

La cookie `cex_tracker_scope` identifica tu lista en este navegador.

### Sincronizar entre dispositivos

1. En el dispositivo con la lista: icono de dispositivos (cabecera) → **Generar código**.
2. En el otro: **Vincular lista** con el mismo código, o abre el enlace copiado (`?sync=XXXX-XXXX`).
3. Ambos comparten seguimientos CeX, historial, deseos de cumpleaños y fecha de nacimiento. Quien tenga el código puede ver y modificar esos datos.

Si ya tenías datos de cumpleaños solo en este navegador, se suben al servidor la primera vez que cargas la app tras actualizar.

## Despliegue en Cloudflare

### 1. Base de datos D1 (una vez)

```bash
npx wrangler d1 create phone-price-tracker-db
```

Copia el `database_id` en `wrangler.jsonc` y aplica el esquema:

```bash
npx wrangler d1 execute phone-price-tracker-db --remote --file=schema.sql
```

### 2. Desde Git (recomendado)

1. Sube el repo a GitHub (`fcosegura/phone-price-tracker`).
2. En Cloudflare: **Workers & Pages → Create → Connect to Git**.
3. Build: `npm ci && npm run build`
4. Deploy: `npx wrangler deploy`
5. Rama de producción: `main`

Secrets en GitHub (si usas `.github/workflows/deploy.yml`):

- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`

### 3. Manual

```bash
npm run deploy
```

El cron (`0 */6 * * *`) está en `wrangler.jsonc` y se activa al desplegar.

## Usar en el móvil

1. Abre la URL de producción (`https://phone-price-tracker.<tu-cuenta>.workers.dev`).
2. **iOS (Safari):** Compartir → *Añadir a la pantalla de inicio*.
3. **Android (Chrome):** Menú → *Instalar aplicación* o *Añadir a pantalla de inicio*.
4. Desliza hacia abajo en la lista para actualizar (pull-to-refresh).

Opcional: asigna un dominio propio en Cloudflare Workers → Settings → Domains.

## Modelo de seguimiento

- Cada vigilancia = **un `boxId` CeX** (variante exacta: almacenamiento, grado, etc.).
- El mismo modelo con otra configuración = otro watch.
- El precio de catálogo es por SKU; las tiendas indican **stock**, no precios distintos salvo que la API lo devuelva.

## Licencia

ISC

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Two deployable apps and two ancillary folders, all in one repo:

- `Frontend-PC/` — React 19 + Vite + TypeScript + Tailwind. Vite dev server on `:5173`.
- `backend-pc/` — NestJS 11 + TypeScript. HTTP API on `:3000`, SQLite on disk.
- `DETECTOR/` — standalone OpenCV/Python experiments (`app.py`). **Not wired to either app**; treat as a scratchpad.
- `ASSETS/` — source PNGs and the canonical `standar1.obj` (the 3D utility model). The frontend ships its own copy at `Frontend-PC/public/assets/standar1.obj` — those two files must stay in sync.

The product (per `README.md`) is **WallPreview**: upload a wall photo, drag utility images/3D models on top, save the scene JSON, export a PNG.

## Common commands

Backend (`cd backend-pc`):
```bash
npm run start:dev          # nest start --watch, serves on :3000
npm run build              # nest build (output in dist/)
npm run start:prod         # node dist/main
npm run lint               # eslint --fix
npm test                   # jest (unit, *.spec.ts under src/)
npm run test:watch
npm run test:cov
npm run test:e2e           # uses test/jest-e2e.json
npx jest path/to/file.spec.ts -t "name"   # single test
```

Frontend (`cd Frontend-PC`):
```bash
npm run dev                # vite, on :5173
npm run build              # tsc -b && vite build
npm run lint               # eslint .
npm run preview
```

The frontend talks to the backend via `VITE_API_BASE` (default `http://localhost:3000`). The backend reads `FRONTEND_ORIGIN` for CORS (default `http://localhost:5173`) and `JWT_SECRET` for token signing.

## Backend architecture

Single Nest module (`src/app.module.ts`) wiring five controllers and three providers — no per-feature module boundaries.

- `DatabaseService` (`src/database/database.service.ts`) is the data layer. It uses Node's built-in `node:sqlite` (loaded via `require` because TS lib types don't expose it yet). On `onModuleInit` it ensures `backend-pc/data/`, opens `wallpreview.sqlite`, runs `migrate()` (CREATE TABLE IF NOT EXISTS for `users`, `assets`, `projects`), and `seed()` (inserts the admin row if missing). **Schema changes go in `migrate()` — there's no migration tool**, so destructive changes need to handle existing DBs manually. Hardcoded seed admin: `admin@wallpreview.local` / `Admin123!`.
- `AuthService` issues hand-rolled HS256 JWTs (header.payload.signature, base64url, 24h exp) — no `jsonwebtoken` dep. Passwords are pbkdf2-sha256 with 120k iterations, stored as `salt:hex`. `AuthGuard` reads `Authorization: Bearer <token>`, validates, loads the user row, and attaches it to `request.user` (typed via `AuthenticatedRequest`). Apply with `@UseGuards(AuthGuard)` per controller or per route.
- `StorageService` writes uploads to `backend-pc/data/uploads/{walls,utilities}/<uuid><ext>`. HEIC/HEIF inputs are converted to JPEG via `heic-convert`. Files are served back through `GET /files/:category/:fileName` (in `AssetsController`) — that endpoint guards against `..` and unknown categories.
- `AssetsController` distinguishes two asset kinds: `WALL` (user-owned, `owner_id` set) and `UTILITY` (shared library, `owner_id = NULL`). The list endpoint returns `WHERE kind='UTILITY' OR owner_id=$me`. New utilities are uploaded by any authenticated user and become globally visible — there's no admin gating on that.
- `ProjectsController` stores the scene as `scene_json` TEXT (stringified `{ layers: [...] }`). All project queries are scoped to `owner_id`, so cross-user reads are not possible. There is no public-share endpoint yet (Phase 2 in README).
- `AccountsController` is admin-only (checked via `request.user.role !== 'ADMIN'`) and proxies user CRUD through `AuthService.register` for create.

## Frontend architecture

`main.tsx` wraps the app in `BrowserRouter` → `WorkspaceProvider`. Routes (`App.tsx`) all render under a single `AppShell` layout; protected routes (`dashboard`, `profile`, `projects/:id`) sit behind `ProtectedRoute`, which gates on the presence of `token`.

`WorkspaceContext` (`src/context/WorkspaceContext.tsx`) is the **single source of truth** for session and workspace data: token (persisted in `localStorage` as `wallpreview_token`), current user, assets, projects, and a transient `message` toast. It also owns the `request<T>(path, options)` helper that injects the bearer header and JSON content-type. **Components should call `useWorkspace()` rather than `fetch` directly** so the auth header and refresh logic stay consistent.

Asset URL handling has a subtle rule in `src/lib/api.ts`:
- Paths starting with `/assets/` are Vite public-dir paths (the bundled `standar1.obj`) and are returned unchanged.
- Everything else is prefixed with `API_BASE` (so `/files/walls/<uuid>.png` becomes an absolute backend URL).
- Use `fullUrl(asset.public_url)` whenever rendering an asset; never concatenate manually.

The built-in `standar1.obj` 3D utility is injected client-side by `withBuiltinUtilities` (`src/lib/builtinAssets.ts`) with sentinel `id: -1` and `public_url: '/assets/standar1.obj'`. The library checks if the user already uploaded a utility named `standar1.obj` and skips the injection if so.

3D rendering (`src/lib/model3d.ts`) is a **hand-written WebGL OBJ renderer** — no three.js. It parses `.obj` files (vertices + faces, computes face normals, normalizes to a unit cube), compiles a tiny shader pair, and draws orthographic with rotation/zoom from `ModelSettings`. `isObjAsset(name, url)` is a string-match heuristic looking for `.obj`, `standard1`, or `standar1`. The cache is module-scoped (`modelCache: Map<src, Promise<ObjGeometry>>`).

Scene model (`src/types/wallpreview.ts`):
```
Scene { layers: Layer[] }
Layer { id, assetId, src, name, mediaType?, x, y, width, height, model?, quad? }
```
- `model?: ModelSettings` (rotationX/Y/Z, zoom) is set for 3D layers.
- `quad?: { tl, tr, br, bl: Point }` holds the 4 corner positions for perspective placement on the wall.
- `parseScene` (`src/lib/scene.ts`) is defensive: bad JSON returns `{ layers: [] }`.

`DesignerPage` is the largest component — drag/resize/rotate logic, perspective quad editing, modifier-key bindings (persisted in `localStorage` as `wallpreview_canvas_bind`), and a per-layer undo stack. It calls `saveProject(projectId, scene)` from the workspace context.

## Conventions worth knowing

- **Database column casing**: SQLite columns are `snake_case` (e.g. `wall_asset_id`, `scene_json`, `public_url`), and rows are returned to the frontend as-is. The frontend `Asset`/`Project` types reflect this — don't camelCase them on the way out.
- **No DTO/validation layer**: controllers accept `@Body() body: { ... }` typed inline. Trim/normalize inputs in the handler (see how email is `.trim().toLowerCase()`).
- **No three.js, no jsonwebtoken**: the project deliberately avoids these. If you reach for them, check whether a hand-rolled equivalent already exists.
- **`node:sqlite` requires Node 22+**. The import uses `require('node:sqlite')` to bypass missing TS types — keep that pattern if you touch `database.service.ts`.
- Phases 2 and 3 in `README.md` describe planned work (resize handles already partly exist, share links, S3 storage, refresh tokens, etc.) — they are **not implemented yet**, so don't assume they exist when wiring features.

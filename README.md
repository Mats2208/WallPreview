# WallPreview

WallPreview is a fast demo for industrial wall previews. A Salesforce worker uploads a photo of the wall that will be restored, opens it in a designer, places reusable utility images over the wall, saves the unfinished project, and exports the final preview as one PNG.

## Phase Plan

1. **Phase 1: demo foundation**
   - React + Tailwind landing page, auth screens, dashboard and Packet-Tracer-style designer.
   - NestJS API with SQLite persistence.
   - Hardcoded seed admin: `admin@wallpreview.local` / `Admin123!`.
   - Register, login, current-account update and admin account CRUD.
   - Local blob-style storage under `backend-pc/data/uploads`.
   - User-owned wall images, shared utility images and JSON project saves.

2. **Phase 2: stronger project workflow**
   - Better object controls: resize handles, rotate, z-index, duplicate and delete.
   - Project share links with read-only public access.
   - Asset metadata: tags, categories, dimensions and manufacturer notes.
   - Safer validation and better API errors.

3. **Phase 3: production hardening**
   - Replace local files with S3-compatible storage.
   - Add migrations, tests, refresh tokens, password reset and role management.
   - Add image optimization and background removal for uploaded utilities.
   - Add audit logs for sales/design handoff.

## Current Stack

- Frontend: `Frontend-PC`, React, TypeScript, Vite, Tailwind.
- Backend: `backend-pc`, NestJS, TypeScript, SQLite via Node `node:sqlite`.
- Storage: local filesystem files plus SQLite metadata.

## Run Locally

Backend:

```bash
cd backend-pc
npm run start:dev
```

Frontend:

```bash
cd Frontend-PC
npm run dev
```

The frontend expects the API at `http://localhost:3000`. Override with `VITE_API_BASE` if needed.

## API Surface In Phase 1

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `PATCH /auth/me`
- `GET /accounts` admin
- `POST /accounts` admin
- `PATCH /accounts/:id` admin
- `DELETE /accounts/:id` admin
- `GET /assets`
- `POST /assets/walls`
- `POST /assets/utilities`
- `GET /files/:category/:fileName`
- `GET /projects`
- `POST /projects`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

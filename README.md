# RestauranGo – Restaurant Ordering & Reservation Hub

A full-stack restaurant app. Guests browse the menu, order for pickup or delivery,
track orders and reserve tables. Staff use an admin dashboard to manage orders and see reservations.

| Part | Folder | Tech | Port |
|---|---|---|---|
| Frontend | `artifacts/restaurango` | React 19, Vite, Tailwind, TanStack Query | 5173 |
| Backend | `artifacts/api-server` | Express 5, Drizzle ORM, pino | 8080 |
| Database | `lib/db` | PostgreSQL (Neon or local) | – |
| API contract | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | OpenAPI, Zod, generated React hooks | – |
| Seed script | `scripts` | tsx | – |

## 1. Requirements

- **Node.js 20 or newer** (22 or 24 LTS recommended)
- **pnpm 10 or newer**: `npm install -g pnpm` (npm and yarn are blocked by the project)
- **A PostgreSQL database**: either [Neon](https://neon.tech) (free, hosted) or a local PostgreSQL

## 2. Install

From the project root (the folder containing `pnpm-workspace.yaml`):

```
pnpm install
```

## 3. Environment variables

The project does not read a `.env` file, so set variables in the terminal you use.

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | db push, seed, backend | PostgreSQL connection string |
| `ADMIN_EMAIL` | seed | Email of the admin account that gets created |
| `ADMIN_PASSWORD` | seed | Password of the admin account |
| `PORT` | backend, frontend | `8080` for backend, `5173` for frontend |
| `BASE_PATH` | frontend | Set to `/` |
| `API_URL` | frontend (optional) | Backend address, default `http://localhost:8080` |

Example `DATABASE_URL` for Neon (do not use `channel_binding=require`):

```
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

Example for local PostgreSQL:

```
postgresql://postgres:postgres@localhost:5432/restaurango
```

> Never commit your database password to Git or share it publicly.

## 4. First-time database setup (once)

**Windows PowerShell**

```powershell
$env:DATABASE_URL = "YOUR_CONNECTION_STRING"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "Admin@12345"

pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed:restaurango
```

**macOS / Linux**

```bash
export DATABASE_URL="YOUR_CONNECTION_STRING"
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="Admin@12345"

pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed:restaurango
```

`push` creates the tables. If it asks "Do you want to truncate ... table?", choose **No, add the constraint without truncating the table**. `seed` adds the menu, categories, 8 tables and the admin user,
and should print `RestauranGo seed completed.`

## 5. Run the backend (Terminal 1)

**Windows PowerShell**

```powershell
$env:DATABASE_URL = "YOUR_CONNECTION_STRING"
$env:PORT = "8080"
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

**macOS / Linux**

```bash
export DATABASE_URL="YOUR_CONNECTION_STRING"
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Check it: open <http://localhost:8080/api/healthz>.

## 6. Run the frontend (Terminal 2)

**Windows PowerShell**

```powershell
$env:PORT = "5173"
$env:BASE_PATH = "/"
pnpm --filter @workspace/restaurango run dev
```

**macOS / Linux**

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/restaurango run dev
```

Open <http://localhost:5173>. The Vite dev server forwards every `/api` request to the backend.

## 7. Using the app

- **Customer**: open `/register`, create an account, then browse `/menu`, order at `/checkout`, track at `/track/:id` and book at `/reserve`.
- **Admin**: log in at `/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then open `/admin`.

## 8. Useful commands

| Command | What it does |
|---|---|
| `pnpm run typecheck` | Type-check all packages |
| `pnpm run build` | Type-check and build everything |
| `pnpm --filter @workspace/db run push` | Apply schema changes to the database |
| `pnpm --filter @workspace/scripts run seed:restaurango` | Seed menu, tables and admin |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks and Zod schemas from `openapi.yaml` |

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| `Use pnpm instead` | Use `pnpm install`, not `npm install` |
| `DATABASE_URL must be set` | Set the variable in the same terminal window |
| `PORT` or `BASE_PATH` environment variable is required | Set both before starting the frontend |
| `Port 5173 is already in use` | The frontend is already running in another terminal, or free the port: `Get-NetTCPConnection -LocalPort 5173 -State Listen \| % { Stop-Process -Id $_.OwningProcess -Force }` |
| Menu empty or network errors | Backend not running, or the DB was not pushed and seeded (Section 4) |
| `Host version ... does not match binary version` (esbuild) | Delete `node_modules` and `pnpm-lock.yaml`, then run `pnpm install --no-frozen-lockfile` |
| `Cannot find module ...win32-x64-msvc.node` | The platform-binary overrides were removed from `pnpm-workspace.yaml`; reinstall as above |
| `No schema files found` on `db push` | Make sure `lib/db/drizzle.config.ts` uses `schema: "./src/schema/index.ts"` |
| Admin login fails | Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then run the seed again |
| `Origin is not allowed` | Leave `FRONTEND_ORIGIN` unset locally, or set it to `http://localhost:5173` |

## 10. Project layout

```
.
├── artifacts
│   ├── api-server        Express API (routes, auth, sessions)
│   └── restaurango       React frontend
├── lib
│   ├── db                Drizzle schema and database client
│   ├── api-spec          openapi.yaml and Orval config
│   ├── api-zod           Generated Zod schemas
│   └── api-client-react  Generated React Query hooks
├── scripts               Database seed script
├── pnpm-workspace.yaml   Workspace and dependency catalog
└── package.json
```

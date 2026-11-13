# Deploying the DHS backend on Vercel + Supabase (free tiers)

## 1. Supabase (database)
1. Supabase dashboard -> your project -> **Connect**. Copy two strings:
   - **Transaction pooler** (port 6543) -> `DATABASE_URL`, and append `?pgbouncer=true&connection_limit=1`
   - **Session pooler** (port 5432) -> `DIRECT_URL`
   Use the pooler hosts for both: the plain `db.<ref>.supabase.co` host is IPv6-only on the free plan and often fails from home/office networks.
2. Copy `.env.example` to `.env` and fill it in (never commit `.env`).

## 2. Create the tables and first admin (run once, from your computer)
```bash
cd hms-backend
npm install
npx prisma db push            # creates tables; NO --accept-data-loss
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="a-strong-password" npm run seed
```
The seed also creates the `mrn_seq` sequence, starter inventory, wards and the price catalogue. It is safe to re-run. If `db push` warns it would delete data, stop and read the warning instead of forcing it.
If you forget `ADMIN_PASSWORD`, a random one is generated and printed once.

## 3. Vercel (API)
1. vercel.com -> **Add New Project** -> import the Git repo.
2. **Root Directory:** `hms-backend`. Leave framework as "Other"; no build command or output directory needed.
3. **Environment Variables:** `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` (optional).
4. Deploy, then open `https://<your-project>.vercel.app/health` -> `{"ok":true}`.

## 4. Point the frontend at the new API
In the frontend's Vercel project: set `VITE_API_URL=https://<your-project>.vercel.app` (no trailing slash), then redeploy. (Optional: add the API under your own domain, e.g. `api.digitalhealthcaresolutions.co.ke`, in Vercel -> Domains.)

## Notes
- **CORS:** `https://www.digitalhealthcaresolutions.co.ke` and the bare domain are allowed in `src/app.ts`. Add others with `CORS_ORIGIN`.
- **Render / any always-on host:** `npm run build` then `npm start` still works (`src/index.ts` listens on `PORT`). Do not put `prisma db push` in the start command.
- **Removed:** the `/reseed-once` route (it ran shell commands from an HTTP request).
- **Changed:** `bcrypt` -> `bcryptjs` (pure JS, works on Vercel; existing password hashes remain valid).
- **Free-tier limits:** Supabase pauses free projects after ~1 week of inactivity; Vercel functions have execution time limits. Fine for testing; for real patient data move to paid plans or a VPS and set up database backups.
- `radiology-module/` is an old partial copy of files already merged into the main folders; it is not used by the app.

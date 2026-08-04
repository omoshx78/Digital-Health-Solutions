# DHS — Hospital Management System (Backend)

Node.js + Express + TypeScript + Prisma + PostgreSQL.

## What's implemented in this phase

- **Auth** — login (JWT), admin-creates-staff accounts, role-based access control.
- **Patients** — persistent patient master record (one record per person, many
  encounters/visits), search, full visit history.
- **The queue system** — this is the core mechanism the whole app is built
  around. See "How the queue system works" below.
- **Clinical flow** — triage → consultation → laboratory → pharmacy → cashier,
  fully wired to the queue: each action requires the caller to hold a claimed
  queue entry, and completes it while automatically opening the next
  department's queue entry.
- **Pharmacy stock** — dispensing decrements inventory inside a transaction
  and writes an `InventoryTransaction` audit row; refuses to dispense if
  stock is insufficient. `inventory.routes.ts` also covers adding new items,
  restocking, and viewing an item's movement history.
- **Theatre/equipment** — bookings carry itemized `BookingCharge` line items
  (surgeon's fee, anaesthesia, facility fee, consumables, etc., defaulted
  from the equipment's fee template and editable per case). Surgeons/
  anaesthetists use the **same queue mechanism** as every other department:
  a booking with a linked patient enters the shared `THEATRE` queue, staff
  claim it when ready to start (`POST /theatre/bookings/:id/claim`), and
  completing it (`POST /theatre/bookings/:id/complete`) posts every itemized
  charge to the patient's bill in one transaction.
- **Wards & admissions** — bed occupancy, admitting a patient (encounter
  status becomes `ADMITTED`, bed becomes `OCCUPIED`), nursing notes during
  the stay, and discharge — which frees the bed and routes the patient into
  the **Cashier queue** for final billing, exactly like the outpatient flow.
- **Reports** — `/reports/collections` (cash vs. insurance-paid, broken down
  by department), `/reports/claims` (all insurance claims with outstanding
  value), `/reports/expenses` (CRUD, categorized), and `/reports/summary`
  (the headline dashboard numbers: total collected, pending claims,
  expenses, net) — all filterable by `today` / `month` / `all`.
- **Billing** — consultation fee, lab charges, and pharmacy charges post
  automatically to `BillingItem` as each stage completes. Prices are looked
  up server-side from `src/utils/catalog.ts` — the client never sets a price.
- **Insurance claims** — cash payments settle immediately; insurance payments
  create a claim in `SUBMITTED` status that a cashier/admin later moves to
  `APPROVED` / `PAID` / `REJECTED` via `PATCH /encounters/:id/claim-status`.
- **Audit log** — every state-changing action writes an `AuditLog` row with
  who did what, to what, and when.

## Not yet built (next phase)

- Frontend rewrite: point the React demo at this API instead of
  `window.storage`, add real login, and build the "pick a patient from the
  queue" UI for each department (triage, consultation, lab, pharmacy,
  cashier, theatre).
- Printing (receipts, prescriptions, lab slips, discharge summaries).
- Drug expiry/batch alerts (the schema already has `expiryDate`/`batchNo`
  on `InventoryItem`; a scheduled job to flag near-expiry stock is still
  needed).

## How the queue system works

Every time a patient reaches a department, one `QueueEntry` row is created
with `status = WAITING`. This is the **shared queue**: every doctor sees the
same waiting list for Consultation, every pharmacist sees the same list for
Pharmacy, and so on.

1. `GET /queue/CONSULTATION` — any doctor sees `waiting` (unclaimed patients,
   sorted by triage priority then arrival time) and `mine` (patients they've
   already picked up).
2. `POST /queue/:id/claim` — a doctor picks a patient. This is an atomic,
   guarded update (`WHERE status = 'WAITING'`), so if two doctors click the
   same patient in the same instant, only one succeeds; the other gets a
   `409` and should just refresh their queue.
3. `POST /queue/:id/release` — hands the patient back to the shared pool
   (e.g. the doctor gets pulled into an emergency).
4. The actual clinical action (`POST /encounters/:id/consultation`, etc.)
   checks that the caller holds the `CLAIMED` entry, then marks it
   `COMPLETED` and opens the next department's queue entry in the same
   database transaction — so a patient is never lost between stages and
   never sits in two department queues at once.

This same pattern extends to Pharmacy, Laboratory, Cashier, and Theatre
(`POST /theatre/bookings/:id/claim` / `.../complete`) — each is just a
`Department` value on `QueueEntry`.

## Local setup

```bash
cp .env.example .env          # fill in DATABASE_URL and JWT_SECRET
docker compose up -d          # starts local Postgres
npm install
npx prisma migrate dev --name init
npm run seed                  # creates admin@clinicore.local / ChangeMe123!
npm run dev                   # starts API on http://localhost:4000
```

Log in with `admin@clinicore.local` / `ChangeMe123!`, then immediately use
`POST /auth/users` to create real staff accounts and change/remove the seed
admin password.

## Deploying to Render (recommended)

1. Push this repo to GitHub.
2. In Render: **New → PostgreSQL** — create a managed database, copy its
   internal connection string.
3. In Render: **New → Web Service** — connect the repo.
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npx prisma migrate deploy && npm start`
   - Environment variables: `DATABASE_URL` (from step 2), `JWT_SECRET`
     (generate with `openssl rand -base64 48`), `CORS_ORIGIN` (your frontend
     URL once deployed).
4. After the first deploy, run the seed script once via Render's shell
   (`npm run seed`) to create the admin account and starter data.
5. Deploy the frontend separately (Render Static Site, or Vercel) pointing
   at this API's URL.

## Security notes before going live

- Rotate the seed admin password immediately.
- `JWT_SECRET` must be a long random value kept out of source control.
- Enable Render's automatic daily Postgres backups (on by default on paid
  tiers — verify before go-live).
- Put the API behind HTTPS only (Render does this automatically).
- Review who gets the `ADMIN` role — it bypasses all role checks by design.

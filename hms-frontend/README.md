# DHS — Hospital Management System (Frontend)

React + TypeScript + Vite + Tailwind, talking to the DHS backend API.

## What's here

- Real login (JWT), role-aware navigation — staff only see the departments
  their role can act on (a nurse doesn't see Cashier, a cashier doesn't see
  Consultation, etc.). Admin sees everything.
- A generic `QueueBoard` component (`src/components/QueueBoard.tsx`) that
  every department page (Triage, Consultation, Laboratory, Pharmacy,
  Cashier) is built on: it shows the shared waiting list, lets staff claim
  a patient, shows "my patients," and polls every 5 seconds so multiple
  staff stay roughly in sync without needing a websocket.
- Theatre & equipment: itemized booking form + the same claim/complete
  pattern for surgeons/anaesthetists.
- Wards: bed occupancy, admission, nursing notes, discharge-to-billing.
- Inventory, Reports (collections/claims/expenses), and full patient
  search + visit history.

## Local setup

```bash
cp .env.example .env      # set VITE_API_URL to your backend's URL
npm install
npm run dev                # http://localhost:5173
```

Make sure the backend is running first (see `hms-backend/README.md`) and
that its `CORS_ORIGIN` includes this app's URL.

Log in with the seed admin (`admin@clinicore.local` / `ChangeMe123!`), then
create real staff accounts via `POST /auth/users` (there's no user-management
screen yet — see Roadmap below) and rotate the seed password.

## Deploying

**Render (Static Site)** or **Vercel** both work well:

1. Build command: `npm run build`
2. Output directory: `dist`
3. Environment variable: `VITE_API_URL` = your deployed backend's URL
4. Add a rewrite rule so client-side routing works on refresh:
   - Render: add a "Rewrite" rule `/* → /index.html`
   - Vercel: add a `vercel.json` with a catch-all rewrite to `/index.html`

## Known gaps / good next steps

- **No user-management screen** — admins currently create staff accounts via
  a raw API call (`POST /auth/users`). A simple "Staff" admin page would fix
  this quickly.
- **No printing** — receipts, prescriptions, and lab slips aren't
  print-formatted yet.
- **Polling, not real-time push** — the queue refreshes every 5 seconds.
  Fine for most clinics; if instant updates matter, swap the polling in
  `QueueBoard.tsx` for a WebSocket or Server-Sent Events connection.
- **No offline support** — matches what you told me (connectivity is
  reliable), but if that changes later, this app would need a service
  worker + local queue of pending actions to handle drops gracefully.

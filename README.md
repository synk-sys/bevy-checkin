# Check-in Desk

Event check-in for **Bevy**-managed events, such as GDG and DevFest chapters. It handles attendee check-in at the door.

- **QR scanning:** use a laptop or phone camera, or any USB/Bluetooth barcode scanner (they type the code and press Enter).
- **Search:** find attendees by name, email or ticket code. Search ignores accents and matches prefixes.
- **Safe check-in:** checking in is transaction-safe. If two desks scan the same ticket at once, only one records it and the other sees "already checked in".
- **Badge printing:** prints a 4″ × 3″ name badge, either on demand or automatically after each check-in.
- **Walk-ins:** register people who aren't in Bevy and check them in on the spot.
- **Live dashboard:** shows arrival rate, arrivals per 10 minutes, a breakdown by ticket type and by desk, and recent activity.
- **Attendee list:** an admin-only view with CSV export and undo.
- **Data sources:**
  - the Bevy API, with a configurable endpoint and pagination
  - Bevy webhooks
  - built-in **demo data** for training volunteers

## Quick start (no Supabase or Bevy needed)

```bash
npm install
npm run dev     # http://localhost:3000
```

Until you set up accounts (see [Sign-in](#sign-in)), sign in with any name, a desk name and password **`admin`**. Then:

1. **Admin → Load demo attendees** creates 240 dummy attendees.
2. **Admin → Printable test tickets** shows QR codes you can hold up to the camera.
3. **Desk** is where you scan, search, check in and print badges. **Dashboard** shows the live stats.

Volunteers use password **`checkin`**. They can check people in, search, print badges and register walk-ins, but can't sync, export, undo or reset.

## Sign-in

Each person signs in with their name and their own password. List them in `.env.local` (locally) or in your host's environment variables (deployed):

```
ADMIN_USERS=Kritima:long-pass-1
STAFF_USERS=Priya:pass-2,Sam:pass-3
SESSION_SECRET=any-long-random-string
```

- Entries are `Name:password`, separated by commas, so passwords can't contain commas.
- Names match regardless of capitals or extra spaces. Check-ins are recorded under the name as you wrote it.
- Once any account is listed, the `admin` / `checkin` fallback stops working. That fallback never works on a deployed server.
- To add, remove or change someone, edit the list and restart the server (or redeploy). A session lasts 14 hours. Removing someone from the list doesn't end a session they've already started; change `SESSION_SECRET` to sign everyone out.

## Bevy integration

Bevy doesn't publish a public API reference; access is arranged per organization. The integration is therefore configurable rather than hard-coded:

| Variable | Default | Purpose |
|---|---|---|
| `BEVY_API_BASE_URL` | — | API host Bevy gives you |
| `BEVY_API_TOKEN` | — | API token (store it as a secret) |
| `BEVY_EVENT_ID` | — | Event to import |
| `BEVY_ATTENDEES_PATH` | `/api/v1/events/{eventId}/attendees` | Attendee list endpoint |
| `BEVY_AUTH_HEADER` / `BEVY_AUTH_SCHEME` | `Authorization` / `Token` | Sent as `Authorization: Token <token>` |

- **Pagination:** the importer follows `next`, `links.next`, `meta.next` and similar links. It refuses to send the token to any host other than the configured one.
- **Field mapping:** records are mapped by a tolerant normalizer in `src/lib/server/bevy.ts`. It understands `first_name`/`firstName`, nested `user.*` and `ticket.*` fields, and `ticket_code`/`barcode`/`order_id`, among others. If your payload uses different names, add them to the `pick(...)` lists there.
- **Sync never undoes desk work:** re-syncing updates names and ticket types but never changes a check-in made at the desk.
- **Webhooks:** set `BEVY_WEBHOOK_SECRET`, then point Bevy's attendee webhooks at `/api/bevy/webhook`. Send the secret in the `x-webhook-secret` header or as `?secret=`.
- **QR codes:** whatever a ticket QR contains (a bare code, a registration ID, or a URL with the code inside) is matched against ticket codes and attendee IDs.

## Deploying (Supabase + Vercel)

Attendee data is stored in **Supabase** Postgres. Supabase doesn't host Next.js apps, so the app itself runs on **Vercel** (any Node.js host works).

1. **Supabase:** create a project. Under **Connect**, copy the **Transaction pooler** connection string (port 6543) and put your database password in it. That's your `DATABASE_URL`. No SQL to run: the app creates its `checkin_docs` table the first time it starts.
2. **Vercel:** at [vercel.com/new](https://vercel.com/new), import this GitHub repo. Before deploying, add these environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase connection string |
   | `ADMIN_USERS` | e.g. `Kritima:long-pass-1` |
   | `STAFF_USERS` | e.g. `Priya:pass-2,Sam:pass-3` |
   | `SESSION_SECRET` | any long random string (`openssl rand -base64 32`) |
   | `NEXT_PUBLIC_EVENT_NAME` | your event's name |
   | `BEVY_API_BASE_URL`, `BEVY_API_TOKEN`, `BEVY_EVENT_ID` | from Bevy (see above) |

   Under **Settings → Functions**, set the region closest to your Supabase project's region.
3. Deploy, sign in as an admin and run **Admin → Sync from Bevy**.

To change who can sign in later, edit the variables in Vercel and redeploy.

The table has row level security turned on with no policies, so Supabase's public API (the anon key) can't read it. The app connects to the database directly, and attendee data is only ever read through authenticated server routes.

## Tests

```bash
npm test                          # 22 unit/API tests
npm run build && npm run test:e2e # 10 Playwright tests, incl. a real camera QR scan
```

Both run on the in-memory store. To run them against a real Postgres, start a **throwaway** one (the tests delete its `checkin_docs` table):

```bash
docker run -d --rm --name checkin-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres npx vitest run tests/unit/checkin.test.ts
DATABASE_URL=postgres://postgres:test@localhost:54329/postgres CI=1 npm run test:e2e
```

The unit and API tests cover:
- idempotent and concurrent check-in (10 desks scanning one ticket at once)
- a 150-person burst across desks
- matching ticket codes inside URLs
- undo, search, walk-ins, and preserving check-ins on re-import
- the Bevy normalizer and pagination, plus the token-leak guard
- the webhook secret, role-based access, cross-site request blocking and CSV formula escaping

The end-to-end tests cover:
- USB-scanner entry
- search and check-in
- walk-ins
- badge size and auto-print
- the live dashboard updating across devices
- staff and anonymous access limits
- phone layout
- a camera scan: a QR code is fed into Chromium's fake webcam and decoded

See [docs/EVENT_DAY.md](docs/EVENT_DAY.md) for the door-opening checklist.

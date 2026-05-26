# Daily Dashboard

Personal **engineering manager** day planner: **daily tasks**, **month calendar**, optional **sprint** shading on the calendar, **Jira** issue import, and a **My team** sidebar (direct reports via Jira user search). Includes **Desk Buddy**—a small in-page companion that **gamifies** day-to-day use with toasts and light pet-care mechanics.

Stack: **Node**, **Express**, **SQLite** (`better-sqlite3`), **EJS** templates, **TypeScript**.

---

## Quick start

```bash
cd daily-dashboard
cp .env.example .env
# Edit .env (see below). At minimum, nothing is required to run locally—Jira is optional.
npm install
npm run dev
```

Open **http://127.0.0.1:3000** (or whatever **`PORT`** you set).

- **First time:** use **Sign up** to create an account. Signup can optionally write Jira fields into `.env`.
- **Sign in** from `/login` when returning. **Forgot password?** emails a temporary password (configure **`AUTH_SMTP_*`** in `.env`). After sign-in, change it under **Settings → Change password**.

### Production build

```bash
npm run build
npm start
```

---

## Configuration (`.env`)

Copy **`.env.example`** to **`.env`** and adjust:

| Area | Purpose |
|------|--------|
| **`PORT`** | Server port (default `3000`). |
| **`TZ`** | Process timezone for “today” and calendar logic (see `.env.example`). |
| **`DATA_DIR`** | SQLite directory (default `./data`). Database file: `daily-dashboard.db`. |
| **Auth** | `SESSION_TTL_SECONDS`, `BCRYPT_ROUNDS`. Set **`NODE_ENV=production`** so session cookies use **`Secure`**. Forgot-password email: **`AUTH_SMTP_*`**, **`AUTH_MAIL_FROM`**, **`APP_BASE_URL`**. |
| **Sprint shading** | `SPRINT_START` / `SPRINT_END` (YYYY-MM-DD), or rely on Jira board sprint below. |
| **Jira** | `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, `ATLASSIAN_SITE`, `JIRA_BOARD_ID`, optional `JIRA_JQL`, `JIRA_MAX_RESULTS`. |
| **My team** | `JIRA_DIRECT_REPORTS` (comma/newline list; optional `Name|accountId`). |
| **Inbox alerts** (optional) | **`EMAIL_KEYWORDS`** (required). **Microsoft Graph OAuth** (recommended for Outlook / M365): `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, optional `MS_GRAPH_TENANT_ID`, `APP_BASE_URL` — each signed-in user clicks **Connect Outlook** on the day view. Legacy **IMAP** fallback: `EMAIL_IMAP_HOST`, `EMAIL_IMAP_USER`, `EMAIL_IMAP_PASS`. |

## Using the app effectively

- **Pick a day** from the calendar or `?date=YYYY-MM-DD` in the URL.
- **Tasks:** add title + optional notes, mark done, **Remove** (no confirm—feedback is a **toast**).
- **Carry over** copies incomplete items from the **last 14 calendar days** onto **today** (then opens today’s view). Each carried task adds **+1%** desk-buddy contentment (no feed/decay spike).
- **Inbox alerts:** keyword scan on Outlook mail via **Microsoft Graph** (per-user OAuth) or optional server **IMAP**; add matches to the selected day or dismiss.
- **Jira panel:** add issues to the selected day when Jira env vars are set.
- **My team:** loads when Jira is configured and direct reports are set (env or defaults).

**Toasts** (bottom of screen) give short feedback: tasks **created**, **completed**, or **removed**, plus Desk Buddy–related messages. They stay clear of the pet when the pet is docked bottom-left.

---

## Desk Buddy (pet) and gamification

Desk Buddy is the **floating corner widget** (gear opens **settings**). It is **cosmetic and local to your browser**: state lives in **localStorage** (`fullness`, name, corner, color palette, etc.), not on the server.

### Core loop

- **Fullness** is shown on a meter. Over **real time**, fullness **decays** (roughly **−10% per 5 minutes** of wall-clock time while you’re away; the app **reconciles** when you load or interact).
- **Feed** fills the meter (and can show a toast). Overfeeding at 100% gets a playful **refusal** animation.
- **Click the pet** (or focus it and press **Enter** / **Space**) to **tickle**. Tickling **tires** the pet a bit (**lowers fullness**), on top of normal decay.
- **Play** runs a **~6 second** chase with a **bouncy ball**, then applies the **same amount of “tiredness”** as **one** tickle. Feed / Play / tickling are disabled during Play so animations don’t overlap.
- If fullness hits **zero**, the buddy **falls asleep** (expired). Use **Revive** to bring them back with partial fullness.
- **Settings** (gear): rename (with **Randomize**), pick **screen corner**, and **color palette**. The buddy can be **collapsed** to a slim bar.

### How daily work “feeds” the gamified experience

When you **manage tasks through the server** (same day you’re viewing), redirects back to the calendar can include **short-lived query parameters** the page strips after use:

| Action | Effect |
|--------|--------|
| **Create task** (add form, email/Jira/fast-add paths, carry-over creating new rows, etc.) | Redirect may include **`deskPetCreate`**; the client shows a **task-created** toast and **queues “feed the buddy”** moments. |
| **Mark a task done** (toggle) | Redirect may include **`deskPetComplete`**; **task-completed** toast + feed queue for completions. |
| **Remove a task** | Redirect may include **`taskRemoved`**, **`taskTitle`**, and **`deskPetRemove`**; **task-removed** toast and **+1%** contentment (no decay tick that load). |

Counts are **capped** so a single load doesn’t spam dozens of feeds. Desk Buddy’s **happier animations** and your **toasts** reinforce finishing work—without changing data on the server beyond normal task operations.

### Developer hook (`window.DeskPet`)

Scripts expose **`window.DeskPet`** (state, `feed`, `play`, `tickle`, `revive`, `subscribe` to events like `deskPet:feed`, `deskPet:tickle`, `deskPet:play`, etc.) for debugging or future extensions.

---

## Tests

```bash
# Run the full suite once (Vitest, Node environment).
npm test

# Run with V8 coverage (summary in terminal + HTML under ./coverage/).
npm run test:coverage
```

Tests live in **`src/**/*.test.ts`**. Coverage ignores the thin **`index.ts`** entrypoint and type stubs. Add **`coverage/`** is gitignored.

---

## Features (summary)

- Month **calendar** with **today** highlight; optional **active sprint** range from **`JIRA_BOARD_ID`** ([Agile board sprint API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-agile-1-0-board-boardid-sprint-get)), e.g. `…/boards/1577` → `JIRA_BOARD_ID=1577`. If Jira isn’t configured or the API errors, **`SPRINT_START` / `SPRINT_END`** in `.env` can still shade the grid.
- **Jira** issues: `POST /rest/api/3/search/jql` ([CHANGE-2046](https://developer.atlassian.com/changelog/#CHANGE-2046)).
- **My team:** `GET /rest/api/3/user/search`; roster from **`JIRA_DIRECT_REPORTS`** in `.env`.

---

## Git hooks (`.env` backup on push)

Before each **`git push`**, the **`pre-push`** hook copies into **`~/daily-dashboard-env/`**:

| File | Backup name |
|------|-------------|
| `.env` | `daily-dashboard.env` |
| SQLite DB | `daily-dashboard.db` |

The DB path matches the app: **`DATA_DIR`** from `.env` if set, otherwise **`data/daily-dashboard.db`**.

Enable hooks once per clone:

```bash
git config core.hooksPath githooks
```

---

## GitHub

```bash
gh auth login
gh repo create daily-dashboard --private --source=. --remote=origin --push
```

Or add `origin` and `git push -u origin main`.

---

## Stack

TypeScript, Express, EJS, Zod, better-sqlite3, bcryptjs, Jira REST v3 (read-only for issue search and user lookup).

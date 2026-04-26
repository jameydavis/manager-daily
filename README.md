# Manager Daily

Personal **engineering manager** day planner: **daily tasks**, **month calendar**, optional **sprint window** shading, **Jira** issue import, and a **My team** sidebar (direct reports via Jira user search). One **Node** process—**Express**, **SQLite** (`better-sqlite3`), **EJS** templates.

## Run

```bash
cd manager-daily
cp .env.example .env
# Edit .env: ATLASSIAN_*, PORT, optional SPRINT_*, JIRA_JQL, JIRA_DIRECT_REPORTS
npm install
npm run dev
```

Open the URL printed in the terminal (default **http://127.0.0.1:3000** if `PORT` is unset).

Production:

```bash
npm run build
npm start
```

## Features

- Pick a day (`?date=YYYY-MM-DD` or use the calendar).
- Add tasks, optional notes, mark done, delete.
- **Carry over** copies incomplete tasks from the previous calendar day into the selected day.
- Calendar shows **today** and optional **sprint** days via `SPRINT_START` / `SPRINT_END` in `.env`.
- **Jira:** set `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, `ATLASSIAN_SITE`. Uses **`POST /rest/api/3/search/jql`** ([CHANGE-2046](https://developer.atlassian.com/changelog/#CHANGE-2046)).
- **My team:** resolves people with **`GET /rest/api/3/user/search`**. Default names are built in; override with **`JIRA_DIRECT_REPORTS`**. Use **`Name|accountId`** to disambiguate.
- Data: `data/manager-daily.db` by default (`DATA_DIR` optional).

## GitHub

Authenticate the CLI, then create and push (example):

```bash
gh auth login
gh repo create manager-daily --private --source=. --remote=origin --push
```

Or create an empty repo on GitHub and run:

```bash
git remote add origin https://github.com/YOUR_USER/manager-daily.git
git push -u origin main
```

## Stack

TypeScript, Express, EJS, Zod, better-sqlite3, Jira REST v3 (read-only).

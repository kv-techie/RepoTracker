# RepoTracker

> **Track real coding activity—even when you forget to commit.**

RepoTracker is a **hybrid repository observability platform** for developers and teams. It is **NOT** a GitHub dashboard. By combining local filesystem events, local git commits, and remote GitHub data, RepoTracker provides a true, offline-first picture of your engineering momentum and repository health.

Everything it reports is computed from your own machine by a local agent, stored in a local SQLite file, and explained in the interface: every score lists the factors that produced it, and no number comes from a model.

---

## 🌟 Core Pillars

1. **Hybrid Source Intelligence**: Merges local filesystem, local git, and GitHub data to track uncommitted work and private repos.
2. **Developer Observability**: Insights into coding streaks, commit behaviors, and repository staleness.
3. **Offline-first Usability**: A fully functional local agent and cache means you can track your work with zero internet connection.
4. **Explainable Analytics**: Every health or momentum score explains *why* it changed. No black-box AI scores.
5. **Efficient UX**: Minimal, information-dense interface built for developers to see what needs attention in under 5 seconds.
6. **Production-grade Reliability**: Edge-case tested, secure local-first architecture.

---

## 🏗 Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│  Dashboard · Insights · Recruiter Lens · Settings           │
│  middleware.ts: session or loopback, else 401 / redirect    │
└───────────────────────┬────────────────────────────────────┘
                        │ /api/agent/* (proxy adds X-Agent-Token)
┌───────────────────────▼────────────────────────────────────┐
│                   FastAPI Agent (127.0.0.1:8001)            │
│  scanner.py   discovery, git state, files, README           │
│  resolver.py  which of the three sources is freshest        │
│  health.py    health · momentum · staleness                 │
│  recruiter.py portfolio score from observed signals         │
│  ai.py + ai_orchestrator.py   optional, local model first   │
│  watcher.py   debounced per-repo rescans                    │
│  db.py        SQLite (agent/repotracker.db)                 │
└──────────┬────────────────────────┬───────────────────────┘
           │ GitPython              │ watchdog
    Local Git Repos           Filesystem Events
           │                        │
    ┌──────▼────────────────────────▼──────┐
    │         Your local machine           │
    └──────────────────────────────────────┘
                                            │ GitHub OAuth (optional)
                                    ┌───────▼────────┐
                                    │   GitHub API   │
                                    └────────────────┘
```

**Two processes.** The agent does all the reading and scoring; the Next.js app only displays what the agent computed and merges in GitHub metadata for repos you have signed in for. The browser never talks to the agent directly and never holds the agent token.

### Source-of-Truth Hierarchy

RepoTracker's **Hybrid Source Resolver™** never assumes GitHub is the authoritative source. It always determines the freshest state using the following priority:

1. `local_filesystem` — the newest file modification time in the working tree
2. `local_git` — the HEAD commit time
3. `github_remote` — the upstream branch head, read from the remote-tracking ref, so no network call is needed

The freshest of the three wins, with local sources winning ties. The result is exposed as `latest_source` on every repo and shown as a badge in the UI.

**What is excluded from "activity":** dependency and build folders (`node_modules`, `venv`, `.venv`, `dist`, `build`, `out`, `target`, `.next`, `.cache`, `coverage`, …) and machine-written files (`*.db`, `*.db-wal`, `*.db-shm`, `*.log`, `*.tmp`, `*.swp`). An `npm install` therefore never counts as coding.

---

## 📐 How the numbers are produced

Every score below is deterministic and computed locally. The UI shows the factors; nothing here is model-generated.

### Health score (0–100)

| Factor | Points |
|--------|-------:|
| Base | 50 |
| Activity in the last 3 days, **or** marked deployed | +20 |
| Activity in the last 7 days (instead of the above) | +10 |
| README present | +10 |
| No stale branches (none idle over the stale threshold) | +10 |
| Each stale branch | −10 (max −30) |
| More than 5 uncommitted files | −10 |
| More than 20 uncommitted files | −20 (replaces the −10) |
| No activity for 30–90 days | −15 |
| No activity for over 90 days | −25 |

Clamped to 0–100 and labelled: excellent ≥ 85, good ≥ 70, fair ≥ 50, poor ≥ 30, critical below that. The repo page lists each factor with its points, and **health history** records every change so the page can say what moved it (for example, "−15 from inactivity").

### Momentum and staleness

- **Momentum** compares commits in the last 4 weeks with the 4 weeks before: growing at +20% or more, declining at −20% or worse, otherwise stable. The reason string carries both counts.
- **Staleness** is days since the freshest activity, against `stale_threshold_days` (default 30) and `dead_threshold_days` (default 90): low, moderate (over 14 days), high, critical.

### Marking a repo as deployed

A finished project should not decay. Marking a repo deployed (from its row menu) is stored by the agent, survives rescans, and changes scoring:

- no inactivity penalty, and +20 for being shipped and stable
- staleness is forced to `low`, and the repo is left out of the attention bar
- momentum is not tracked
- the repo is tagged `deployed` rather than `active` or `stale`

Uncommitted work, missing READMEs and stale branches still count — those remain real problems in a shipped project.

### README quality (0–100)

Scored from the document's content, not just its outline. A section counts when the README **shows** it:

| Signal | How it is detected | Points |
|--------|--------------------|-------:|
| README exists | any `README.*` | 10 |
| Description | first real paragraph (badges and the title skipped), ≥ 60 characters | 20 |
| Installation | an install heading **or** a code block running `pip install`, `npm install`, `cargo install`, `docker build`, `git clone`, … | 20 |
| Usage | a usage heading **or** a runnable example line that is not the install step | 20 |
| Licence | a `LICENSE` file, a licence heading, **or** a named licence in the text | 15 |
| Code examples | at least one fenced block | 8 |
| Screenshot or diagram | a non-badge image | 4 |
| Substantial prose | 150 words or more | 3 |

Every credited section is reported with its evidence ("installation: code block runs `pip install`"), and what is missing is listed beside it.

### Codebase context size

An estimate of how much of a repo a model would have to read:

- only files git tracks or would track (`git ls-files --cached --others --exclude-standard`), so ignored build output never counts
- lockfiles, `*.min.js`, `*.map`, `*.snap` and bundles are excluded
- source and text extensions only, each file under 1 MB
- characters ÷ **3.7**, a rough average for code

Repos the agent cannot read (GitHub-only, no local clone) get no estimate at all rather than a fabricated one — GitHub's `size` field is the packed repository including history and binaries, and is not comparable.

### Recruiter Lens™ portfolio score

Eight criteria, weights summing to 1.00:

| Criterion | Weight | Read from |
|-----------|-------:|-----------|
| README quality | 20% | the README score above |
| Commit hygiene | 20% | health, staleness and momentum |
| Test coverage signal | 15% | test files anywhere in the tree (`tests/`, `__tests__/`, `test_*.py`, `*.spec.ts`, `jest.config.*`, …) |
| Deployment readiness | 15% | a remote, plus the deployed flag |
| Documentation quality | 10% | installation, usage, licence, code examples |
| Architecture maturity | 10% | observed structure: lockfile, CI workflow, linter config, typed-language config, container setup, source directory, test suite |
| Project clarity | 5% | description and GitHub topics |
| Maintainability | 5% | health score |

The result carries a **Portfolio Readiness** band with its thresholds stated: Strong (80+), Solid (60–79), Early (under 60). There is no invented "interview probability".

---

## ✨ Features

### 1. Hybrid Source Intelligence
- Multi-source tracking: GitHub, local folders, local git repos, private and unpushed work
- **Hybrid Source Resolver™** — always determines the freshest source
- Sync drift against the branch's real upstream, whatever the remote is named; `sync.upstream` reports it, or `null` when a branch tracks nothing
- Repos nested inside other repos are tracked as their own projects; git submodules are not double-counted
- File watching: saving a file re-scans that repo after a few quiet seconds
- Offline-first. Background `git fetch` is **off by default**, and throttled per repo when enabled
- Repos that disappear from disk are tagged `missing`, then removed after 7 days

### 2. Developer Dashboard
- One list, one row per repo: health, risk, unpushed and uncommitted counts, freshest-source badge
- Smart filters that only offer states some repo is actually in
- Custom collections (college, freelance, experiments…), stored by the agent so they survive rescans and follow you between browsers
- An attention line summarising what is at risk, excluding deployed repos
- CSV and PDF export of the current view

### 3. Commit & Developer Intelligence
- GitHub-style commit heatmap (52 weeks × 7 days), bucketed by **your local calendar day**
- Coding streaks, current and longest
- Night owl share (commits between 8pm and 4am), weekend share, peak hour and busiest day
- Commits are de-duplicated by SHA, so a repo that is both local and on GitHub is counted once
- Codebase context size per repo, with the number of files behind each figure

### 4. Explainable Repository Health Engine
- Health, momentum and staleness, each with the reasoning attached
- Health history: every change stored, with a plain-language diff of what moved the score
- Recovery suggestions derived from the same factors

### 5. File & README Intelligence
- Hotspots: the files changed most across the newest 100 commits
- Recently modified files (last 7 days), large file detection, test-file count
- README quality with per-section evidence and missing-section alerts
- Structure signals: CI workflow, lockfile, linter config, typed config, container setup

### 6. Recruiter Lens™
- Simulates how a hiring manager reads the repository, scored from the table above
- Hiring signals and up to five specific improvements, ranked by impact
- AI commentary is **off by default** and generated only when you ask for it

### 7. Adaptive AI Routing™ (Optional)
- Local **Ollama** first, cloud **Gemini** as fallback (`google-genai`, model id configurable), rule-based output always available
- Provider status comes from a real call, so "configured" means "answering"
- Request counts persist per provider per day
- Repository data is passed to models inside `<data>` delimiters with an instruction to treat it as data, never as instructions
- AI never produces a score: it explains numbers the agent already computed

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- Python 3.10+
- Git (for the agent to read repositories)
- A GitHub account is **optional** — sign-in adds remote repos, stars and push dates

### 1. Local Agent

The agent is mandatory: it is what reads your repositories.

```bash
cd agent
python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
python main.py
```

The agent listens on `http://127.0.0.1:8001` and, on first start, writes `agent/.env` with a random `RT_AGENT_TOKEN`. Every request must carry that token in an `X-Agent-Token` header; the Next.js server adds it, so the browser never sees it.

### 2. Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The dev server binds to `127.0.0.1`.

**Local mode:** without signing in you still get everything local — repos, scores, filters, collections and insights. Sign in with GitHub to add remote repos, stars and push dates.

### 3. Configure watched folders

**Settings → Watched Folders**, one path per line. Or copy `agent/config.example.json` to `agent/config.json`:

```json
{
  "watched_folders": ["C:/Users/you/projects"],
  "scan_interval_seconds": 300,
  "stale_threshold_days": 30,
  "dead_threshold_days": 90,
  "ai_enabled": true,
  "ai_mode": "auto",
  "auto_fetch": false
}
```

`agent/config.json` is git-ignored, and secrets are never written to it.

### 4. Secrets (`agent/.env`)

Written by the agent and by Settings; see `agent/.env.example`. Also git-ignored.

```env
RT_AGENT_TOKEN=generated_on_first_start
RT_GEMINI_API_KEY=
```

Any `RT_`-prefixed environment variable overrides both files.

### 5. Frontend environment (`.env.local`)

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_id
GITHUB_CLIENT_SECRET=your_secret
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=http://localhost:3000
AGENT_BASE_URL=http://127.0.0.1:8001
# optional: overrides the token read from agent/.env
AGENT_TOKEN=
```

### 6. Run it in the background (recommended)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-repotracker.ps1
```

Starts the agent and a **production** web server (`npm run build && npm run start`), writes `logs/agent.log`, `logs/web.log` and `logs/supervisor.log`, polls `/status` every 60 seconds, and restarts the agent if it stops answering — including clearing an orphaned process that still holds the port.

`install-startup.bat` registers `run-silent.vbs`, which runs the same script hidden at login.

### 7. Pre-commit secret scan (recommended)

```bash
git config core.hooksPath .githooks
```

Blocks commits that add API keys, GitHub tokens, private keys, or local-only files such as `agent/.env`.

---

## ⚙️ Configuration reference

| Key | Default | Meaning |
|-----|---------|---------|
| `watched_folders` | `[]` | Folders scanned recursively for git repos |
| `scan_interval_seconds` | `300` | Time between full scans (minimum 30) |
| `agent_port` | `8001` | Agent port, loopback only |
| `stale_threshold_days` | `30` | When a repo counts as stale |
| `dead_threshold_days` | `90` | When a repo counts as possibly abandoned |
| `auto_fetch` | `false` | Background `git fetch` of upstream remotes |
| `fetch_interval_minutes` | `60` | Minimum gap between fetches, per repo |
| `ai_enabled` | `false` | Master switch for the AI layer |
| `ai_mode` | `auto` | `auto` \| `ollama` \| `gemini` \| `disabled` |
| `ollama_model` | `llama3` | Local model name |
| `gemini_model` | `gemini-2.5-flash` | Cloud model id |
| `gemini_api_key` | — | Stored in `agent/.env`, never in `config.json` |
| `agent_token` | generated | API token, stored in `agent/.env` |

---

## 🗄 Data model

SQLite at `agent/repotracker.db`, created and migrated on start:

| Table | Holds |
|-------|-------|
| `repos` | one row per repo, with scores stored as JSON, plus `collection` and `user_tags`, which scans never overwrite |
| `commits` | one row per commit per repo, keyed `repo_id:sha` |
| `health_history` | a snapshot each time a health score changes, pruned to the newest 200 per repo |
| `scan_history` | duration and repo count per scan |
| `ai_usage` | AI requests per provider per day |

Indexed on `commits(repo_id, committed_at)`, `commits(committed_at)`, `commits(sha)` and `health_history(repo_id, recorded_at)`. Foreign keys are enforced, and the database runs in WAL mode.

Watcher events are deliberately **not** persisted: they drive the debounced rescan in memory. (Storing them once caused a feedback loop — writing an event changed the database file, which produced another event.)

---

## 🔌 API reference

### Frontend routes

All require a session, or a loopback request in local mode.

| Route | Method | Description |
|-------|--------|-------------|
| `/api/agent/status` | GET | Agent online status, repo count, folder count |
| `/api/agent/repos` | GET | Repos, filterable by `tag` and `collection`, pageable |
| `/api/agent/repos/[id]` | PATCH | Set a repo's collection or deployed flag |
| `/api/agent/repos/[id]/commits` | GET | Commits for one repo |
| `/api/agent/repos/[id]/recruiter` | GET | Recruiter Lens; `?skip_ai=true` for rules only |
| `/api/agent/insights/commits` | GET | De-duplicated commit timestamps; `?years=N` to window |
| `/api/agent/health/[id]` | GET | Health, history and what changed |
| `/api/agent/scan` | POST | Trigger a scan now |
| `/api/agent/config` | GET/PATCH | Read and update agent config |
| `/api/agent/ai/summary` | GET | Weekly summary, generated on request |
| `/api/agent/ai/query` | POST | Natural-language question over your repo data |
| `/api/agent/ai/provider-status` | GET | Live check of Ollama and Gemini |
| `/api/agent/ai/stats` | GET | Persisted request counts per provider |
| `/api/github/repos` | GET | Your GitHub repos, paginated |
| `/api/github/commits` | GET | Commits for one GitHub repo |

### Agent endpoints

Same resources on `127.0.0.1:8001`, each requiring `X-Agent-Token`:

`/status` · `/repos` · `/repos/{id}` (GET, PATCH) · `/repos/{id}/commits` · `/repos/{id}/health` · `/repos/{id}/recruiter` · `/insights/commits` · `/scan` · `/scan/last` · `/config` (GET, PATCH) · `/ai/summary` · `/ai/query` · `/ai/stats` · `/ai/provider-status`

---

## 🧪 Testing

Every feature ships with tests, especially the edge cases: deleted repos, no internet, detached HEAD, non-`origin` remotes, timezone bucketing, and the agent's own auth.

### Backend (pytest + pytest-asyncio)
```bash
pytest                  # 118 tests in agent/tests/
```

### Frontend (Jest + React Testing Library)
```bash
npm test                # 88 tests
npm run test:watch
npm run test:coverage
```

Type checking and a production build:

```bash
npx tsc --noEmit
npm run build
```

---

## 🩺 Troubleshooting

**The UI loads but says the agent is offline.** Check `logs/agent.log` and `logs/supervisor.log`. Requests to the agent time out after 8 seconds, so a stuck agent shows as offline rather than freezing the page.

**"Port 8001 is already in use".** An earlier agent, or an orphaned worker, still holds it. The supervisor clears this itself; manually, find the owner with `Get-NetTCPConnection -LocalPort 8001` and stop it.

**Pages render without styling.** Something ran `next build` while `next dev` was running — both write to `.next`. Stop the servers, delete `.next`, and start again.

**Everyday use should not be `npm run dev`.** Use the supervisor script, which serves a production build. Hot reload adds memory and CPU for no benefit here.

**Scans feel slow.** Turn `auto_fetch` off (the default), and check that watched folders do not include huge dependency trees outside your projects.

---

## 🛣 Roadmap

- [x] UI built on vanilla CSS with a single design system and icon set
- [x] Chronological fallback in sync status, upstream-aware for any remote name
- [x] Recruiter Lens™ scored from observed signals
- [x] Adaptive AI Routing™ with Ollama first and Gemini fallback
- [x] Debounced watchdog rescans, bounded queue, no persisted event log
- [x] Token-authenticated agent API, plus local mode without GitHub sign-in
- [x] Health history with an explanation of what changed
- [x] Content-based README analysis and honest context-size estimates
- [x] Supervisor script with logs and agent health checks
- [ ] Key repos on their root commit, so moving a folder keeps its history
- [ ] Split `scanner.py` into discovery, README and file-analysis modules
- [ ] Store agent secrets in the OS keyring instead of a plaintext `.env`
- [ ] Cloud sync with PostgreSQL for distributed teams
- [ ] Expand the health engine to cover advanced git patterns

---

## 📁 Project layout

```text
agent/            FastAPI agent: scanner, scoring, persistence, AI routing
  tests/          pytest suite
app/              Next.js app router: pages and API proxy routes
components/       UI components, one icon set (components/Icon.tsx)
lib/              client helpers: agent proxy, hybrid merge, dates, export
styles/           globals.css, the whole design system
types/            shared TypeScript contracts
scripts/          start-repotracker.ps1 supervisor
.githooks/        pre-commit secret scan
__tests__/        Jest suite, including page-level tests
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14.2, React 18, TypeScript, vanilla CSS |
| **Backend Agent** | FastAPI, Python 3.10+ |
| **Git Analysis** | GitPython |
| **File Watching** | watchdog |
| **Local Storage** | SQLite (aiosqlite) |
| **Cloud Storage** | PostgreSQL (planned) |
| **AI (Optional)** | Ollama, Gemini via `google-genai` |
| **Auth** | NextAuth + GitHub OAuth (optional; local mode works without it) |
| **Testing** | Jest, React Testing Library, pytest, pytest-asyncio |

---

## 🛡 Security

RepoTracker is built to run on your own machine:

- **The agent API requires a token.** Generated on first start into `agent/.env`, attached server-side by the Next.js proxy, never sent to the browser. It is re-read once on a 401, so restarting the agent does not break the app.
- **Local paths stay local.** `local_path`, `db_path` and watched folders are excluded from API responses; the UI shows counts, not paths.
- **Loopback only.** The agent binds to `127.0.0.1` and the dev and production servers bind to `127.0.0.1`. Requests carrying a non-local `Host` header are refused unless signed in, which also blocks DNS-rebinding pages.
- **Secrets are git-ignored, not encrypted.** `agent/.env` and `agent/config.json` are plaintext on disk and excluded from git. An OS keyring is on the roadmap.
- **A pre-commit hook** blocks accidental commits of keys, tokens and local-only files.
- **Model prompts treat your data as data**, inside delimiters, so repository text cannot steer the model.

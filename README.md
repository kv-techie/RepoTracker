# RepoTracker

> **Track real coding activity—even when you forget to commit.**

RepoTracker is a **hybrid repository observability platform** for developers and teams. It is **NOT** a GitHub dashboard. By combining local filesystem events, local git commits, and remote GitHub data, RepoTracker provides a true, offline-first picture of your engineering momentum and repository health.

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
│  Dashboard · Insights · Recruiter Lens · Settings          │
└───────────────────────┬────────────────────────────────────┘
                        │ /api/agent/* (proxy)
┌───────────────────────▼────────────────────────────────────┐
│                   FastAPI Agent (:8001)                     │
│  scanner.py · resolver.py · health.py · watcher.py · ai.py │
│  SQLite (repotracker.db)                                   │
└──────────┬────────────────────────┬───────────────────────┘
           │ GitPython              │ watchdog
    Local Git Repos           Filesystem Events
           │                        │
    ┌──────▼────────────────────────▼──────┐
    │         Your local machine           │
    └──────────────────────────────────────┘
                                            │ GitHub PAT
                                    ┌───────▼────────┐
                                    │   GitHub API   │
                                    └────────────────┘
```

### Source-of-Truth Hierarchy

RepoTracker's **Hybrid Source Resolver™** never assumes GitHub is the authoritative source. It always determines the freshest state using the following priority:
1. `local_filesystem` (file modification timestamp)
2. `local_git` (local commit timestamp)
3. `github_remote` (remote push timestamp)

This hierarchy is always exposed via the `latest_source` attribute, ensuring true hybrid intelligence.

---

## ✨ Features

### 1. Hybrid Source Intelligence
- Multi-source tracking: GitHub, local folders, local git repos, private/unpushed
- **Hybrid Source Resolver™** — always determines freshest source
- Sync drift detection: local ahead/behind, chronologically diverged
- Auto file watching (watchdog)
- Offline-first (SQLite cache)

### 2. Developer Dashboard
- Repo cards with health ring, sync status, momentum, hybrid source badge
- Smart Filters: stale / active / unpushed / local-only / broken / deployed
- Custom Collections (college, freelance, experiments…)
- Staleness alerts for at-risk repos
- CSV and PDF export

### 3. Commit & Developer Intelligence
- GitHub-style commit heatmap (52 weeks × 7 days)
- Coding streaks (current + longest)
- Night owl detection (% of commits after 8pm)
- Weekend warrior score
- Peak coding hour and day

### 4. Explainable Repository Health Engine
- **Health Score** (0–100) — fully explainable breakdown (e.g., "Score dropped because of 4 stale branches")
- **Momentum Score** — growing / stable / declining
- **Staleness Risk** — "X days from going dead"

### 5. File & README Intelligence
- **AI Token Footprint (Codebase Context Sizing)** — heuristic token count for all repos
- Recently modified files (last 7 days)
- Large file detection
- README quality score (0–100) and missing section alerts

### 6. Recruiter Lens™
- Simulates a real hiring manager evaluating your repository.
- Generates a **Portfolio Score** (0–100) based on project structure and activity.
- Extracts positive hiring signals and provides actionable improvement suggestions.
- Built-in token-saving toggles to generate AI commentary only when requested.

### 7. Adaptive AI Routing™ (Optional)
- Intelligently routes requests between local **Ollama** models and cloud **Gemini** APIs to maximize speed and minimize token costs.
- Completely removes dependencies on paid models (like OpenAI) to remain accessible for students.
- Zero black-box AI scores: AI is strictly used to explain results, summarize trends, and suggest actions grounded in *actual metrics*.
- Explains *why* scores change; no fabricated metrics.

---

## 📸 Screenshots

*(UI screenshots will be added here following UI updates)*

- **Dashboard**: High-density view of repository health and staleness.
- **Explainable Metrics**: Detailed breakdown of why a repository score changed.

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- Python 3.10+
- GitHub PAT (optional — for remote sync)

### 1. Frontend

```bash
npm install
npm run dev
```
Open `http://localhost:3000`

### 2. Local Agent

The Local Agent is **mandatory** for RepoTracker to function.

```bash
cd agent
python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
python main.py
```
Agent runs on `http://localhost:8001`

### 3. Configure Watched Folders

Go to **Settings** → add your project folder paths → Save.
Or edit `agent/config.json` directly:

```json
{
  "watched_folders": ["C:/Users/you/projects"],
  "scan_interval_seconds": 300,
  "github_pat": "ghp_...",
  "ai_mode": "auto",
  "ai_enabled": true
}
```

### 4. Environment Variables (`.env.local`)

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_id
GITHUB_CLIENT_SECRET=your_secret
NEXTAUTH_SECRET=your_secret
AGENT_BASE_URL=http://127.0.0.1:8001
```

---

## 🧪 Testing

Every major feature in RepoTracker requires comprehensive testing, especially for edge cases (repo deleted, no internet, detached HEAD).

### Frontend (Jest + React Testing Library)
```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # with coverage
```

### Backend (pytest + pytest-asyncio)
```bash
pip install -r agent/requirements.txt
pytest                  # runs agent/tests/
```

---

## 🛣 Roadmap

- [x] Complete UI components utilizing Tailwind CSS and vanilla CSS modules for a clean, minimal developer UX.
- [x] Upgrade frontend to Next.js 15 for advanced React 19 features.
- [x] Introduce explicit Chronological Fallback resolution in Sync Status.
- [x] Integrate Recruiter Lens™ for automated portfolio scoring.
- [x] Implement Adaptive AI Routing™ with Ollama (local) and Gemini (cloud) fallback.
- [ ] Stabilize watchdog filesystem event listener for cross-platform support.
- [ ] Implement cloud sync with PostgreSQL for distributed teams.
- [ ] Expand the Explainable Health Engine metrics to cover advanced git patterns.

---

## 🔌 API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/agent/status` | GET | Agent online status |
| `/api/agent/repos` | GET | All detected repos (filterable) |
| `/api/agent/health/[id]` | GET | Explainable health for repo |
| `/api/agent/scan` | POST | Trigger immediate scan |
| `/api/agent/config` | GET/PATCH | Read/update agent config |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 18/19, TypeScript, Vanilla CSS |
| **Backend Agent** | FastAPI, Python 3.10+ |
| **Git Analysis** | GitPython |
| **File Watching** | watchdog |
| **Local Storage** | SQLite (aiosqlite) |
| **Cloud Storage** | PostgreSQL (Planned) |
| **AI (Optional)** | Adaptive AI Routing (Ollama / Gemini) |
| **Auth** | NextAuth + GitHub OAuth |
| **Testing** | Jest, React Testing Library, pytest, pytest-asyncio |

---

## 🛡 Security

RepoTracker follows strict security principles:
- GitHub tokens, local paths, and secrets are **NEVER** exposed publicly or in the frontend.
- Local cache uses encrypted storage patterns where necessary.
- Employs server-side authentication and least privilege tokens.

---

## 📜 License

MIT

# RepoTracker — AI Engineering Rules
Version: 1.0

This document is the authoritative engineering and product guideline ("bible")
for any AI agent contributing to RepoTracker.

All code, architecture decisions, refactors, and feature additions must obey this file.

Failure to follow these rules is considered a bad change.

---

# 1. Product Mission

RepoTracker is NOT a GitHub dashboard.

RepoTracker is:

"GitHub + Local repository observability platform for developers and teams."

Primary promise:

Track real developer activity — even when work has not been pushed.

GitHub is NOT the only source of truth.
The local machine is equally important.

Every feature must strengthen this idea.

---

# 2. Core Product Pillars

Every contribution must support at least one:

1. Hybrid Source Intelligence
2. Developer Observability
3. Offline-first usability
4. Explainable analytics
5. Efficient UX
6. Production-grade reliability

If a feature does not support one of these, reject it.

---

# 3. Source-of-Truth Hierarchy

Always determine latest state using:

1. local file modification timestamp
2. local git commit timestamp
3. remote git provider timestamp

Use freshest source.

Never assume GitHub is latest.

Always expose:
"latest_source"

Possible values:
- local_filesystem
- local_git
- github_remote

---

# 4. Architecture Rules

Preferred architecture:

Frontend:
- Next.js
- TypeScript
- Tailwind

Backend:
- Python preferred
- FastAPI preferred

Local Agent:
- Python daemon/service

Storage:
- SQLite for local cache
- PostgreSQL for cloud

Caching:
- Redis when needed

Do not replace Python services with Node unless explicitly required.

Python is preferred for:
- analytics
- file watching
- ML
- local agent
- scoring engines

---

# 5. Local Agent Rules

Local Agent is mandatory.

Responsibilities:
- scan user-defined folders
- detect git repos
- detect uncommitted changes
- detect local-only commits
- watch filesystem changes
- sync metrics to dashboard

Recommended libraries:
- GitPython
- watchdog
- FastAPI

Never remove local-agent capability.

---

# 6. Offline-first Rule

Application must remain useful without internet.

Required:
- local repo scan
- cached analytics
- local dashboard availability

Remote APIs are enhancement only.

Offline usability is a requirement.

---

# 7. UX Rules

Design philosophy:
- minimal
- fast
- no clutter
- information dense
- developer-first

Avoid:
- excessive animations
- visual noise
- unnecessary clicks

Dashboard must answer:
"What needs my attention?"

within 5 seconds.

---

# 8. Feature Acceptance Test

Before adding a feature ask:

1. Does this improve observability?
2. Does this improve local + remote parity?
3. Is this useful weekly?
4. Does it avoid clutter?
5. Can a student use it for free?

If 3 or more are "no", reject feature.

---

# 9. Scoring Engines Must Be Explainable

Any score:
- health
- momentum
- sustainability
- activity

must explain:
WHY score changed.

Bad:
"Health = 72"

Good:
"Health dropped because:
- commits down 18%
- 4 stale branches
- 2 unresolved PRs"

Black-box scoring is forbidden.

---

# 10. Avoid Vanity Features

Do NOT prioritize:
- fancy charts with no insight
- cosmetic widgets
- useless badges
- gimmicks

Insight > visuals.

Always.

---

# 11. Performance Rules

Dashboard load target:
< 2 seconds

Background sync:
non-blocking

Use:
- lazy loading
- caching
- pagination
- debounce where appropriate

Avoid expensive polling.

Prefer event/webhook based updates.

---

# 12. Security Rules

Never expose:
- GitHub tokens
- local paths publicly
- secrets in frontend

Use:
- encrypted storage
- server-side auth
- least privilege tokens

Security is mandatory.

---

# 13. Code Quality Rules

All code must be:
- typed
- modular
- documented
- testable

Avoid:
- giant files
- duplicated logic
- magic constants

Preferred:
small reusable services.

---

# 14. Testing Requirements

Every major feature needs:

unit tests:
- analytics logic
- scoring logic

integration tests:
- GitHub sync
- local sync

edge cases:
- repo deleted
- no internet
- broken git repo
- path moved
- detached HEAD

Never skip edge cases.

---

# 15. AI Feature Rules

AI must:
- explain results
- summarize trends
- suggest actions

AI must NOT:
- hallucinate repository state
- fabricate metrics

AI outputs must cite actual metrics.

---

# 16. README Rules

Every major feature added must update:
- feature list
- architecture diagram
- roadmap
- screenshots if UI changes

README drift is not allowed.

---

# 17. Product Positioning Guardrail

Never describe RepoTracker as:
"GitHub dashboard"

Always describe it as:

"Hybrid repository observability platform"

or

"Track real coding activity—even when you forget to commit."

---

# 18. Decision Rule

When uncertain:

choose:
more useful
over
more clever.

Always optimize for developer usefulness.

# 19. Token Efficiency Rules

AI agents must optimize for minimal token usage.

Principles:

1. Change only what is necessary.
   - Do not rewrite entire files for small edits.
   - Prefer surgical diffs.

2. Preserve unchanged code.
   - Avoid reformatting unrelated sections.
   - Avoid unnecessary renaming.

3. Think before generating.
   - Plan internally first.
   - Output only final useful changes.

4. Minimize verbose explanations.
   - Explain only decisions that matter.
   - Prefer concise technical reasoning.

5. Reuse existing patterns.
   - Follow current architecture.
   - Do not introduce new abstractions unless necessary.

6. Avoid duplicate logic.
   - Reuse existing utilities/components/services.

7. Prefer incremental implementation.
   - Deliver in small safe steps.
   - Avoid massive multi-file rewrites.

8. Batch related edits.
   - If multiple small edits affect one file, perform them together.

9. Do not generate placeholder code unless explicitly requested.

10. Respect user budget.
   RepoTracker is built by a student.
   Prefer:
   - free tools
   - free APIs
   - open-source libraries
   - local-first solutions

Primary rule:

Maximum value per token.

# 20. Commit Message Rules

Every code change must include a proposed commit message.

Commit messages must be:
- concise
- specific
- action-oriented
- human-readable

Format:
<type>: <what changed>

Examples:
- feat: add local repository file watcher
- fix: resolve stale repo detection bug
- refactor: split health scoring into service layer
- docs: update README feature list
- perf: cache GitHub repo metadata locally
- test: add sync resolver edge-case coverage

Rules:

1. Keep subject line under 72 characters.

2. Use present tense.
   Good:
   "add local cache"
   Bad:
   "added local cache"

3. Mention intent, not implementation details.
   Good:
   "fix local sync detection"
   Bad:
   "change line 42 in sync.py"

4. One logical change = one commit message.

5. If multiple unrelated changes exist, suggest separate commits.

Bad:
"misc changes"

Forbidden:
- update
- fixes
- stuff
- changes
- final
- temp

Primary rule:

A future developer should understand the change from the commit message alone.

# 21. Frontend Design Rules

RepoTracker is a professional developer tool.

UI must look:
- clean
- minimal
- structured
- modern
- trustworthy
- information-dense

It must NOT look:
- flashy
- playful
- experimental
- over-animated
- "vibecoded"

Design standard:
think:
GitHub + Linear + Vercel
not
random startup landing page

---

## Layout Rules

Use:
- consistent spacing
- clear hierarchy
- aligned grids
- predictable navigation
- readable typography

Prefer:
8px spacing system.

Avoid:
uneven padding/margins.

---

## Color Rules

Use restrained colors.

Primary palette:
- neutral base
- subtle accent
- status colors only when meaningful

Avoid:
- rainbow palettes
- neon colors
- excessive gradients
- decorative backgrounds

Color must communicate meaning.

---

## Typography Rules

Prefer:
- clean sans-serif
- clear hierarchy
- readable sizes

Recommended:
- headings: bold
- body: regular
- metadata: muted

Avoid:
- too many font sizes
- decorative fonts
- tiny unreadable labels

---

## Component Rules

Use reusable components.

Preferred:
- cards
- tables
- tabs
- modals
- badges
- tooltips

Avoid reinventing standard UI patterns.

Use:
shadcn/ui where possible.

---

## Dashboard Rules

Dashboard must answer:

"What needs my attention?"

within 5 seconds.

Prioritize:
1. stale repos
2. local changes
3. sync issues
4. recent activity

Insight first.
Decoration second.

---

## Animation Rules

Animations must be subtle.

Allowed:
- hover transitions
- fade-ins
- loading skeletons

Avoid:
- bouncing
- spinning distractions
- parallax
- unnecessary motion

If removing animation improves clarity, remove it.

---

## Chart Rules

Charts must communicate insight.

Use:
- simple line charts
- clean bar charts
- heatmaps

Avoid:
- 3D charts
- decorative charts
- redundant charts

Every chart must answer a question.

---

## Responsiveness Rules

Desktop-first.

Tablet supported.

Mobile is secondary.

Do not sacrifice desktop productivity for mobile aesthetics.

This is a developer tool.

---

## Accessibility Rules

Required:
- keyboard navigation
- readable contrast
- proper labels
- visible focus states

Accessibility is not optional.

---

## Final UI Test

Before shipping ask:

Does this look like a tool I would trust with my code?

If no:
redesign.

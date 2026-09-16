"""Git repository scanner using GitPython.

Responsibilities:
- Walk user-defined folders for .git repos
- Extract branch, commit history, uncommitted changes, ahead/behind status
- Detect local-only repos (never pushed)
- Detect detached HEAD, broken repos (edge cases per rules §14)
"""

from __future__ import annotations
import os
import hashlib
import re
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import git
from git.exc import GitCommandError, InvalidGitRepositoryError, NoSuchPathError

from agent.models import (
    CommitRecord,
    FileIntelligence,
    HotspotFile,
    LargeFile,
    ReadmeScore,
    RepoRecord,
    SyncStatus,
)
from agent.resolver import resolve_latest_source
from agent.health import compute_health, compute_momentum, compute_staleness

logger = logging.getLogger(__name__)

# Dependency, build and cache folders inside a repo. Their mtimes change on installs
# and builds, not on coding, so they must never count as activity.
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".next", ".venv", "venv", "env",
    "dist", "build", "out", ".turbo", ".cache", "target", ".pytest_cache",
    ".mypy_cache", "coverage", ".gradle", "vendor",
}

# Files whose mtime changes without coding: databases the agent itself writes, logs, swap files
SKIP_SUFFIXES = (
    ".db", ".db-wal", ".db-shm", ".db-journal", ".sqlite", ".sqlite3",
    ".log", ".tmp", ".swp", ".pyc",
)

# How far back to read history, and how many new commits per repo get full diff stats per scan.
# Stats are a full diff each, so the budget keeps the first scan of a large repo bounded;
# later scans only diff commits not already stored.
COMMIT_HISTORY_LIMIT = 2000
STATS_BUDGET_PER_SCAN = 300
# Newest commits always diffed, so "hotspots" reflect what is being worked on now
HOTSPOT_WINDOW = 100

# Last background fetch per repo path (monotonic seconds)
_last_fetch: dict[str, float] = {}

_README_NAMES = {"readme.md", "readme.rst", "readme.txt", "readme"}
_INSTALL_WORDS = ("install", "setup", "set up", "getting started", "quick start", "quickstart")

# Commands that mean "this is how you install it", recognised inside code blocks
_INSTALL_COMMANDS = (
    "npm install", "npm i ", "yarn add", "pnpm add", "pnpm install", "bun add",
    "pip install", "pip3 install", "uv pip", "poetry add", "poetry install", "conda install",
    "cargo install", "go get", "go install", "gem install", "composer require",
    "apt install", "apt-get install", "brew install", "docker pull", "docker build",
    "make install", "./configure", "git clone",
)

# Commands or code that mean "this is how you run it"
_USAGE_COMMANDS = (
    "npm run", "npm start", "yarn dev", "pnpm dev", "python ", "python3 ", "uvicorn",
    "flask run", "django-admin", "manage.py", "docker run", "docker compose up",
    "docker-compose up", "cargo run", "go run", "node ", "npx ", "curl ", "make ",
    "./", "import ", "from ", "require(", "const ", "def ", "class ", "$ ",
)
_USAGE_WORDS = ("usage", "example", "how to use", "how to run", "running", "commands")
_LICENSE_WORDS = ("license", "licence")

_TEST_DIR_NAMES = {"tests", "test", "__tests__", "spec", "specs", "e2e"}
_TEST_FILE_PATTERN = re.compile(
    r"(^test_.*\.py$|_test\.(py|go|rb|js|ts)$|\.(test|spec)\.(js|jsx|ts|tsx)$|^.*Test\.java$)",
    re.IGNORECASE,
)
_TEST_CONFIG_FILES = {"pytest.ini", "jest.config.js", "jest.config.ts", "vitest.config.ts",
                      "tox.ini", "phpunit.xml", "karma.conf.js"}

_LOCKFILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "requirements.txt",
              "pipfile.lock", "cargo.lock", "go.sum", "gemfile.lock", "composer.lock"}
_LINTER_FILES = {".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", "eslint.config.js",
                 ".flake8", ".ruff.toml", "ruff.toml", ".pylintrc", ".rubocop.yml", ".golangci.yml",
                 ".prettierrc", ".prettierrc.json", ".editorconfig"}
_TYPED_CONFIG_FILES = {"tsconfig.json", "mypy.ini", "pyrightconfig.json", "go.mod", "cargo.toml"}
_CONTAINER_FILES = {"dockerfile", "docker-compose.yml", "compose.yaml", "docker-compose.yaml"}


def _repo_id(path: str) -> str:
    return hashlib.md5(path.encode()).hexdigest()[:16]


def _utc_from_timestamp(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def _is_generated(fname: str) -> bool:
    lowered = fname.lower()
    return lowered in _GENERATED_NAMES or lowered.endswith(_GENERATED_SUFFIXES)


def _context_files(repo_path: str) -> Optional[set[str]]:
    """Paths git would consider part of the repo (tracked plus untracked, ignoring .gitignore).

    Returns None when git cannot answer, so the caller falls back to the plain walk.
    """
    try:
        repo = git.Repo(repo_path)
        listing = repo.git.ls_files("--cached", "--others", "--exclude-standard")
    except Exception:
        return None
    return {
        os.path.normpath(os.path.join(repo_path, line))
        for line in listing.splitlines() if line
    }


def _walk_repo(repo_path: str) -> tuple[Optional[datetime], FileIntelligence]:
    """Single pass over the working tree: latest meaningful mtime plus file analytics."""
    latest: Optional[float] = None
    total_files = 0
    total_bytes = 0  # bytes from source files only (for token estimation)
    large_files: list[LargeFile] = []
    recently_modified: list[str] = []
    cutoff = datetime.now(timezone.utc).timestamp() - (7 * 86_400)

    test_file_count = 0
    context_file_count = 0
    top_level: set[str] = set()
    has_ci = False
    # Only files git tracks (or would track) count toward context size
    context_files = _context_files(repo_path)

    try:
        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            rel_root = os.path.relpath(root, repo_path)
            parts = [] if rel_root == "." else rel_root.replace("\\", "/").split("/")
            if rel_root == ".":
                top_level.update(d.lower() for d in dirs)
            if len(parts) >= 2 and parts[0] == ".github" and parts[1] == "workflows":
                has_ci = True
            in_test_dir = any(part.lower() in _TEST_DIR_NAMES for part in parts)

            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    stat = os.stat(fpath)
                except OSError:
                    continue
                total_files += 1
                lowered = fname.lower()
                if rel_root == ".":
                    top_level.add(lowered)
                if in_test_dir or _TEST_FILE_PATTERN.search(fname) or lowered in _TEST_CONFIG_FILES:
                    test_file_count += 1
                size, mtime = stat.st_size, stat.st_mtime
                rel_path = os.path.relpath(fpath, repo_path)
                ext = os.path.splitext(fname)[1].lower()
                counts_as_context = (
                    ext in _SOURCE_EXTENSIONS
                    and size <= 1_000_000
                    and not _is_generated(fname)
                    and (context_files is None or os.path.normpath(fpath) in context_files)
                )
                if counts_as_context:
                    total_bytes += size
                    context_file_count += 1
                if size > 100_000:
                    large_files.append(LargeFile(path=rel_path, size_bytes=size))
                if fname.lower().endswith(SKIP_SUFFIXES):
                    continue  # counted as a file, but its mtime is not coding activity
                if latest is None or mtime > latest:
                    latest = mtime
                if mtime > cutoff:
                    recently_modified.append(rel_path)
    except OSError:
        pass

    signals = []
    if top_level & _LOCKFILES:
        signals.append("dependency lockfile")
    if has_ci:
        signals.append("CI workflow")
    if top_level & _LINTER_FILES:
        signals.append("linter config")
    if top_level & _TYPED_CONFIG_FILES:
        signals.append("typed language config")
    if top_level & _CONTAINER_FILES:
        signals.append("container setup")
    if top_level & {"src", "lib", "app", "agent", "packages"}:
        signals.append("source directory")
    if test_file_count:
        signals.append("test suite")

    intel = FileIntelligence(
        has_tests=test_file_count > 0,
        test_file_count=test_file_count,
        context_file_count=context_file_count,
        structure_signals=signals,
        total_files=total_files,
        total_lines=0,
        total_tokens=int(total_bytes / CHARS_PER_TOKEN),
        large_files=sorted(large_files, key=lambda f: -f.size_bytes)[:10],
        hotspots=[],
        recently_modified=recently_modified[:20],
    )
    return (_utc_from_timestamp(latest) if latest else None, intel)


def _latest_file_mtime(repo_path: str) -> Optional[datetime]:
    """Latest file modification time that counts as activity."""
    return _walk_repo(repo_path)[0]


def _parse_markdown(content: str) -> dict:
    """Split a README into the parts that carry meaning: headings, prose, code, images."""
    headings: list[str] = []
    prose_lines: list[str] = []
    code_blocks: list[tuple[str, str]] = []   # (language, body)
    in_fence = False
    fence_lang = ""
    fence_body: list[str] = []

    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            if in_fence:
                code_blocks.append((fence_lang, "\n".join(fence_body)))
                fence_body, fence_lang, in_fence = [], "", False
            else:
                in_fence = True
                fence_lang = stripped.lstrip("`~").strip().lower()
            continue
        if in_fence:
            fence_body.append(line)
        elif stripped.startswith("#"):
            headings.append(stripped.lstrip("#").strip().lower())
        else:
            prose_lines.append(line)

    if in_fence and fence_body:  # unterminated fence
        code_blocks.append((fence_lang, "\n".join(fence_body)))

    prose = "\n".join(prose_lines)
    images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", content)
    badges = [src for src in images if re.search(r"shields\.io|badge|travis|circleci", src, re.IGNORECASE)]
    screenshots = [src for src in images if src not in badges]

    return {
        "headings": headings,
        "prose": prose,
        "code_blocks": code_blocks,
        "badges": badges,
        "screenshots": screenshots,
        "word_count": len(prose.split()),
    }


def _analyze_readme(repo_path: str) -> ReadmeScore:
    """Read the README and report what it actually gives a newcomer.

    Sections count when the document shows them, by heading *or* by content: an
    ``npm install`` block is an installation section whether or not a heading says so.
    Every decision is recorded in ``evidence`` so the score can explain itself.
    """
    readme_path: Optional[Path] = None
    has_license_file = False
    try:
        for fname in os.listdir(repo_path):
            lowered = fname.lower()
            if readme_path is None and lowered in _README_NAMES:
                readme_path = Path(repo_path) / fname
            if lowered.startswith("license") or lowered.startswith("licence"):
                has_license_file = True
    except OSError:
        pass

    if not readme_path:
        return ReadmeScore(
            score=0,
            has_readme=False,
            has_description=False,
            has_installation=False,
            has_usage=False,
            has_license=has_license_file,
            missing_sections=["README", "description", "installation", "usage", "license"],
            badge_suggestions=["build-status", "license", "version"],
        )

    try:
        content = readme_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        content = ""

    doc = _parse_markdown(content)
    headings, code_blocks = doc["headings"], doc["code_blocks"]
    evidence: list[str] = []

    def heading_has(words: tuple[str, ...]) -> Optional[str]:
        for heading in headings:
            for word in words:
                if word in heading:
                    return heading
        return None

    def code_block_with(commands: tuple[str, ...]) -> Optional[str]:
        for lang, body in code_blocks:
            lowered = body.lower()
            for command in commands:
                if command in lowered:
                    return command.strip()
        return None

    # ── Description: the first real paragraph, not a badge row or the title
    intro: list[str] = []
    for line in doc["prose"].splitlines():
        stripped = line.strip()
        if stripped.startswith("##"):
            break
        if not stripped or stripped.startswith(("[![", "<img", "<p align")):
            continue
        intro.append(stripped)
        if len(" ".join(intro)) >= 200:
            break
    description = " ".join(intro).strip()
    has_desc = len(description) >= 60
    if has_desc:
        evidence.append("description: opening paragraph explains the project")

    # ── Installation: a heading, or a block that actually installs something
    install_heading = heading_has(_INSTALL_WORDS)
    install_command = code_block_with(_INSTALL_COMMANDS)
    has_install = bool(install_heading or install_command)
    if install_command:
        evidence.append(f"installation: code block runs `{install_command}`")
    elif install_heading:
        evidence.append(f"installation: heading \"{install_heading}\"")

    # ── Usage: a heading, or runnable examples that are not the install step
    usage_heading = heading_has(_USAGE_WORDS)
    usage_command = None
    for lang, body in code_blocks:
        for raw_line in body.splitlines():
            line = raw_line.lower().strip()
            if not line or line.startswith("#"):
                continue
            if any(install in line for install in _INSTALL_COMMANDS):
                continue  # that line is the install step, not usage
            for command in _USAGE_COMMANDS:
                if command in line:
                    usage_command = command.strip()
                    break
            if usage_command:
                break
        if usage_command:
            break
    has_usage = bool(usage_heading or usage_command)
    if usage_command:
        evidence.append(f"usage: example shows `{usage_command}`")
    elif usage_heading:
        evidence.append(f"usage: heading \"{usage_heading}\"")

    # ── License: a file, a heading, or a named license in the text
    license_heading = heading_has(_LICENSE_WORDS)
    license_named = re.search(
        r"\b(mit|apache 2\.0|apache-2\.0|gpl-?3|gplv3|bsd-?3|mpl-?2|isc|unlicense)\b.{0,20}licen[cs]e"
        r"|licen[cs]ed under",
        content, re.IGNORECASE,
    )
    has_license = bool(has_license_file or license_heading or license_named)
    if has_license_file:
        evidence.append("license: LICENSE file in the repo")
    elif license_heading:
        evidence.append("license: section in the README")
    elif license_named:
        evidence.append("license: named in the text")

    has_code_examples = len(code_blocks) > 0
    has_screenshots = len(doc["screenshots"]) > 0

    # ── Score: the essentials, then credit for showing rather than telling
    score = 10  # a README exists
    if has_desc:
        score += 20
    if has_install:
        score += 20
    if has_usage:
        score += 20
    if has_license:
        score += 15
    if has_code_examples:
        score += 8
        evidence.append(f"{len(code_blocks)} code example(s)")
    if has_screenshots:
        score += 4
        evidence.append("includes a screenshot or diagram")
    if doc["word_count"] >= 150:
        score += 3
        evidence.append(f"{doc['word_count']} words of prose")
    score = min(score, 100)

    missing = []
    if not has_desc:
        missing.append("description (a short paragraph under the title)")
    if not has_install:
        missing.append("installation steps or an install command")
    if not has_usage:
        missing.append("usage example")
    if not has_license:
        missing.append("license section or LICENSE file")
    if not has_code_examples:
        missing.append("a code example")

    badge_text = " ".join(doc["badges"]).lower()
    badge_suggestions = []
    if not has_license:
        badge_suggestions.append("license")
    if not any(word in badge_text for word in ("workflow", "build", "ci", "actions")):
        badge_suggestions.append("build-status")
    if not any(word in badge_text for word in ("version", "npm", "pypi", "crates")):
        badge_suggestions.append("version")

    return ReadmeScore(
        score=score,
        has_readme=True,
        has_description=has_desc,
        has_installation=has_install,
        has_usage=has_usage,
        has_license=has_license,
        has_code_examples=has_code_examples,
        has_screenshots=has_screenshots,
        word_count=doc["word_count"],
        code_block_count=len(code_blocks),
        evidence=evidence,
        missing_sections=missing,
        badge_suggestions=badge_suggestions,
    )


def readme_description(repo_path: str, limit: int = 200) -> Optional[str]:
    """First real paragraph of the README, used when no GitHub description exists."""
    try:
        for fname in os.listdir(repo_path):
            if fname.lower() in _README_NAMES:
                text = (Path(repo_path) / fname).read_text(encoding="utf-8", errors="ignore")
                break
        else:
            return None
    except OSError:
        return None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("[![") or stripped.startswith(">"):
            continue
        return _plain_text(stripped)[:limit]
    return None


def _plain_text(markdown: str) -> str:
    """Drop the markup a description picks up from a README: emphasis, code ticks, links."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", markdown)  # [label](url) -> label
    text = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", text)  # **bold** / _italic_
    text = text.replace("`", "")
    return text.strip()


# Generated or vendored files: real bytes, but nobody feeds them to a model as context
_GENERATED_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "pipfile.lock",
    "cargo.lock", "composer.lock", "gemfile.lock", "go.sum", "npm-shrinkwrap.json",
}
_GENERATED_SUFFIXES = (".min.js", ".min.css", ".map", ".lock", ".snap", ".bundle.js")

# Rough characters per token for source code. Real tokenizers land near this for
# mixed code and prose; the figure is shown as an approximation, never as exact.
CHARS_PER_TOKEN = 3.7

# Extensions considered source/text — only these count toward token estimation
_SOURCE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".html", ".css", ".scss", ".sass", ".less",
    ".json", ".yaml", ".yml", ".toml", ".ini", ".env",
    ".md", ".mdx", ".txt", ".rst",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".java", ".go", ".rs", ".rb", ".php", ".swift", ".kt",
    ".sh", ".bash", ".zsh", ".ps1", ".bat",
    ".sql", ".graphql", ".proto",
    ".xml", ".svg",
}

def _extract_commits(
    repo: git.Repo,
    repo_id: str,
    limit: int = COMMIT_HISTORY_LIMIT,
    known_shas: Optional[set[str]] = None,
    stats_budget: int = STATS_BUDGET_PER_SCAN,
    hotspot_counts: Optional[dict[str, int]] = None,
    hotspot_window: int = HOTSPOT_WINDOW,
) -> list[CommitRecord]:
    """Read commit history. Diff stats are computed only for commits not already stored,
    up to ``stats_budget`` per call; stored rows keep their stats (inserts ignore duplicates)."""
    known = known_shas or set()
    records: list[CommitRecord] = []
    try:
        for index, commit in enumerate(repo.iter_commits(max_count=limit)):
            files_changed = insertions = deletions = 0
            # Always diff the newest commits so hotspots stay current; older ones only when new
            in_hotspot_window = hotspot_counts is not None and index < hotspot_window
            if in_hotspot_window or (commit.hexsha not in known and stats_budget > 0):
                stats = commit.stats
                files_changed = len(stats.files)
                insertions = stats.total.get("insertions", 0)
                deletions = stats.total.get("deletions", 0)
                if in_hotspot_window:
                    for path in stats.files:
                        hotspot_counts[path] = hotspot_counts.get(path, 0) + 1
                if commit.hexsha not in known and stats_budget > 0:
                    stats_budget -= 1
            records.append(
                CommitRecord(
                    sha=commit.hexsha,
                    message=commit.message.strip()[:200],
                    author=str(commit.author),
                    committed_at=_utc_from_timestamp(commit.committed_date),
                    files_changed=files_changed,
                    insertions=insertions,
                    deletions=deletions,
                    repo_id=repo_id,
                )
            )
    except Exception as exc:
        if "does not exist" in str(exc) or "Reference at" in str(exc):
            logger.debug("Repo %s has no commits yet.", repo_id)
        else:
            logger.warning("Could not extract commits: %s", exc)
    return records


def _submodule_paths(repo_path: str) -> set[str]:
    """Absolute paths of submodules declared in .gitmodules, which belong to the parent repo."""
    config_path = os.path.join(repo_path, ".gitmodules")
    if not os.path.exists(config_path):
        return set()
    paths = set()
    try:
        for line in Path(config_path).read_text(encoding="utf-8", errors="ignore").splitlines():
            stripped = line.strip()
            if stripped.startswith("path"):
                _, _, value = stripped.partition("=")
                paths.add(os.path.normpath(os.path.join(repo_path, value.strip())))
    except OSError:
        pass
    return paths


def scan_folder(
    folder_path: str,
    stale_threshold_days: int = 30,
    dead_threshold_days: int = 90,
    known_shas_by_repo: Optional[dict[str, set[str]]] = None,
    allow_fetch: bool = False,
    fetch_interval_s: float = 3600,
    deployed_ids: Optional[set[str]] = None,
) -> list[tuple[RepoRecord, list[CommitRecord]]]:
    """
    Recursively walk folder_path, find all git repos.
    Returns list of (RepoRecord, commits).
    """
    results: list[tuple[RepoRecord, list[CommitRecord]]] = []
    folder = Path(folder_path)

    if not folder.exists():
        logger.warning("Watched folder does not exist: %s", folder_path)
        return results

    # Walk the whole tree looking for .git directories (no depth limit). A repo nested
    # inside another repo is its own project and is scanned too; submodules are not,
    # because they already belong to their parent.
    skip_nested: set[str] = set()
    for root, dirs, _ in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "__pycache__", ".next", ".venv", "venv"}]
        if os.path.normpath(root) in skip_nested:
            dirs[:] = []
            continue
        if ".git" in dirs:
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]  # keep looking for nested repos
            skip_nested |= _submodule_paths(root)
            result = _scan_repo(
                root,
                stale_threshold_days,
                dead_threshold_days,
                known_shas=(known_shas_by_repo or {}).get(_repo_id(root)),
                allow_fetch=allow_fetch,
                fetch_interval_s=fetch_interval_s,
                deployed=_repo_id(root) in (deployed_ids or set()),
            )
            if result:
                results.append(result)

    return results


def _scan_repo(
    repo_path: str,
    stale_threshold_days: int,
    dead_threshold_days: int,
    known_shas: Optional[set[str]] = None,
    allow_fetch: bool = False,
    fetch_interval_s: float = 3600,
    deployed: bool = False,
) -> Optional[tuple[RepoRecord, list[CommitRecord]]]:
    """Scan a single git repository."""
    repo_id = _repo_id(repo_path)
    name = Path(repo_path).name

    try:
        repo = git.Repo(repo_path)
    except (InvalidGitRepositoryError, NoSuchPathError) as exc:
        logger.warning("Broken repo at %s: %s", repo_path, exc)
        # Return a broken repo record
        broken = RepoRecord(
            id=repo_id,
            name=name,
            local_path=repo_path,
            source_type="local_only",
            latest_source="local_filesystem",
            tags=["broken"],  # truly broken = git repo unreadable
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        return (broken, [])

    try:
        # Branch detection (handles detached HEAD)
        try:
            current_branch = repo.active_branch.name
        except TypeError:
            # Detached HEAD
            current_branch = f"detached:{repo.head.commit.hexsha[:7]}"

        default_branch = _get_default_branch(repo)

        # Sync status against the branch's upstream (fetches only when allowed and due)
        uncommitted_changes = _count_uncommitted(repo)
        local_ahead, remote_ahead, is_diverged, upstream, remote_head_at = _get_sync_status(
            repo, current_branch, repo_path=repo_path, allow_fetch=allow_fetch, fetch_interval_s=fetch_interval_s,
        )

        # Remote URL: the upstream's remote when there is one, else the first remote
        remote_url: Optional[str] = None
        if repo.remotes:
            try:
                remote_name = upstream.split("/", 1)[0] if upstream else repo.remotes[0].name
                remote_url = repo.remote(remote_name).url
            except Exception:
                pass

        source_type: str = "local_only" if not remote_url else "hybrid"

        # Timestamps
        last_local_commit_at: Optional[str] = None
        try:
            if not repo.head.is_detached or repo.head.commit:
                ts = _utc_from_timestamp(repo.head.commit.committed_date)
                last_local_commit_at = ts.isoformat()
        except Exception:
            pass

        file_mtime, file_intel = _walk_repo(repo_path)

        sync = SyncStatus(
            local_ahead_by=local_ahead,
            remote_ahead_by=remote_ahead,
            is_diverged=is_diverged,
            uncommitted_changes=uncommitted_changes,
            upstream=upstream,
        )

        # Hybrid Source Resolver: working tree, local HEAD, and the upstream's head
        # as of the last fetch (no network needed to read it)
        latest_source, latest_ts = resolve_latest_source(
            file_mtime,
            datetime.fromisoformat(last_local_commit_at) if last_local_commit_at else None,
            remote_head_at,
        )

        # Stale branches
        stale_branches = _count_stale_branches(repo, stale_threshold_days)

        # README
        readme = _analyze_readme(repo_path)

        # Commits
        hotspot_counts: dict[str, int] = {}
        commits = _extract_commits(repo, repo_id, known_shas=known_shas, hotspot_counts=hotspot_counts)
        if hotspot_counts:
            newest = {c.sha: c.committed_at for c in commits}
            last_commit_at = max(newest.values()) if newest else datetime.now(timezone.utc)
            file_intel.hotspots = [
                HotspotFile(path=path, change_count=count, last_modified=last_commit_at)
                for path, count in sorted(hotspot_counts.items(), key=lambda kv: -kv[1])[:10]
            ]

        # Health scoring
        health = compute_health(
            latest_activity_iso=latest_ts.isoformat() if latest_ts else None,
            uncommitted_changes=uncommitted_changes,
            has_readme=readme.has_readme,
            stale_branch_count=stale_branches,
            deployed=deployed,
        )

        # Staleness
        staleness = compute_staleness(
            latest_activity_iso=latest_ts.isoformat() if latest_ts else None,
            stale_threshold_days=stale_threshold_days,
            dead_threshold_days=dead_threshold_days,
            deployed=deployed,
        )

        # Momentum (needs commit history split)
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        last_4w = sum(
            1 for c in commits
            if (now - c.committed_at.replace(tzinfo=timezone.utc if c.committed_at.tzinfo is None else c.committed_at.tzinfo)).days <= 28
        )
        prev_4w = sum(
            1 for c in commits
            if 28 < (now - c.committed_at.replace(tzinfo=timezone.utc if c.committed_at.tzinfo is None else c.committed_at.tzinfo)).days <= 56
        )
        momentum = compute_momentum(last_4w, prev_4w, deployed=deployed)

        # Tags
        # broken = technically invalid git state (detached HEAD, broken remotes)
        # NOT a low health score — a deployed stale repo is stale, not broken
        tags: list[str] = []
        if deployed:
            tags.append("deployed")
        if source_type == "local_only":
            tags.append("local_only")
        if staleness.risk in ("high", "critical"):
            tags.append("stale")
        if local_ahead > 0:
            tags.append("unpushed")
        if current_branch.startswith("detached:"):
            tags.append("broken")
        # "active" means recently worked on; a deployed repo is stable, not active
        if not deployed and staleness.risk in ("low", "moderate"):
            tags.append("active")

        record = RepoRecord(
            id=repo_id,
            name=name,
            description=readme_description(repo_path),
            local_path=repo_path,
            remote_url=remote_url,
            source_type=source_type,
            latest_source=latest_source,
            current_branch=current_branch,
            default_branch=default_branch,
            last_local_commit_at=last_local_commit_at,
            last_remote_push_at=remote_head_at.isoformat() if remote_head_at else None,
            last_file_modified_at=file_mtime.isoformat() if file_mtime else None,
            latest_activity_at=latest_ts.isoformat() if latest_ts else None,
            sync=sync,
            health=health,
            momentum=momentum,
            staleness=staleness,
            readme=readme,
            file_intelligence=file_intel,
            tags=tags,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        return (record, commits)

    except Exception as exc:
        logger.exception("Unexpected error scanning %s: %s", repo_path, exc)
        return None


def _count_uncommitted(repo: git.Repo) -> int:
    try:
        return len(repo.index.diff(None)) + len(repo.untracked_files)
    except Exception:
        return 0


def _upstream_ref(repo: git.Repo, branch: str):
    """The branch's configured upstream, else a same-named branch on any remote, else None."""
    if branch.startswith("detached:") or not repo.remotes:
        return None
    try:
        tracking = repo.active_branch.tracking_branch()
        if tracking is not None and tracking.is_valid():
            return tracking
    except (TypeError, ValueError):
        pass
    for remote in repo.remotes:
        for ref in remote.refs:
            if ref.remote_head == branch:
                return ref
    return None


def _maybe_fetch(repo: git.Repo, repo_path: str, branch: str, fetch_interval_s: float) -> None:
    """Fetch the upstream's remote at most once per interval. Failures are ignored (offline)."""
    now = time.monotonic()
    if now - _last_fetch.get(repo_path, float("-inf")) < fetch_interval_s:
        return
    _last_fetch[repo_path] = now
    try:
        tracking = repo.active_branch.tracking_branch()
        remote = repo.remote(tracking.remote_name) if tracking is not None else repo.remotes[0]
        remote.fetch(kill_after_timeout=10)
    except Exception:
        pass


def _get_sync_status(
    repo: git.Repo,
    branch: str,
    repo_path: str = "",
    allow_fetch: bool = False,
    fetch_interval_s: float = 3600,
) -> tuple[int, int, bool, Optional[str], Optional[datetime]]:
    """Returns (local_ahead, remote_ahead, is_diverged, upstream_name, upstream_head_time)."""
    if not repo.remotes or branch.startswith("detached:"):
        return (0, 0, False, None, None)
    if allow_fetch:
        _maybe_fetch(repo, repo_path, branch, fetch_interval_s)
    upstream = _upstream_ref(repo, branch)
    if upstream is None:
        return (0, 0, False, None, None)
    try:
        local_ahead = len(list(repo.iter_commits(f"{upstream.name}..HEAD", max_count=50)))
        remote_ahead = len(list(repo.iter_commits(f"HEAD..{upstream.name}", max_count=50)))
        head_at = _utc_from_timestamp(upstream.commit.committed_date)
        return (local_ahead, remote_ahead, local_ahead > 0 and remote_ahead > 0, upstream.name, head_at)
    except (GitCommandError, ValueError):
        return (0, 0, False, upstream.name, None)


def _get_default_branch(repo: git.Repo) -> str:
    for name in ("main", "master", "develop", "dev"):
        if name in [b.name for b in repo.branches]:
            return name
    return "main"


def _count_stale_branches(repo: git.Repo, threshold_days: int) -> int:
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=threshold_days)
    count = 0
    try:
        for branch in repo.branches:
            if branch == repo.active_branch:
                continue
            try:
                ts = _utc_from_timestamp(branch.commit.committed_date)
                if ts < cutoff:
                    count += 1
            except Exception:
                continue
    except Exception:
        pass
    return count

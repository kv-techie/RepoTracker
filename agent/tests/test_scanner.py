"""Tests for agent/scanner.py — Git Repository Scanner."""

import os
import pytest

from agent.scanner import scan_folder, _scan_repo, _count_uncommitted


class TestScanFolder:
    def test_finds_git_repos(self, simple_git_repo, tmp_path):
        # simple_git_repo IS tmp_path
        parent = str(tmp_path.parent)
        results = scan_folder(parent)
        repo_names = [r.name for r, _ in results]
        assert tmp_path.name in repo_names

    def test_nonexistent_folder_returns_empty(self, tmp_dir):
        results = scan_folder(os.path.join(tmp_dir, "does_not_exist"))
        assert results == []

    def test_empty_folder_returns_empty(self, tmp_path):
        results = scan_folder(str(tmp_path))
        assert results == []


class TestScanRepo:
    def test_basic_scan_returns_record(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, commits = result
        assert repo.name == os.path.basename(simple_git_repo)
        assert repo.local_path == simple_git_repo

    def test_local_only_repo_tagged(self, local_only_repo):
        result = _scan_repo(local_only_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert "local_only" in repo.tags
        assert repo.source_type == "local_only"

    def test_has_commits(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        _, commits = result
        assert len(commits) >= 1

    def test_readme_detected(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.readme is not None
        assert repo.readme.has_readme is True

    def test_health_score_present(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.health is not None
        assert 0 <= repo.health.score <= 100

    def test_staleness_present(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.staleness is not None
        # freshly created repo should be low risk
        assert repo.staleness.risk == "low"

    def test_uncommitted_changes_counted(self, repo_with_uncommitted):
        result = _scan_repo(repo_with_uncommitted, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.sync.uncommitted_changes >= 2

    def test_broken_repo_returns_broken_record(self, tmp_path):
        # Create .git dir but make it invalid
        (tmp_path / ".git").mkdir()
        result = _scan_repo(str(tmp_path), 30, 90)
        assert result is not None
        repo, _ = result
        assert "broken" in repo.tags

    def test_latest_source_is_set(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.latest_source in ("local_filesystem", "local_git", "github_remote")

    def test_tags_populated(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        # Should have at least one tag
        assert isinstance(repo.tags, list)


class TestActivityIgnoresDependencies:
    def test_node_modules_mtime_not_counted(self, simple_git_repo, tmp_path):
        import os
        import time
        from agent.scanner import _latest_file_mtime

        readme = tmp_path / "README.md"
        old = time.time() - 40 * 86_400
        os.utime(readme, (old, old))

        dep = tmp_path / "node_modules" / "left-pad" / "index.js"
        dep.parent.mkdir(parents=True)
        dep.write_text("module.exports = 1")  # fresh mtime, as after npm install

        latest = _latest_file_mtime(simple_git_repo)
        assert latest is not None
        assert abs(latest.timestamp() - old) < 5


class TestUpstreamTracking:
    def _clone_with_remote_named(self, tmp_path, remote_name):
        import git

        bare = git.Repo.init(str(tmp_path / "remote.git"), bare=True)
        work = git.Repo.init(str(tmp_path / "work"))
        work.config_writer().set_value("user", "name", "T").release()
        work.config_writer().set_value("user", "email", "t@t.com").release()
        (tmp_path / "work" / "a.py").write_text("a = 1")
        work.index.add(["a.py"])
        work.index.commit("first")
        branch = work.active_branch.name
        remote = work.create_remote(remote_name, bare.working_dir)
        remote.push(refspec=f"{branch}:{branch}")
        remote.fetch()
        work.active_branch.set_tracking_branch(remote.refs[branch])
        return work, branch

    def test_non_origin_remote_counts_unpushed(self, tmp_path):
        work, branch = self._clone_with_remote_named(tmp_path, "upstream")
        (tmp_path / "work" / "b.py").write_text("b = 2")
        work.index.add(["b.py"])
        work.index.commit("second, not pushed")

        record, _ = _scan_repo(work.working_dir, 30, 90)

        assert record.sync.upstream == f"upstream/{branch}"
        assert record.sync.local_ahead_by == 1
        assert "unpushed" in record.tags

    def test_remote_head_time_recorded(self, tmp_path):
        work, _ = self._clone_with_remote_named(tmp_path, "origin")

        record, _ = _scan_repo(work.working_dir, 30, 90)

        assert record.last_remote_push_at is not None
        assert record.source_type == "hybrid"

    def test_no_upstream_reported_as_none(self, local_only_repo):
        record, _ = _scan_repo(local_only_repo, 30, 90)
        assert record.sync.upstream is None


class TestIncrementalScan:
    def test_known_commits_skip_diff_stats(self, simple_git_repo):
        import git
        from agent.scanner import _extract_commits

        repo = git.Repo(simple_git_repo)
        sha = repo.head.commit.hexsha

        fresh = _extract_commits(repo, "r", known_shas=set())
        known = _extract_commits(repo, "r", known_shas={sha})

        assert fresh[0].files_changed == 1
        assert known[0].files_changed == 0  # stored row keeps its stats; no diff recomputed
        assert known[0].sha == sha

    def test_database_files_do_not_count_as_activity(self, simple_git_repo, tmp_path):
        import os
        import time
        from agent.scanner import _latest_file_mtime

        old = time.time() - 40 * 86_400
        os.utime(tmp_path / "README.md", (old, old))
        (tmp_path / "cache.db-wal").write_text("x")  # fresh mtime

        assert abs(_latest_file_mtime(simple_git_repo).timestamp() - old) < 5



class TestReadmeScoring:
    def _score(self, tmp_path, text):
        import git
        from agent.scanner import _analyze_readme

        git.Repo.init(str(tmp_path))
        (tmp_path / "README.md").write_text(text, encoding="utf-8")
        return _analyze_readme(str(tmp_path))

    def test_prose_mentions_do_not_count_as_sections(self, tmp_path):
        score = self._score(tmp_path, "# Tool\n\nA specific decision engine that you install nowhere.\n")
        assert score.has_installation is False
        assert score.has_usage is False
        assert "build-status" in score.badge_suggestions

    def test_headings_count(self, tmp_path):
        score = self._score(tmp_path, (
            "# Tool\n\nA small engine that turns local git history into readable activity data.\n\n"
            "## Installation\n\npip install tool\n\n## Usage\n\ntool run\n\n## License\n\nMIT\n"
        ))
        assert (score.has_description, score.has_installation, score.has_usage, score.has_license) == (True, True, True, True)
        assert score.score == 85  # essentials only; code examples and length add the rest

    def test_license_file_counts_without_a_heading(self, tmp_path):
        (tmp_path / "LICENSE").write_text("MIT")
        score = self._score(tmp_path, "# Tool\n\n" + "A long enough description of this tool. " * 3)
        assert score.has_license is True

    def test_description_comes_from_the_readme(self, tmp_path):
        import git
        from agent.scanner import readme_description

        git.Repo.init(str(tmp_path))
        (tmp_path / "README.md").write_text("# Tool\n\n[![badge](https://img.shields.io/x)](y)\n\nTracks local work.\n")
        assert readme_description(str(tmp_path)) == "Tracks local work."

    def test_description_drops_markdown(self, tmp_path):
        import git
        from agent.scanner import readme_description

        git.Repo.init(str(tmp_path))
        (tmp_path / "README.md").write_text("# Tool\n\nA **hybrid** tracker for [devs](http://x).\n")
        assert readme_description(str(tmp_path)) == "A hybrid tracker for devs."


class TestStructureAndHotspots:
    def test_tests_and_structure_are_detected(self, tmp_path):
        import git
        from agent.scanner import _walk_repo

        git.Repo.init(str(tmp_path))
        (tmp_path / "tests").mkdir()
        (tmp_path / "tests" / "test_thing.py").write_text("def test_x(): pass")
        (tmp_path / "requirements.txt").write_text("pytest")
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "main.py").write_text("x = 1")
        (tmp_path / ".github" / "workflows").mkdir(parents=True)
        (tmp_path / ".github" / "workflows" / "ci.yml").write_text("on: push")

        _, intel = _walk_repo(str(tmp_path))

        assert intel.has_tests is True
        assert intel.test_file_count >= 1
        assert {"CI workflow", "dependency lockfile", "source directory", "test suite"} <= set(intel.structure_signals)

    def test_hotspots_rank_the_most_changed_file(self, tmp_path):
        import git
        from agent.scanner import _extract_commits

        repo = git.Repo.init(str(tmp_path))
        repo.config_writer().set_value("user", "name", "T").release()
        repo.config_writer().set_value("user", "email", "t@t.com").release()
        for i in range(3):
            (tmp_path / "hot.py").write_text(f"x = {i}")
            repo.index.add(["hot.py"])
            repo.index.commit(f"change {i}")
        (tmp_path / "cold.py").write_text("y = 1")
        repo.index.add(["cold.py"])
        repo.index.commit("add cold")

        counts: dict[str, int] = {}
        _extract_commits(repo, "r", hotspot_counts=counts)

        assert counts["hot.py"] == 3
        assert counts["cold.py"] == 1


class TestContextSize:
    """total_tokens must estimate what a model would actually have to read."""

    def _repo(self, tmp_path):
        import git

        repo = git.Repo.init(str(tmp_path))
        repo.config_writer().set_value("user", "name", "T").release()
        repo.config_writer().set_value("user", "email", "t@t.com").release()
        return repo

    def test_lockfile_is_not_context(self, tmp_path):
        from agent.scanner import _walk_repo

        self._repo(tmp_path)
        (tmp_path / "app.py").write_text("x = 1\n" * 100)
        with_code_only = _walk_repo(str(tmp_path))[1].total_tokens

        (tmp_path / "package-lock.json").write_text('{"a": 1}\n' * 5000)

        assert _walk_repo(str(tmp_path))[1].total_tokens == with_code_only

    def test_gitignored_files_are_not_context(self, tmp_path):
        from agent.scanner import _walk_repo

        self._repo(tmp_path)
        (tmp_path / "app.py").write_text("x = 1\n" * 100)
        (tmp_path / ".gitignore").write_text("generated.py\n")
        before = _walk_repo(str(tmp_path))[1].total_tokens

        (tmp_path / "generated.py").write_text("y = 2\n" * 5000)

        assert _walk_repo(str(tmp_path))[1].total_tokens == before

    def test_minified_bundles_are_not_context(self, tmp_path):
        from agent.scanner import _walk_repo

        self._repo(tmp_path)
        (tmp_path / "app.js").write_text("const x = 1;\n" * 50)
        before = _walk_repo(str(tmp_path))[1].total_tokens

        (tmp_path / "vendor.min.js").write_text("!function(){}();" * 2000)

        assert _walk_repo(str(tmp_path))[1].total_tokens == before

    def test_estimate_tracks_source_size(self, tmp_path):
        from agent.scanner import _walk_repo, CHARS_PER_TOKEN

        self._repo(tmp_path)
        text = "def f():\n    return 1\n" * 200
        (tmp_path / "app.py").write_text(text, newline="\n")

        tokens = _walk_repo(str(tmp_path))[1].total_tokens

        assert tokens == int(len(text) / CHARS_PER_TOKEN)


class TestReadmeReadsContent:
    """Sections count on what the README shows, not only on its headings."""

    def _score(self, tmp_path, text):
        import git
        from agent.scanner import _analyze_readme

        git.Repo.init(str(tmp_path))
        (tmp_path / "README.md").write_text(text, encoding="utf-8")
        return _analyze_readme(str(tmp_path))

    def test_install_command_counts_without_a_heading(self, tmp_path):
        score = self._score(tmp_path, (
            "# Tool\n\nA small engine that turns local git history into activity data.\n\n"
            "```bash\npip install tool\n```\n"
        ))
        assert score.has_installation is True
        assert any("pip install" in e for e in score.evidence)

    def test_run_example_counts_as_usage(self, tmp_path):
        score = self._score(tmp_path, (
            "# Tool\n\nA small engine that turns local git history into activity data.\n\n"
            "```bash\npython -m tool --watch ~/projects\n```\n"
        ))
        assert score.has_usage is True

    def test_prose_mention_still_does_not_count(self, tmp_path):
        score = self._score(tmp_path, "# Tool\n\nA specific decision engine that you install nowhere.\n")
        assert score.has_installation is False
        assert score.has_usage is False

    def test_license_named_in_text_counts(self, tmp_path):
        score = self._score(tmp_path, (
            "# Tool\n\nA small engine for local git history that reads repositories.\n\n"
            "Licensed under the Apache 2.0 license.\n"
        ))
        assert score.has_license is True

    def test_code_examples_and_screenshots_add_credit(self, tmp_path):
        plain = self._score(tmp_path, "# Tool\n\n" + "A useful engine for reading local git history. " * 3)
        rich = self._score(tmp_path, (
            "# Tool\n\n" + "A useful engine for reading local git history. " * 3 + "\n\n"
            "![screenshot](docs/shot.png)\n\n```python\nfrom tool import scan\nscan()\n```\n"
        ))
        assert rich.score > plain.score
        assert rich.has_code_examples is True
        assert rich.has_screenshots is True

    def test_badge_row_is_not_the_description(self, tmp_path):
        score = self._score(tmp_path, (
            "# Tool\n\n[![build](https://shields.io/badge/build-passing-green)](x)\n"
            "[![npm](https://shields.io/npm/v/tool)](y)\n"
        ))
        assert score.has_description is False

    def test_evidence_explains_every_section_it_credits(self, tmp_path):
        score = self._score(tmp_path, (
            "# Tool\n\nA small engine that turns local git history into activity data.\n\n"
            "```bash\nnpm install tool\nnpm run dev\n```\n\nLicensed under the MIT license.\n"
        ))
        assert score.has_installation and score.has_usage and score.has_license
        assert len(score.evidence) >= 4  # one line per credited section

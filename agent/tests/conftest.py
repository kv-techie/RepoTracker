"""Shared pytest fixtures for agent tests."""

import os
import asyncio
import tempfile
import pytest
import pytest_asyncio
import git


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def tmp_dir(tmp_path):
    """Temporary directory for each test."""
    return str(tmp_path)


@pytest.fixture
def simple_git_repo(tmp_path):
    """Creates a minimal git repo with one commit."""
    repo = git.Repo.init(str(tmp_path))
    repo.config_writer().set_value("user", "name", "Test User").release()
    repo.config_writer().set_value("user", "email", "test@example.com").release()

    # Create a file and commit
    readme = tmp_path / "README.md"
    readme.write_text("# Test Repo\n\nA test repository.\n\n## Installation\n\npip install test\n\n## Usage\n\nrun test\n\n## License\n\nMIT")
    repo.index.add(["README.md"])
    repo.index.commit("feat: initial commit")
    return str(tmp_path)


@pytest.fixture
def empty_git_repo(tmp_path):
    """Git repo with no commits."""
    git.Repo.init(str(tmp_path))
    return str(tmp_path)


@pytest.fixture
def repo_with_uncommitted(simple_git_repo, tmp_path):
    """Repo with uncommitted changes."""
    (tmp_path / "dirty.py").write_text("print('uncommitted')")
    (tmp_path / "dirty2.py").write_text("print('also uncommitted')")
    return simple_git_repo


@pytest.fixture
def local_only_repo(tmp_path):
    """Repo with no remote."""
    repo = git.Repo.init(str(tmp_path))
    repo.config_writer().set_value("user", "name", "Test").release()
    repo.config_writer().set_value("user", "email", "t@t.com").release()
    f = tmp_path / "main.py"
    f.write_text("print('hello')")
    repo.index.add(["main.py"])
    repo.index.commit("init")
    return str(tmp_path)


@pytest_asyncio.fixture
async def tmp_db(tmp_path):
    """Temporary SQLite database."""
    from agent.db import init_db
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    return db_path

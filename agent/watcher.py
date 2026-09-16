"""Filesystem watcher using watchdog.

Monitors all watched folders for file changes and updates the nearest
git repo's metadata in SQLite in near-real-time.
"""

from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from agent.models import FileEvent
from agent.scanner import SKIP_DIRS, SKIP_SUFFIXES

logger = logging.getLogger(__name__)


def _find_git_root(path: str) -> str | None:
    """Walk up from path to find the nearest .git directory."""
    current = Path(path)
    for parent in [current, *current.parents]:
        try:
            if (parent / ".git").exists():
                return str(parent)
        except OSError:
            pass
    return None


def _repo_id_from_path(path: str) -> str:
    import hashlib
    return hashlib.md5(path.encode()).hexdigest()[:16]


class RepoChangeHandler(FileSystemEventHandler):
    """Handles watchdog events and forwards to the event queue."""

    def __init__(self, event_queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
        super().__init__()
        self._queue = event_queue
        self._loop = loop

    def _skip(self, src_path: str) -> bool:
        if src_path.lower().endswith(SKIP_SUFFIXES):
            return True
        return any(p in SKIP_DIRS for p in Path(src_path).parts)

    def _emit(self, event_type: str, src_path: str) -> None:
        if self._skip(src_path):
            return
        git_root = _find_git_root(src_path)
        if not git_root:
            return
        event = FileEvent(
            file_path=os.path.relpath(src_path, git_root),
            event_type=event_type,
            occurred_at=datetime.now(timezone.utc),
            repo_id=_repo_id_from_path(git_root),
            repo_root=git_root,
        )
        # Hand off to the event loop without blocking watchdog's thread
        self._loop.call_soon_threadsafe(self._offer, event)

    def _offer(self, event: FileEvent) -> None:
        """Enqueue, dropping the oldest event when full (e.g. during a large install)."""
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self._queue.put_nowait(event)

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("modified", event.src_path)

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("created", event.src_path)

    def on_deleted(self, event: FileSystemEvent):
        if not event.is_directory:
            self._emit("deleted", event.src_path)


class FileWatcher:
    """Manages watchdog Observer for multiple watched folders."""

    def __init__(self):
        self._observer = Observer()
        self._event_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._started = False

    def start(self, watched_folders: list[str], loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        handler = RepoChangeHandler(self._event_queue, loop)
        for folder in watched_folders:
            if os.path.exists(folder):
                self._observer.schedule(handler, folder, recursive=True)
                logger.info("Watching folder: %s", folder)
            else:
                logger.warning("Folder does not exist (skipped): %s", folder)
        self._observer.start()
        self._started = True

    def stop(self) -> None:
        if self._started:
            self._observer.stop()
            self._observer.join()
            self._started = False

    async def next_event(self) -> FileEvent:
        """Wait until an event arrives. The consumer sleeps instead of polling."""
        return await self._event_queue.get()

    async def get_event(self) -> FileEvent | None:
        """Non-blocking poll, kept for callers that must not block."""
        try:
            return self._event_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None

    def update_folders(self, watched_folders: list[str]) -> None:
        """Restart observer with new folder list."""
        self.stop()
        self._observer = Observer()
        if self._loop:
            self.start(watched_folders, self._loop)

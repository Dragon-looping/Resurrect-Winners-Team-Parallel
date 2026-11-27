"""Root conftest for services/api — forces SelectorEventLoop on Windows for pytest-asyncio."""

from __future__ import annotations

import asyncio
import sys


def pytest_configure(config):  # noqa: ANN001, ARG001
    """Switch to SelectorEventLoop on Windows to avoid ProactorEventLoop socket.socketpair hang."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

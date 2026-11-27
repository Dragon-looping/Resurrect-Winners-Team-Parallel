"""Root pytest configuration for SETUVYUHA API tests."""

import asyncio
import sys


def pytest_configure(config):  # noqa: ARG001
    """Use SelectorEventLoop on Windows to avoid Proactor socketpair issues."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

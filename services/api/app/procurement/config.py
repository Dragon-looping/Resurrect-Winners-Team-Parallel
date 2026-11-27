"""Environment-driven configuration for Procurement & Supplier Email integration."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class EmailIntegrationConfig:
    """SMTP configuration for sending human-confirmed supplier purchase order emails."""

    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from_email: str | None
    smtp_use_tls: bool

    @property
    def is_configured(self) -> bool:
        """Return True only when an SMTP host and sender address are configured."""
        return bool(self.smtp_host and self.smtp_from_email)

    @classmethod
    def from_env(cls) -> EmailIntegrationConfig:
        """Load SMTP settings from environment variables."""
        host = (os.getenv("SMTP_HOST") or "").strip() or None
        port_raw = (os.getenv("SMTP_PORT") or "587").strip()
        try:
            port = int(port_raw)
        except ValueError:
            port = 587
        username = (os.getenv("SMTP_USERNAME") or "").strip() or None
        password = (os.getenv("SMTP_PASSWORD") or "").strip() or None
        from_email = (os.getenv("SMTP_FROM_EMAIL") or "").strip() or None
        use_tls_raw = (os.getenv("SMTP_USE_TLS") or "true").strip().lower()
        use_tls = use_tls_raw in {"1", "true", "yes", "on"}
        return cls(
            smtp_host=host,
            smtp_port=port,
            smtp_username=username,
            smtp_password=password,
            smtp_from_email=from_email,
            smtp_use_tls=use_tls,
        )


def get_email_config() -> EmailIntegrationConfig:
    """Return current environment-based email integration configuration."""
    return EmailIntegrationConfig.from_env()

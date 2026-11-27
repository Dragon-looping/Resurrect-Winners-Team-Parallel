"""Authentication, password hashing, token verification, and warehouse scoping."""

from app.auth.audit import record_warehouse_audit
from app.auth.dependencies import (
    assert_plant_access,
    get_current_warehouse_user,
    get_scoped_warehouse_user,
)
from app.auth.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

__all__ = [
    "TokenError",
    "assert_plant_access",
    "create_access_token",
    "decode_access_token",
    "get_current_warehouse_user",
    "get_scoped_warehouse_user",
    "hash_password",
    "record_warehouse_audit",
    "verify_password",
]

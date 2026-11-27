"""FastAPI authentication and server-side warehouse isolation dependencies."""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.security import TokenError, decode_access_token
from app.core.database import get_db
from app.models import WarehouseUser


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected Bearer token.",
        )
    return parts[1].strip()


def _resolve_user_from_token(token: str, db: Session) -> WarehouseUser:
    try:
        claims = decode_access_token(token)
        user_id = int(claims["sub"])
    except (TokenError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc

    user = (
        db.execute(
            select(WarehouseUser)
            .options(joinedload(WarehouseUser.plant))
            .where(WarehouseUser.id == user_id)
        )
        .scalar_one_or_none()
    )
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Warehouse account is inactive or no longer exists.",
        )
    return user


def get_current_warehouse_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> WarehouseUser:
    """Require an authenticated, active warehouse user."""
    token = _extract_bearer_token(authorization)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return _resolve_user_from_token(token, db)


def get_scoped_warehouse_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> WarehouseUser | None:
    """Enforce warehouse authentication whenever warehouse accounts exist or a token is sent."""
    token = _extract_bearer_token(authorization)
    if token is not None:
        return _resolve_user_from_token(token, db)

    has_users = db.execute(select(WarehouseUser.id).limit(1)).scalar_one_or_none()
    if has_users is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for warehouse operations.",
        )
    return None


def assert_plant_access(
    user: WarehouseUser | None,
    requested_plant_id: int | None,
) -> int | None:
    """Enforce server-side plant isolation; never trust a client-supplied plant_id."""
    if user is None:
        return requested_plant_id
    if requested_plant_id is not None and requested_plant_id != user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-warehouse access denied. Operation is restricted to your assigned warehouse.",
        )
    return user.plant_id

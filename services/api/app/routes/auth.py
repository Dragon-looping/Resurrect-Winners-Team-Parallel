"""Authentication routes for warehouse operators."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth import (
    create_access_token,
    get_current_warehouse_user,
    record_warehouse_audit,
    verify_password,
)
from app.core.database import get_db
from app.models import WarehouseUser
from app.schemas.warehouse_auth import LoginRequest, LoginResponse, WarehouseUserProfile

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _to_profile(user: WarehouseUser) -> WarehouseUserProfile:
    return WarehouseUserProfile(
        id=user.id,
        login_id=user.login_id,
        display_name=user.display_name,
        role=user.role,
        plant_id=user.plant_id,
        plant_name=user.plant.name,
        plant_location=user.plant.location,
        is_active=user.is_active,
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Warehouse operator login",
    description="Authenticates a warehouse account and issues a warehouse-scoped bearer token.",
)
def login_warehouse_user(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Authenticate warehouse credentials and return a scoped bearer token."""
    raw_identifier = (payload.login_id or payload.email or "").strip().lower()
    if not raw_identifier:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="login_id is required.",
        )

    user = (
        db.execute(
            select(WarehouseUser)
            .options(joinedload(WarehouseUser.plant))
            .where(WarehouseUser.login_id == raw_identifier)
        )
        .scalar_one_or_none()
    )

    if user is None or not verify_password(payload.password, user.password_hash):
        record_warehouse_audit(
            db,
            actor_user_id=user.id if user else None,
            actor_login_id=raw_identifier,
            plant_id=user.plant_id if user else None,
            action="LOGIN_FAILED",
            target_type="warehouse_user",
            target_id=raw_identifier,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid warehouse login ID or password.",
        )

    if not user.is_active:
        record_warehouse_audit(
            db,
            actor_user_id=user.id,
            actor_login_id=user.login_id,
            plant_id=user.plant_id,
            action="LOGIN_INACTIVE_REJECTED",
            target_type="warehouse_user",
            target_id=str(user.id),
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Warehouse account is inactive.",
        )

    token = create_access_token(
        user_id=user.id,
        login_id=user.login_id,
        plant_id=user.plant_id,
        role=user.role.value,
    )
    record_warehouse_audit(
        db,
        actor_user_id=user.id,
        actor_login_id=user.login_id,
        plant_id=user.plant_id,
        action="LOGIN_SUCCESS",
        target_type="warehouse_user",
        target_id=str(user.id),
    )
    db.commit()

    return LoginResponse(access_token=token, user=_to_profile(user))


@router.get(
    "/me",
    response_model=WarehouseUserProfile,
    summary="Get authenticated warehouse user",
    description="Returns the authenticated operator profile and server-assigned warehouse.",
)
def get_me(
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
) -> WarehouseUserProfile:
    """Return current authenticated warehouse profile."""
    return _to_profile(current_user)

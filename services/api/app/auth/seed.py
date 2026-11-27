"""Idempotent seeding for the three canonical SETUVYUHA warehouse accounts."""

import os
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.inventory.demo import seed_demo_catalog
from app.models import Plant, WarehouseUser, WarehouseUserRole

CANONICAL_WAREHOUSE_ACCOUNTS: tuple[dict[str, str], ...] = (
    {
        "plant_name": "Mangaluru",
        "login_id": "wh-mangaluru",
        "display_name": "Mangaluru Warehouse Operator",
    },
    {
        "plant_name": "Udupi",
        "login_id": "wh-udupi",
        "display_name": "Udupi Warehouse Operator",
    },
    {
        "plant_name": "Manipal",
        "login_id": "wh-manipal",
        "display_name": "Manipal Warehouse Operator",
    },
)


def seed_warehouse_accounts(
    db: Session,
    *,
    default_password: str | None = None,
) -> dict[str, Any]:
    """Ensure the 3 canonical plants, SKUs, and independent warehouse users exist."""
    catalog = seed_demo_catalog(db)
    password_to_use = (
        default_password
        or os.getenv("SETUVYUHA_SEED_WAREHOUSE_PASSWORD")
        or "Setuvyuha@2026"
    )

    created_users: list[str] = []
    existing_users: list[str] = []

    for acct in CANONICAL_WAREHOUSE_ACCOUNTS:
        plant = db.execute(
            select(Plant).where(Plant.name == acct["plant_name"])
        ).scalar_one()
        user = db.execute(
            select(WarehouseUser).where(WarehouseUser.login_id == acct["login_id"])
        ).scalar_one_or_none()
        if user is None:
            user = WarehouseUser(
                login_id=acct["login_id"],
                password_hash=hash_password(password_to_use),
                display_name=acct["display_name"],
                plant_id=plant.id,
                role=WarehouseUserRole.WAREHOUSE_USER,
                is_active=True,
            )
            db.add(user)
            created_users.append(acct["login_id"])
        else:
            existing_users.append(acct["login_id"])

    db.commit()
    return {
        "plants": catalog["plants"],
        "skus": catalog["skus"],
        "created_users": created_users,
        "existing_users": existing_users,
    }


if __name__ == "__main__":
    from app.core.database import get_session_maker

    session = get_session_maker()()
    try:
        summary = seed_warehouse_accounts(session)
        print("Seeded warehouse accounts:", summary)
    finally:
        session.close()

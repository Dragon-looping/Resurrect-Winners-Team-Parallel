"""Deterministic demo fixtures for SETUVYUHA plants and SKUs (explicitly invoked only)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Plant, SKU

DEMO_PLANTS: tuple[tuple[str, str], ...] = (
    ("Mangaluru", "Mangaluru, Karnataka"),
    ("Udupi", "Udupi, Karnataka"),
    ("Manipal", "Manipal, Karnataka"),
)

DEMO_SKUS: tuple[tuple[str, str, str], ...] = (
    ("FAN-EL-001", "Electric fans", "units"),
    ("MTR-IND-001", "Motors", "units"),
    ("CWR-001", "Copper wire", "meters"),
)


def seed_demo_catalog(db: Session) -> dict[str, dict[str, int]]:
    """Idempotently seed canonical demo plants and SKUs into the provided session."""
    plant_ids: dict[str, int] = {}
    for name, location in DEMO_PLANTS:
        plant = db.execute(select(Plant).where(Plant.name == name)).scalar_one_or_none()
        if plant is None:
            plant = Plant(name=name, location=location)
            db.add(plant)
            db.flush()
        plant_ids[name] = plant.id

    sku_ids: dict[str, int] = {}
    for sku_code, name, unit in DEMO_SKUS:
        sku = db.execute(select(SKU).where(SKU.sku_code == sku_code)).scalar_one_or_none()
        if sku is None:
            sku = SKU(sku_code=sku_code, name=name, unit=unit)
            db.add(sku)
            db.flush()
        sku_ids[name] = sku.id

    db.commit()
    return {"plants": plant_ids, "skus": sku_ids}

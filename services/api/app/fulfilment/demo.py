"""Deterministic demo fixtures for SETUVYUHA order lifecycle across Mangaluru, Udupi, and Manipal."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.fulfilment.orders import create_order
from app.inventory.demo import seed_demo_catalog
from app.models import CustomerOrder
from app.schemas.order import OrderCreate


def seed_order_lifecycle_demo(db: Session) -> dict[str, object]:
    """Idempotently seed canonical plants, SKUs, and sample orders for Mangaluru, Udupi, and Manipal."""
    catalog = seed_demo_catalog(db)
    plants = catalog["plants"]
    skus = catalog["skus"]

    base_dt = datetime(2026, 12, 5, 10, 0, tzinfo=timezone.utc)
    sample_specs = [
        ("DEMO-MNG-001", "Bharath Electricals", plants["Mangaluru"], skus["Electric fans"], 30, base_dt),
        ("DEMO-UDP-001", "Karavali Traders", plants["Udupi"], skus["Motors"], 15, base_dt + timedelta(days=2)),
        ("DEMO-MNP-001", "Manipal Infra", plants["Manipal"], skus["Copper wire"], 200, base_dt + timedelta(days=4)),
    ]

    order_ids: dict[str, int] = {}
    for order_num, cust, plant_id, sku_id, qty, crd in sample_specs:
        existing = db.execute(
            select(CustomerOrder).where(CustomerOrder.order_number == order_num)
        ).scalar_one_or_none()
        if existing is None:
            created = create_order(
                db,
                OrderCreate(
                    order_number=order_num,
                    customer_name=cust,
                    plant_id=plant_id,
                    sku_id=sku_id,
                    quantity=qty,
                    requested_delivery_date=crd,
                ),
            )
            order_ids[order_num] = created.id
        else:
            order_ids[order_num] = existing.id

    return {"catalog": catalog, "orders": order_ids}

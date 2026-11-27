"""Shared fixtures for Procurement & Briefings tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.models import CustomerOrder, OrderStatus, Plant, SKU


OFFICER_HEADERS = {"X-Actor-Id": "ananya.rao", "X-Actor-Role": "PROCUREMENT_OFFICER"}
ADMIN_HEADERS = {"X-Actor-Id": "vikram.admin", "X-Actor-Role": "ADMINISTRATOR"}
WAREHOUSE_HEADERS = {"X-Actor-Id": "kiran.wh", "X-Actor-Role": "WAREHOUSE_MANAGER"}
AI_HEADERS = {"X-Actor-Id": "ai_system", "X-Actor-Role": "AI_SYSTEM"}
CUSTOMER_HEADERS = {"X-Actor-Id": "cust.demo", "X-Actor-Role": "CUSTOMER"}


@pytest.fixture()
def shortage_scenario(db_session: Session) -> dict[str, object]:
    """Seed a Plant, SKU, and urgent CustomerOrder with zero stock (confirmed shortage)."""
    plant = Plant(name="Udupi Central Godown", location="Udupi, Karnataka")
    sku = SKU(sku_code="FAN-IND-500", name="Industrial Exhaust Fan 500mm", unit="units")
    db_session.add_all([plant, sku])
    db_session.flush()

    now_utc = datetime.now(timezone.utc)
    order = CustomerOrder(
        order_number="ORD-PROC-TEST-01",
        customer_name="Manipal Tech Works",
        plant_id=plant.id,
        sku_id=sku.id,
        quantity=60,
        allocated_quantity=0,
        customer_request_date=now_utc + timedelta(hours=18),
        agreed_delivery_date=now_utc + timedelta(hours=18),
        status=OrderStatus.BACKLOGGED.value,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    return {
        "plant": plant,
        "sku": sku,
        "order": order,
        "shortage_ref": f"SHORTAGE-ORD-{order.id}",
    }

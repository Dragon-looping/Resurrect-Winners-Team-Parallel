"""Verified supplier catalog lookup and deterministic demo seeding."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SKU
from app.models.procurement import Supplier, SupplierCatalogItem


DEFAULT_SUPPLIERS: list[dict] = [
    {
        "supplier_code": "SUP-KARAVALI-01",
        "name": "Karavali Industrial Components Pvt Ltd",
        "contact_name": "Raghavendra Pai",
        "contact_email": "orders@karavali-industrial.example.com",
        "phone": "+91-824-2458100",
        "location": "Baikampady Industrial Area, Mangaluru",
        "lead_time_days": 2,
        "reliability_score": 0.97,
    },
    {
        "supplier_code": "SUP-COASTAL-02",
        "name": "Coastal Precision Engineering Co.",
        "contact_name": "Meenakshi Bhat",
        "contact_email": "dispatch@coastal-precision.example.com",
        "phone": "+91-820-2523400",
        "location": "Shivalli Industrial Estate, Udupi",
        "lead_time_days": 3,
        "reliability_score": 0.94,
    },
    {
        "supplier_code": "SUP-MALNAD-03",
        "name": "Malnad Electro-Mech Supplies",
        "contact_name": "Suresh Hegde",
        "contact_email": "procurement@malnad-electromech.example.com",
        "phone": "+91-8182-227900",
        "location": "Machenahalli Industrial Area, Shivamogga",
        "lead_time_days": 4,
        "reliability_score": 0.91,
    },
]


def ensure_verified_suppliers_for_sku(db: Session, sku_id: int) -> list[tuple[Supplier, SupplierCatalogItem]]:
    """Return verified supplier catalog entries for a SKU, seeding master catalog if empty."""
    rows = db.execute(
        select(Supplier, SupplierCatalogItem)
        .join(SupplierCatalogItem, SupplierCatalogItem.supplier_id == Supplier.id)
        .where(SupplierCatalogItem.sku_id == sku_id, Supplier.is_active.is_(True))
        .order_by(SupplierCatalogItem.is_preferred.desc(), Supplier.reliability_score.desc(), SupplierCatalogItem.unit_price_inr.asc())
    ).all()
    if rows:
        return [(r[0], r[1]) for r in rows]

    sku = db.execute(select(SKU).where(SKU.id == sku_id)).scalar_one_or_none()
    if sku is None:
        return []

    seeded_suppliers: list[Supplier] = []
    for entry in DEFAULT_SUPPLIERS:
        existing = db.execute(
            select(Supplier).where(Supplier.supplier_code == entry["supplier_code"])
        ).scalar_one_or_none()
        if existing is None:
            existing = Supplier(**entry)
            db.add(existing)
            db.flush()
        seeded_suppliers.append(existing)

    base_price = 1850.0 + (sku.id % 5) * 350.0
    for idx, sup in enumerate(seeded_suppliers):
        existing_cat = db.execute(
            select(SupplierCatalogItem).where(
                SupplierCatalogItem.supplier_id == sup.id,
                SupplierCatalogItem.sku_id == sku.id,
            )
        ).scalar_one_or_none()
        if existing_cat is None:
            cat = SupplierCatalogItem(
                supplier_id=sup.id,
                sku_id=sku.id,
                unit_price_inr=round(base_price + idx * 120.0, 2),
                min_order_qty=10 if idx == 0 else 5,
                lead_time_days=sup.lead_time_days,
                is_preferred=(idx == 0),
            )
            db.add(cat)
    db.flush()

    refreshed = db.execute(
        select(Supplier, SupplierCatalogItem)
        .join(SupplierCatalogItem, SupplierCatalogItem.supplier_id == Supplier.id)
        .where(SupplierCatalogItem.sku_id == sku_id, Supplier.is_active.is_(True))
        .order_by(SupplierCatalogItem.is_preferred.desc(), Supplier.reliability_score.desc(), SupplierCatalogItem.unit_price_inr.asc())
    ).all()
    return [(r[0], r[1]) for r in refreshed]

"""Production batch readiness, component reservation, and output accounting."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.fulfilment.orders import OrderError
from app.inventory.engine import (
    StockCalculationError,
    normalize_utc,
    recompute_balance_for_pair,
)
from app.inventory.ingestion import ensure_plant_and_sku_exist
from app.models import (
    InventoryEvent,
    InventoryEventType,
    ProductionBatch,
    ProductionBatchStatus,
    SKU,
)
from app.schemas.production import ProductionBatchCreate


def _next_seq(db: Session, source: str) -> int:
    val = db.execute(
        select(func.max(InventoryEvent.source_sequence)).where(InventoryEvent.source == source)
    ).scalar_one()
    return (val or 0) + 1


def create_production_batch(db: Session, payload: ProductionBatchCreate) -> ProductionBatch:
    """Create a production batch and optionally reserve required components."""
    ensure_plant_and_sku_exist(db, payload.plant_id, payload.sku_id)

    for comp in payload.required_components:
        sku = db.execute(select(SKU).where(SKU.id == comp.sku_id)).scalar_one_or_none()
        if sku is None:
            raise OrderError(f"Component SKU with id={comp.sku_id} does not exist.", status_code=422)

    now_utc = datetime.now(timezone.utc)
    batch = ProductionBatch(
        batch_code=payload.batch_code,
        plant_id=payload.plant_id,
        sku_id=payload.sku_id,
        planned_quantity=payload.planned_quantity,
        completed_quantity=0,
        expected_completion_at=payload.expected_completion_at,
        status=ProductionBatchStatus.PLANNED.value,
        required_components=[c.model_dump() for c in payload.required_components],
        components_reserved=False,
        output_counted_in_inventory=False,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(batch)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise OrderError(
            f"Production batch '{payload.batch_code}' already exists.",
            status_code=409,
        ) from exc

    if payload.reserve_components and payload.required_components:
        try:
            for comp in payload.required_components:
                seq = _next_seq(db, "production")
                ev = InventoryEvent(
                    source="production",
                    external_event_id=f"batch-{batch.id}-comp-{comp.sku_id}-{uuid4().hex[:8]}",
                    plant_id=payload.plant_id,
                    sku_id=comp.sku_id,
                    event_type=InventoryEventType.STOCK_RESERVED.value,
                    quantity=comp.quantity,
                    source_sequence=seq,
                    occurred_at=now_utc,
                    received_at=now_utc,
                    metadata_json={"batch_code": batch.batch_code},
                )
                db.add(ev)
                db.flush()
                recompute_balance_for_pair(
                    db, payload.plant_id, comp.sku_id, reference_now=now_utc, validate_rules=True
                )
            batch.components_reserved = True
        except StockCalculationError as exc:
            db.rollback()
            raise OrderError(
                f"Cannot reserve components for batch '{payload.batch_code}': {exc.reason}",
                status_code=422,
            ) from exc

    db.commit()
    db.refresh(batch)
    return batch


def complete_production_batch(
    db: Session,
    batch_id: int,
    *,
    completed_quantity: int | None = None,
) -> ProductionBatch:
    """Complete a production batch and record finished goods receipt exactly once."""
    batch = db.execute(
        select(ProductionBatch).where(ProductionBatch.id == batch_id)
    ).scalar_one_or_none()
    if batch is None:
        raise OrderError(f"Production batch with id={batch_id} not found.", status_code=404)

    if batch.output_counted_in_inventory:
        return batch

    qty = completed_quantity if completed_quantity is not None else batch.planned_quantity
    if qty <= 0:
        raise OrderError("completed_quantity must be greater than 0.", status_code=422)

    now_utc = datetime.now(timezone.utc)
    seq = _next_seq(db, "production")
    receipt = InventoryEvent(
        source="production",
        external_event_id=f"batch-complete-{batch.id}",
        plant_id=batch.plant_id,
        sku_id=batch.sku_id,
        event_type=InventoryEventType.STOCK_RECEIVED.value,
        quantity=qty,
        source_sequence=seq,
        occurred_at=now_utc,
        received_at=now_utc,
        metadata_json={"batch_code": batch.batch_code},
    )
    db.add(receipt)
    db.flush()
    recompute_balance_for_pair(
        db, batch.plant_id, batch.sku_id, reference_now=now_utc, validate_rules=True
    )

    batch.completed_quantity = qty
    batch.status = ProductionBatchStatus.COMPLETED.value
    batch.output_counted_in_inventory = True
    batch.updated_at = now_utc

    db.commit()
    db.refresh(batch)
    return batch


def get_projected_production_supply(
    db: Session,
    plant_id: int,
    sku_id: int,
    as_of: datetime,
) -> int:
    """Return uncounted planned production output expected by as_of."""
    cutoff = normalize_utc(as_of)
    batches = db.execute(
        select(ProductionBatch).where(
            ProductionBatch.plant_id == plant_id,
            ProductionBatch.sku_id == sku_id,
            ProductionBatch.output_counted_in_inventory.is_(False),
            ProductionBatch.status.in_(
                [ProductionBatchStatus.PLANNED.value, ProductionBatchStatus.IN_PROGRESS.value]
            ),
        )
    ).scalars().all()
    return sum(
        b.planned_quantity
        for b in batches
        if normalize_utc(b.expected_completion_at) <= cutoff
    )

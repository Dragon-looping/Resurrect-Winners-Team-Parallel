"""Routes for production batch readiness and completion."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.fulfilment.orders import OrderError
from app.fulfilment.production import complete_production_batch, create_production_batch
from app.inventory.ingestion import EventValidationError
from app.models import ProductionBatch
from app.schemas.production import ProductionBatchCreate, ProductionBatchResponse

router = APIRouter(tags=["Production"])


@router.post(
    "/production/batches",
    response_model=ProductionBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a production batch",
    description="Creates a production batch and optionally reserves required components.",
)
def create_batch(
    payload: ProductionBatchCreate,
    db: Session = Depends(get_db),
) -> ProductionBatchResponse:
    """Create a production batch."""
    try:
        batch = create_production_batch(db, payload)
    except (OrderError, EventValidationError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return ProductionBatchResponse.model_validate(batch)


@router.get(
    "/production/batches",
    response_model=list[ProductionBatchResponse],
    summary="List production batches",
    description="Lists production batches with optional plant and SKU filters.",
)
def list_batches(
    plant_id: int | None = Query(default=None, gt=0),
    sku_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> list[ProductionBatchResponse]:
    """List production batches."""
    filters = []
    if plant_id is not None:
        filters.append(ProductionBatch.plant_id == plant_id)
    if sku_id is not None:
        filters.append(ProductionBatch.sku_id == sku_id)
    batches = db.execute(
        select(ProductionBatch).where(*filters).order_by(ProductionBatch.expected_completion_at.asc())
    ).scalars().all()
    return [ProductionBatchResponse.model_validate(b) for b in batches]


@router.post(
    "/production/batches/{batch_id}/complete",
    response_model=ProductionBatchResponse,
    summary="Complete a production batch",
    description="Completes a production batch and records finished goods receipt exactly once.",
)
def complete_batch(
    batch_id: int,
    completed_quantity: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> ProductionBatchResponse:
    """Complete a production batch idempotently."""
    try:
        batch = complete_production_batch(db, batch_id, completed_quantity=completed_quantity)
    except OrderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.reason) from exc
    return ProductionBatchResponse.model_validate(batch)

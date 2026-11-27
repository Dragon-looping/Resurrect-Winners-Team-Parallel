"""Routes for inventory replay operations."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.inventory.replay import replay_inventory
from app.schemas.replay import ReplayBalanceItem, ReplayResponse

router = APIRouter(tags=["Inventory Replay"])


@router.post(
    "/inventory/replay",
    response_model=ReplayResponse,
    summary="Replay inventory events deterministically",
    description="Rebuilds stock projections from persisted valid events using deterministic ordering.",
)
def trigger_inventory_replay(
    plant_id: int | None = Query(default=None, gt=0, description="Optional plant filter."),
    sku_id: int | None = Query(default=None, gt=0, description="Optional SKU filter."),
    db: Session = Depends(get_db),
) -> ReplayResponse:
    """Rebuild inventory balances from valid persisted events."""
    summary = replay_inventory(db, plant_id=plant_id, sku_id=sku_id)
    return ReplayResponse(
        status="replayed",
        events_replayed=summary.events_replayed,
        balances_updated=summary.balances_updated,
        plant_id=summary.plant_id,
        sku_id=summary.sku_id,
        replayed_at=summary.replayed_at,
        balances=[ReplayBalanceItem.model_validate(b) for b in summary.balances],
    )

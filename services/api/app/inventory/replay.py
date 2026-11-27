"""Deterministic inventory replay service."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.inventory.engine import calculate_stock_snapshot, event_sort_key
from app.models import InventoryBalance, InventoryEvent


@dataclass(frozen=True, slots=True)
class ReplaySummary:
    """Result summary of a deterministic inventory replay."""

    events_replayed: int
    balances_updated: int
    plant_id: int | None
    sku_id: int | None
    replayed_at: datetime
    balances: list[InventoryBalance]


def replay_inventory(
    db: Session,
    *,
    plant_id: int | None = None,
    sku_id: int | None = None,
) -> ReplaySummary:
    """Rebuild inventory balance projections deterministically from valid persisted events."""
    event_filters = []
    balance_filters = []
    if plant_id is not None:
        event_filters.append(InventoryEvent.plant_id == plant_id)
        balance_filters.append(InventoryBalance.plant_id == plant_id)
    if sku_id is not None:
        event_filters.append(InventoryEvent.sku_id == sku_id)
        balance_filters.append(InventoryBalance.sku_id == sku_id)

    events = db.execute(select(InventoryEvent).where(*event_filters)).scalars().all()
    ordered_events = sorted(events, key=event_sort_key)

    grouped_events: dict[tuple[int, int], list[InventoryEvent]] = defaultdict(list)
    for ev in ordered_events:
        grouped_events[(ev.plant_id, ev.sku_id)].append(ev)

    existing_balances = db.execute(select(InventoryBalance).where(*balance_filters)).scalars().all()
    balance_map: dict[tuple[int, int], InventoryBalance] = {
        (bal.plant_id, bal.sku_id): bal for bal in existing_balances
    }

    target_pairs = sorted(set(grouped_events.keys()) | set(balance_map.keys()))
    now_utc = datetime.now(timezone.utc)
    updated_balances: list[InventoryBalance] = []

    for pair_plant_id, pair_sku_id in target_pairs:
        pair_events = grouped_events.get((pair_plant_id, pair_sku_id), [])
        snapshot = calculate_stock_snapshot(
            pair_plant_id,
            pair_sku_id,
            pair_events,
            reference_now=now_utc,
            validate_rules=True,
        )
        balance = balance_map.get((pair_plant_id, pair_sku_id))
        if balance is None:
            balance = InventoryBalance(
                plant_id=pair_plant_id,
                sku_id=pair_sku_id,
                physical_stock=snapshot.physical_stock,
                reserved_stock=snapshot.reserved_stock,
                confirmed_arrivals=snapshot.confirmed_arrivals,
                available_stock=snapshot.available_stock,
                last_event_id=snapshot.last_event_id,
                last_occurred_at=snapshot.last_occurred_at,
                last_source_sequence=snapshot.last_source_sequence,
                updated_at=now_utc,
            )
            db.add(balance)
        else:
            balance.physical_stock = snapshot.physical_stock
            balance.reserved_stock = snapshot.reserved_stock
            balance.confirmed_arrivals = snapshot.confirmed_arrivals
            balance.available_stock = snapshot.available_stock
            balance.last_event_id = snapshot.last_event_id
            balance.last_occurred_at = snapshot.last_occurred_at
            balance.last_source_sequence = snapshot.last_source_sequence
            balance.updated_at = now_utc

        updated_balances.append(balance)

    db.commit()
    for bal in updated_balances:
        db.refresh(bal)

    return ReplaySummary(
        events_replayed=len(ordered_events),
        balances_updated=len(updated_balances),
        plant_id=plant_id,
        sku_id=sku_id,
        replayed_at=now_utc,
        balances=updated_balances,
    )

"""Inter-warehouse read-only stock visibility and stock request workflow routes."""

from datetime import datetime, timezone
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_warehouse_user, record_warehouse_audit
from app.core.database import get_db
from app.inventory.ingestion import EventValidationError, ingest_event
from app.models import (
    InterWarehouseRequest,
    InterWarehouseRequestStatus,
    InventoryBalance,
    InventoryEvent,
    InventoryEventType,
    Plant,
    SKU,
    WarehouseUser,
)
from app.schemas.event import InventoryEventCreate
from app.schemas.warehouse_auth import (
    NetworkStockAvailabilityItem,
    NetworkStockAvailabilityResponse,
    StockRequestApprove,
    StockRequestCreate,
    StockRequestDispatch,
    StockRequestListResponse,
    StockRequestReceive,
    StockRequestReject,
    StockRequestResponse,
)

router = APIRouter(prefix="/network", tags=["Warehouse Network"])


def _availability_status(qty: int) -> Literal["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"]:
    if qty <= 0:
        return "OUT_OF_STOCK"
    if qty < 25:
        return "LOW_STOCK"
    return "IN_STOCK"


def _serialize_request(req: InterWarehouseRequest) -> StockRequestResponse:
    return StockRequestResponse(
        id=req.id,
        request_code=req.request_code,
        requesting_plant_id=req.requesting_plant_id,
        requesting_plant_name=req.requesting_plant.name,
        supplying_plant_id=req.supplying_plant_id,
        supplying_plant_name=req.supplying_plant.name,
        sku_id=req.sku_id,
        sku_code=req.sku.sku_code,
        sku_name=req.sku.name,
        unit=req.sku.unit,
        requested_qty=req.requested_qty,
        approved_qty=req.approved_qty,
        dispatched_qty=req.dispatched_qty,
        received_qty=req.received_qty,
        status=req.status,
        reason=req.reason,
        rejection_reason=req.rejection_reason,
        dispatch_event_id=req.dispatch_event_id,
        receipt_event_id=req.receipt_event_id,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


def _load_request_or_404(db: Session, request_id: int) -> InterWarehouseRequest:
    req = (
        db.execute(
            select(InterWarehouseRequest)
            .options(
                joinedload(InterWarehouseRequest.requesting_plant),
                joinedload(InterWarehouseRequest.supplying_plant),
                joinedload(InterWarehouseRequest.sku),
            )
            .where(InterWarehouseRequest.id == request_id)
        )
        .scalar_one_or_none()
    )
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock request id={request_id} not found.",
        )
    return req


def _next_source_sequence(db: Session, source: str) -> int:
    current_max = db.execute(
        select(func.coalesce(func.max(InventoryEvent.source_sequence), 0)).where(
            InventoryEvent.source == source
        )
    ).scalar_one()
    return int(current_max) + 1


@router.get(
    "/availability",
    response_model=NetworkStockAvailabilityResponse,
    summary="Read-only stock availability at other warehouses",
    description="Exposes only limited stock availability for other warehouses in the network.",
)
def get_network_availability(
    plant_id: int | None = Query(default=None, gt=0),
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> NetworkStockAvailabilityResponse:
    """Return limited read-only stock availability for warehouses other than the caller's."""
    if plant_id is not None and plant_id == current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use /stock for your own warehouse inventory.",
        )

    plants_stmt = select(Plant).where(Plant.id != current_user.plant_id).order_by(Plant.id.asc())
    if plant_id is not None:
        plants_stmt = plants_stmt.where(Plant.id == plant_id)
    other_plants = db.execute(plants_stmt).scalars().all()
    if plant_id is not None and not other_plants:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Warehouse plant_id={plant_id} not found.",
        )

    skus = db.execute(select(SKU).order_by(SKU.id.asc())).scalars().all()
    balances = db.execute(
        select(InventoryBalance).where(InventoryBalance.plant_id != current_user.plant_id)
    ).scalars().all()
    balance_map = {(b.plant_id, b.sku_id): b for b in balances}

    items: list[NetworkStockAvailabilityItem] = []
    for plant in other_plants:
        for sku in skus:
            bal = balance_map.get((plant.id, sku.id))
            avail = max(0, bal.available_stock) if bal is not None else 0
            items.append(
                NetworkStockAvailabilityItem(
                    plant_id=plant.id,
                    plant_name=plant.name,
                    plant_location=plant.location,
                    sku_id=sku.id,
                    sku_code=sku.sku_code,
                    sku_name=sku.name,
                    unit=sku.unit,
                    available_stock=avail,
                    availability_status=_availability_status(avail),
                    updated_at=bal.updated_at if bal is not None else None,
                )
            )

    return NetworkStockAvailabilityResponse(count=len(items), items=items)


@router.post(
    "/requests",
    response_model=StockRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an inter-warehouse stock request",
    description="Creates a stock request from the authenticated warehouse to another warehouse.",
)
def create_stock_request(
    payload: StockRequestCreate,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Create a PENDING inter-warehouse stock request without modifying stock."""
    if (
        payload.requesting_plant_id is not None
        and payload.requesting_plant_id != current_user.plant_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create a stock request on behalf of another warehouse.",
        )

    if payload.supplying_plant_id == current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot request stock from your own warehouse.",
        )

    if payload.idempotency_key:
        existing = (
            db.execute(
                select(InterWarehouseRequest)
                .options(
                    joinedload(InterWarehouseRequest.requesting_plant),
                    joinedload(InterWarehouseRequest.supplying_plant),
                    joinedload(InterWarehouseRequest.sku),
                )
                .where(InterWarehouseRequest.idempotency_key == payload.idempotency_key)
            )
            .scalar_one_or_none()
        )
        if existing is not None:
            if existing.requesting_plant_id != current_user.plant_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key already used by another warehouse.",
                )
            return _serialize_request(existing)

    supplying_plant = db.execute(
        select(Plant).where(Plant.id == payload.supplying_plant_id)
    ).scalar_one_or_none()
    if supplying_plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplying warehouse id={payload.supplying_plant_id} not found.",
        )

    sku = db.execute(select(SKU).where(SKU.id == payload.sku_id)).scalar_one_or_none()
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SKU id={payload.sku_id} not found.",
        )

    request_code = f"REQ-{uuid.uuid4().hex[:10].upper()}"
    req = InterWarehouseRequest(
        request_code=request_code,
        idempotency_key=payload.idempotency_key,
        requesting_plant_id=current_user.plant_id,
        supplying_plant_id=supplying_plant.id,
        sku_id=sku.id,
        requested_qty=payload.requested_qty,
        status=InterWarehouseRequestStatus.PENDING,
        reason=payload.reason.strip() if payload.reason else None,
        created_by_user_id=current_user.id,
    )
    db.add(req)
    db.flush()

    record_warehouse_audit(
        db,
        actor_user_id=current_user.id,
        actor_login_id=current_user.login_id,
        plant_id=current_user.plant_id,
        action="REQUEST_CREATED",
        target_type="inter_warehouse_request",
        target_id=str(req.id),
        details={
            "request_code": req.request_code,
            "supplying_plant_id": supplying_plant.id,
            "sku_id": sku.id,
            "requested_qty": req.requested_qty,
        },
    )
    db.commit()
    return _serialize_request(_load_request_or_404(db, req.id))


@router.get(
    "/requests",
    response_model=StockRequestListResponse,
    summary="List inter-warehouse stock requests visible to the caller",
    description="Returns only requests created by or addressed to the authenticated warehouse.",
)
def list_stock_requests(
    direction: Literal["all", "outgoing", "incoming"] = Query(default="all"),
    status_filter: InterWarehouseRequestStatus | None = Query(default=None, alias="status"),
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestListResponse:
    """List requests strictly scoped to the authenticated warehouse."""
    stmt = (
        select(InterWarehouseRequest)
        .options(
            joinedload(InterWarehouseRequest.requesting_plant),
            joinedload(InterWarehouseRequest.supplying_plant),
            joinedload(InterWarehouseRequest.sku),
        )
        .order_by(InterWarehouseRequest.created_at.desc(), InterWarehouseRequest.id.desc())
    )

    if direction == "outgoing":
        stmt = stmt.where(InterWarehouseRequest.requesting_plant_id == current_user.plant_id)
    elif direction == "incoming":
        stmt = stmt.where(InterWarehouseRequest.supplying_plant_id == current_user.plant_id)
    else:
        stmt = stmt.where(
            or_(
                InterWarehouseRequest.requesting_plant_id == current_user.plant_id,
                InterWarehouseRequest.supplying_plant_id == current_user.plant_id,
            )
        )

    if status_filter is not None:
        stmt = stmt.where(InterWarehouseRequest.status == status_filter)

    rows = db.execute(stmt).scalars().all()
    return StockRequestListResponse(
        count=len(rows),
        items=[_serialize_request(r) for r in rows],
    )


@router.get(
    "/requests/{request_id}",
    response_model=StockRequestResponse,
    summary="Get a single inter-warehouse stock request",
)
def get_stock_request(
    request_id: int,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Return a single request only if the caller is the requesting or supplying warehouse."""
    req = _load_request_or_404(db, request_id)
    if current_user.plant_id not in (req.requesting_plant_id, req.supplying_plant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You cannot view requests between other warehouses.",
        )
    return _serialize_request(req)


@router.post(
    "/requests/{request_id}/approve",
    response_model=StockRequestResponse,
    summary="Approve an incoming stock request",
)
def approve_stock_request(
    request_id: int,
    payload: StockRequestApprove,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Approve (fully or partially) a pending request addressed to the caller's warehouse."""
    req = _load_request_or_404(db, request_id)
    if req.supplying_plant_id != current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the supplying warehouse can approve this request.",
        )
    if req.status != InterWarehouseRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve request in status {req.status.value}.",
        )
    if payload.approved_qty > req.requested_qty:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Approved quantity cannot exceed requested quantity.",
        )

    req.approved_qty = payload.approved_qty
    req.status = (
        InterWarehouseRequestStatus.APPROVED
        if payload.approved_qty == req.requested_qty
        else InterWarehouseRequestStatus.PARTIALLY_APPROVED
    )
    req.reviewed_by_user_id = current_user.id

    record_warehouse_audit(
        db,
        actor_user_id=current_user.id,
        actor_login_id=current_user.login_id,
        plant_id=current_user.plant_id,
        action="REQUEST_APPROVED",
        target_type="inter_warehouse_request",
        target_id=str(req.id),
        details={"approved_qty": req.approved_qty, "status": req.status.value},
    )
    db.commit()
    return _serialize_request(_load_request_or_404(db, req.id))


@router.post(
    "/requests/{request_id}/reject",
    response_model=StockRequestResponse,
    summary="Reject an incoming stock request",
)
def reject_stock_request(
    request_id: int,
    payload: StockRequestReject,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Reject a pending request addressed to the caller's warehouse."""
    req = _load_request_or_404(db, request_id)
    if req.supplying_plant_id != current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the supplying warehouse can reject this request.",
        )
    if req.status != InterWarehouseRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject request in status {req.status.value}.",
        )

    req.status = InterWarehouseRequestStatus.REJECTED
    req.rejection_reason = payload.rejection_reason.strip()
    req.reviewed_by_user_id = current_user.id

    record_warehouse_audit(
        db,
        actor_user_id=current_user.id,
        actor_login_id=current_user.login_id,
        plant_id=current_user.plant_id,
        action="REQUEST_REJECTED",
        target_type="inter_warehouse_request",
        target_id=str(req.id),
        details={"rejection_reason": req.rejection_reason},
    )
    db.commit()
    return _serialize_request(_load_request_or_404(db, req.id))


@router.post(
    "/requests/{request_id}/dispatch",
    response_model=StockRequestResponse,
    summary="Dispatch stock for an approved inter-warehouse request",
)
def dispatch_stock_request(
    request_id: int,
    payload: StockRequestDispatch | None = None,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Dispatch approved goods via a validated STOCK_DISPATCHED inventory event."""
    req = _load_request_or_404(db, request_id)
    if req.supplying_plant_id != current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the supplying warehouse can dispatch this request.",
        )
    if req.dispatch_event_id is not None or req.status not in (
        InterWarehouseRequestStatus.APPROVED,
        InterWarehouseRequestStatus.PARTIALLY_APPROVED,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request cannot be dispatched in status {req.status.value}.",
        )

    approved_qty = req.approved_qty or req.requested_qty
    dispatch_qty = payload.dispatched_qty if payload and payload.dispatched_qty else approved_qty
    if dispatch_qty > approved_qty:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dispatched quantity cannot exceed approved quantity.",
        )

    source = f"warehouse-network:{current_user.login_id}"
    event_payload = InventoryEventCreate(
        source=source,
        external_event_id=f"IWR-DISP-{req.request_code}",
        plant_id=req.supplying_plant_id,
        sku_id=req.sku_id,
        event_type=InventoryEventType.STOCK_DISPATCHED,
        quantity=dispatch_qty,
        source_sequence=_next_source_sequence(db, source),
        occurred_at=datetime.now(timezone.utc),
        metadata={
            "inter_warehouse_request_id": req.id,
            "request_code": req.request_code,
            "destination_plant_id": req.requesting_plant_id,
        },
    )
    try:
        persisted_event, _ = ingest_event(db, event_payload)
    except EventValidationError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.reason,
        ) from exc

    req.dispatch_event_id = persisted_event.id
    req.dispatched_qty = dispatch_qty
    req.status = InterWarehouseRequestStatus.DISPATCHED

    record_warehouse_audit(
        db,
        actor_user_id=current_user.id,
        actor_login_id=current_user.login_id,
        plant_id=current_user.plant_id,
        action="REQUEST_DISPATCHED",
        target_type="inter_warehouse_request",
        target_id=str(req.id),
        details={"dispatched_qty": dispatch_qty, "dispatch_event_id": persisted_event.id},
    )
    db.commit()
    return _serialize_request(_load_request_or_404(db, req.id))


@router.post(
    "/requests/{request_id}/receive",
    response_model=StockRequestResponse,
    summary="Confirm receipt of dispatched inter-warehouse stock",
)
def receive_stock_request(
    request_id: int,
    payload: StockRequestReceive | None = None,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Receive dispatched goods via a validated STOCK_RECEIVED inventory event."""
    req = _load_request_or_404(db, request_id)
    if req.requesting_plant_id != current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requesting warehouse can confirm receipt.",
        )
    if req.receipt_event_id is not None or req.status != InterWarehouseRequestStatus.DISPATCHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request cannot be received in status {req.status.value}.",
        )

    receive_qty = (
        payload.received_qty if payload and payload.received_qty else req.dispatched_qty
    )
    if receive_qty > req.dispatched_qty:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Received quantity cannot exceed dispatched quantity.",
        )

    source = f"warehouse-network:{current_user.login_id}"
    event_payload = InventoryEventCreate(
        source=source,
        external_event_id=f"IWR-RECV-{req.request_code}",
        plant_id=req.requesting_plant_id,
        sku_id=req.sku_id,
        event_type=InventoryEventType.STOCK_RECEIVED,
        quantity=receive_qty,
        source_sequence=_next_source_sequence(db, source),
        occurred_at=datetime.now(timezone.utc),
        metadata={
            "inter_warehouse_request_id": req.id,
            "request_code": req.request_code,
            "supplying_plant_id": req.supplying_plant_id,
        },
    )
    try:
        persisted_event, _ = ingest_event(db, event_payload)
    except EventValidationError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.reason,
        ) from exc

    req.receipt_event_id = persisted_event.id
    req.received_qty = receive_qty
    req.status = (
        InterWarehouseRequestStatus.FULFILLED
        if receive_qty >= req.dispatched_qty
        else InterWarehouseRequestStatus.PARTIALLY_FULFILLED
    )

    record_warehouse_audit(
        db,
        actor_user_id=current_user.id,
        actor_login_id=current_user.login_id,
        plant_id=current_user.plant_id,
        action="REQUEST_RECEIVED",
        target_type="inter_warehouse_request",
        target_id=str(req.id),
        details={"received_qty": receive_qty, "receipt_event_id": persisted_event.id},
    )
    db.commit()
    return _serialize_request(_load_request_or_404(db, req.id))


@router.post(
    "/requests/{request_id}/cancel",
    response_model=StockRequestResponse,
    summary="Cancel a pending outgoing stock request",
)
def cancel_stock_request(
    request_id: int,
    current_user: WarehouseUser = Depends(get_current_warehouse_user),
    db: Session = Depends(get_db),
) -> StockRequestResponse:
    """Cancel a PENDING request created by the caller's warehouse."""
    req = _load_request_or_404(db, request_id)
    if req.requesting_plant_id != current_user.plant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the requesting warehouse can cancel this request.",
        )
    if req.status != InterWarehouseRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel request in status {req.status.value}.",
        )

    req.status = InterWarehouseRequestStatus.CANCELLED
    record_warehouse_audit(
        db,
        actor_user_id=current_user.id,
        actor_login_id=current_user.login_id,
        plant_id=current_user.plant_id,
        action="REQUEST_CANCELLED",
        target_type="inter_warehouse_request",
        target_id=str(req.id),
    )
    db.commit()
    return _serialize_request(_load_request_or_404(db, req.id))

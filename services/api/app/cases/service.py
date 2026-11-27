"""Case retrieval and vector steering service for SETUVYUHA (PS5)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from app.cases.corpus import SEEDED_HISTORICAL_CASES
from app.cases.embeddings import (
    EMBEDDING_DIM,
    STEERING_PRESETS,
    LocalEmbeddingEngine,
    cosine_similarity,
    l2_normalize,
    validate_embedding_vector,
)
from app.cases.projection import Fixed2DProjector
from app.cases.schemas import (
    CaseProjectionPoint,
    CaseSearchFilters,
    CaseSearchHit,
    CaseSearchRequest,
    CaseSearchResponse,
    HistoricalCase,
    SteeringPresetInfo,
)


@dataclass(frozen=True)
class _IndexedCase:
    """Internal immutable index entry keeping embeddings & 2D projections separate from records."""

    record: HistoricalCase
    embedding: list[float]
    projection_xy: tuple[float, float]


def _case_to_index_text(case: HistoricalCase) -> str:
    """Build canonical searchable text representation for a historical case."""
    tags_text = " ".join(case.tags)
    return (
        f"{case.title} {case.description} {case.sku} {case.category} "
        f"{case.origin_hub} {case.destination_hub} {case.resolution_type} "
        f"{case.quantity} {case.outcome_summary} {tags_text}"
    )


class CaseSteeringService:
    """Deterministic similarity search and vector steering over historical cases."""

    def __init__(
        self,
        cases: Sequence[HistoricalCase] | None = None,
        embedding_engine: LocalEmbeddingEngine | None = None,
        projector: Fixed2DProjector | None = None,
    ) -> None:
        self._engine = embedding_engine or LocalEmbeddingEngine(dimension=EMBEDDING_DIM)
        self._projector = projector or Fixed2DProjector()
        source_cases = SEEDED_HISTORICAL_CASES if cases is None else cases

        self._index: list[_IndexedCase] = []
        self._by_id: dict[str, _IndexedCase] = {}
        for item in source_cases:
            # Deep-copy record so external callers cannot mutate internal corpus
            record_copy = item.model_copy(deep=True)
            emb_res = self._engine.embed_text(_case_to_index_text(record_copy))
            xy = self._projector.project(emb_res.vector)
            entry = _IndexedCase(record=record_copy, embedding=emb_res.vector, projection_xy=xy)
            self._index.append(entry)
            self._by_id[record_copy.case_id] = entry

    @property
    def embedding_dimension(self) -> int:
        return self._engine.dimension

    def list_cases(self) -> list[HistoricalCase]:
        """Return defensive copies of all indexed historical cases."""
        return [entry.record.model_copy(deep=True) for entry in self._index]

    def list_steering_presets(self) -> list[SteeringPresetInfo]:
        """Return available named steering directions for UI/API consumers."""
        return [
            SteeringPresetInfo(
                id=preset_id,
                label=meta["label"],
                description=meta["description"],
            )
            for preset_id, meta in STEERING_PRESETS.items()
        ]

    def _resolve_steering_vector(
        self, request: CaseSearchRequest
    ) -> tuple[list[float] | None, str | None]:
        """Validate and resolve the steering direction vector and label."""
        sources_count = sum(
            1
            for val in (
                request.steering_vector is not None,
                bool(request.steering_direction),
                bool(request.target_case_id),
            )
            if val
        )
        if sources_count > 1:
            raise ValueError(
                "Specify at most one of steering_vector, steering_direction, or target_case_id."
            )

        if request.steering_vector is not None:
            vec = validate_embedding_vector(request.steering_vector, self._engine.dimension)
            if sum(v * v for v in vec) <= 1e-12:
                raise ValueError("steering_vector cannot be an all-zero vector.")
            return l2_normalize(vec), "custom_vector"

        if request.steering_direction:
            vec = self._engine.get_steering_preset_vector(request.steering_direction)
            preset_key = request.steering_direction.strip().lower()
            return vec, STEERING_PRESETS[preset_key]["label"]

        if request.target_case_id:
            target = self._by_id.get(request.target_case_id)
            if target is None:
                raise ValueError(f"Unknown target_case_id '{request.target_case_id}'.")
            return list(target.embedding), f"Toward {target.record.case_id}"

        if abs(request.steering_strength) > 1e-9:
            raise ValueError(
                "Non-zero steering_strength requires steering_direction, steering_vector, or target_case_id."
            )

        return None, None

    @staticmethod
    def _matches_filters(record: HistoricalCase, filters: CaseSearchFilters | None) -> bool:
        if filters is None:
            return True
        if filters.origin_hub and filters.origin_hub.lower() not in record.origin_hub.lower():
            return False
        if filters.destination_hub and filters.destination_hub.lower() not in record.destination_hub.lower():
            return False
        if filters.category and filters.category.lower() != record.category.lower():
            return False
        if filters.resolution_type and filters.resolution_type.lower() != record.resolution_type.lower():
            return False
        if filters.sku and filters.sku.lower() != record.sku.lower():
            return False
        return True

    def search(self, request: CaseSearchRequest) -> CaseSearchResponse:
        """Execute similarity search with optional vector steering and fixed 2D projection."""
        query_emb = self._engine.embed_text(request.query)
        warnings = list(query_emb.warnings)

        dir_vec, dir_label = self._resolve_steering_vector(request)
        steering_applied = dir_vec is not None and abs(request.steering_strength) > 1e-9

        base_vec = query_emb.vector
        if steering_applied and dir_vec is not None:
            combined = [
                q + request.steering_strength * d
                for q, d in zip(base_vec, dir_vec)
            ]
            steered_vec = l2_normalize(combined)
        else:
            steered_vec = base_vec

        # Filter corpus deterministically without mutating records
        candidates = [
            entry
            for entry in self._index
            if self._matches_filters(entry.record, request.filters)
        ]

        # Score base and steered similarities
        scored: list[tuple[_IndexedCase, float, float]] = []
        for entry in candidates:
            base_score = cosine_similarity(base_vec, entry.embedding)
            steered_score = cosine_similarity(steered_vec, entry.embedding)
            if (
                request.filters is not None
                and request.filters.min_similarity is not None
                and steered_score < request.filters.min_similarity
            ):
                continue
            scored.append((entry, base_score, steered_score))

        # Compute deterministic base ranking
        base_sorted = sorted(scored, key=lambda item: (-item[1], item[0].record.case_id))
        base_rank_map = {
            item[0].record.case_id: idx + 1 for idx, item in enumerate(base_sorted)
        }

        # Compute steered ranking
        steered_sorted = sorted(scored, key=lambda item: (-item[2], item[0].record.case_id))
        total_matches = len(steered_sorted)
        page_items = steered_sorted[request.offset : request.offset + request.top_k]

        results: list[CaseSearchHit] = []
        for idx, (entry, base_score, steered_score) in enumerate(page_items):
            rank = request.offset + idx + 1
            base_rank = base_rank_map[entry.record.case_id]
            proj_point = (
                CaseProjectionPoint(
                    case_id=entry.record.case_id,
                    x=entry.projection_xy[0],
                    y=entry.projection_xy[1],
                    label=entry.record.title,
                    category=entry.record.category,
                    resolution_type=entry.record.resolution_type,
                )
                if request.include_projection
                else None
            )
            results.append(
                CaseSearchHit(
                    case=entry.record.model_copy(deep=True),
                    similarity_score=steered_score,
                    base_similarity_score=base_score,
                    rank=rank,
                    base_rank=base_rank,
                    rank_delta=base_rank - rank,
                    projection=proj_point,
                )
            )

        projection_points: list[CaseProjectionPoint] = []
        if request.include_projection:
            for entry in candidates:
                projection_points.append(
                    CaseProjectionPoint(
                        case_id=entry.record.case_id,
                        x=entry.projection_xy[0],
                        y=entry.projection_xy[1],
                        label=entry.record.title,
                        category=entry.record.category,
                        resolution_type=entry.record.resolution_type,
                    )
                )
            base_xy = self._projector.project(base_vec)
            projection_points.append(
                CaseProjectionPoint(
                    case_id="QUERY_BASE",
                    x=base_xy[0],
                    y=base_xy[1],
                    label="Query (Unsteered)",
                    category="query",
                    resolution_type="query",
                    is_query=True,
                    is_steered_query=False,
                )
            )
            if steering_applied:
                steered_xy = self._projector.project(steered_vec)
                projection_points.append(
                    CaseProjectionPoint(
                        case_id="QUERY_STEERED",
                        x=steered_xy[0],
                        y=steered_xy[1],
                        label=f"Query (Steered {request.steering_strength:+.2f})",
                        category="query",
                        resolution_type="query",
                        is_query=True,
                        is_steered_query=True,
                    )
                )

        return CaseSearchResponse(
            query=request.query,
            total_matches=total_matches,
            offset=request.offset,
            top_k=request.top_k,
            embedding_dimension=self._engine.dimension,
            steering_applied=steering_applied,
            steering_strength=request.steering_strength,
            steering_direction_label=dir_label,
            results=results,
            projection_points=projection_points,
            warnings=warnings,
        )

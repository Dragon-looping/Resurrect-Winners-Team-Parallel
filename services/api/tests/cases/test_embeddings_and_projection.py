"""Tests for local deterministic embeddings, similarity, and fixed 2D projection."""

from __future__ import annotations

import math
import pytest

from app.cases.embeddings import (
    EMBEDDING_DIM,
    LocalEmbeddingEngine,
    cosine_similarity,
    validate_embedding_vector,
)
from app.cases.projection import Fixed2DProjector
from app.cases.schemas import CaseSearchRequest, HistoricalCase
from app.cases.service import CaseSteeringService


def test_embedding_generation_is_deterministic_and_normalized():
    engine = LocalEmbeddingEngine()
    res_a = engine.embed_text("50 industrial fans Manipal Udupi urgent split delivery")
    res_b = engine.embed_text("50 industrial fans Manipal Udupi urgent split delivery")

    assert res_a.is_empty is False
    assert res_a.warnings == []
    assert len(res_a.vector) == EMBEDDING_DIM
    assert res_a.vector == res_b.vector

    norm = math.sqrt(sum(v * v for v in res_a.vector))
    assert math.isclose(norm, 1.0, rel_tol=1e-5)


@pytest.mark.parametrize("bad_input", ["", "   ", "\n\t", "!!!---...", None, 12345, ["list"]])
def test_empty_and_malformed_inputs_handled_gracefully(bad_input):
    engine = LocalEmbeddingEngine()
    res = engine.embed_text(bad_input)

    assert res.is_empty is True
    assert len(res.vector) == EMBEDDING_DIM
    assert all(v == 0.0 for v in res.vector)
    assert len(res.warnings) == 1


def test_similarity_ranking_prefers_domain_match():
    service = CaseSteeringService()
    resp = service.search(
        CaseSearchRequest(
            query="50 industrial fans Manipal Udupi split delivery",
            top_k=5,
        )
    )

    assert resp.total_matches == 10
    assert len(resp.results) == 5
    top_case = resp.results[0].case
    assert "FAN" in top_case.sku
    assert "Manipal" in top_case.destination_hub
    assert resp.results[0].similarity_score >= resp.results[1].similarity_score


def test_fixed_2d_projection_is_stable_across_instances_and_requests():
    engine = LocalEmbeddingEngine()
    vec = engine.embed_text("50 industrial fans Manipal split delivery").vector

    proj_1 = Fixed2DProjector()
    proj_2 = Fixed2DProjector()
    xy_1 = proj_1.project(vec)
    xy_2 = proj_2.project(vec)

    assert xy_1 == xy_2
    assert len(xy_1) == 2
    assert all(math.isfinite(c) for c in xy_1)

    # Zero vector maps safely to origin
    assert proj_1.project([0.0] * EMBEDDING_DIM) == (0.0, 0.0)


def test_small_and_degenerate_datasets_handled_safely():
    # 0 cases
    empty_service = CaseSteeringService(cases=[])
    empty_resp = empty_service.search(CaseSearchRequest(query="fans Manipal"))
    assert empty_resp.total_matches == 0
    assert empty_resp.results == []
    assert any(p.case_id == "QUERY_BASE" for p in empty_resp.projection_points)

    # 1 case with degenerate punctuation-only query
    single_case = HistoricalCase(
        case_id="CASE-SINGLE-01",
        title="Single Pump Case",
        description="10 submersible pumps to Brahmavar",
        sku="PMP-SUB-05-AGR",
        category="agricultural_pumps",
        origin_hub="Mangalore Depot",
        destination_hub="Brahmavar",
        quantity=10,
        resolution_type="standard_fulfilment",
        outcome_summary="Delivered directly.",
    )
    single_service = CaseSteeringService(cases=[single_case])
    resp = single_service.search(CaseSearchRequest(query="!!!", top_k=5))
    assert resp.total_matches == 1
    assert resp.results[0].similarity_score == 0.0
    assert len(resp.warnings) == 1


def test_cosine_similarity_and_vector_validation_reject_bad_dimensions():
    with pytest.raises(ValueError, match="dimension mismatch"):
        validate_embedding_vector([0.1, 0.2], expected_dim=EMBEDDING_DIM)

    with pytest.raises(ValueError, match="non-finite"):
        validate_embedding_vector([float("nan")] + [0.0] * (EMBEDDING_DIM - 1))

    assert cosine_similarity([0.0] * EMBEDDING_DIM, [1.0] + [0.0] * (EMBEDDING_DIM - 1)) == 0.0

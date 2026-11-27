"""Tests for vector steering, immutability, filtering, pagination, and /cases/search API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.cases.embeddings import EMBEDDING_DIM
from app.cases.schemas import CaseSearchFilters, CaseSearchRequest
from app.cases.service import CaseSteeringService
from app.main import app


def test_steering_shifts_ranking_without_mutating_original_cases():
    service = CaseSteeringService()
    before_cases = [c.model_dump() for c in service.list_cases()]

    neutral_resp = service.search(
        CaseSearchRequest(
            query="50 industrial fans Manipal",
            top_k=10,
            steering_strength=0.0,
        )
    )
    steered_later = service.search(
        CaseSearchRequest(
            query="50 industrial fans Manipal",
            top_k=10,
            steering_direction="later_consolidation",
            steering_strength=1.5,
        )
    )
    steered_split = service.search(
        CaseSearchRequest(
            query="50 industrial fans Manipal",
            top_k=10,
            steering_direction="split_delivery",
            steering_strength=1.5,
        )
    )

    later_rank_when_steered_later = next(
        h.rank for h in steered_later.results if h.case.case_id == "CASE-MANIPAL-FAN-LATER-02"
    )
    later_rank_when_steered_split = next(
        h.rank for h in steered_split.results if h.case.case_id == "CASE-MANIPAL-FAN-LATER-02"
    )
    assert later_rank_when_steered_later < later_rank_when_steered_split
    assert steered_later.steering_applied is True
    assert neutral_resp.steering_applied is False

    # Base similarity scores and original case records must remain unchanged
    after_cases = [c.model_dump() for c in service.list_cases()]
    assert before_cases == after_cases

    neutral_map = {h.case.case_id: h.base_similarity_score for h in neutral_resp.results}
    steered_map = {h.case.case_id: h.base_similarity_score for h in steered_later.results}
    assert neutral_map == steered_map


def test_steering_away_with_negative_strength_demotes_target_direction():
    service = CaseSteeringService()
    toward = service.search(
        CaseSearchRequest(
            query="50 industrial fans Manipal",
            top_k=10,
            steering_direction="split_delivery",
            steering_strength=1.2,
        )
    )
    away = service.search(
        CaseSearchRequest(
            query="50 industrial fans Manipal",
            top_k=10,
            steering_direction="split_delivery",
            steering_strength=-1.2,
        )
    )

    split_score_toward = next(
        h.similarity_score for h in toward.results if h.case.case_id == "CASE-MANIPAL-FAN-SPLIT-01"
    )
    split_score_away = next(
        h.similarity_score for h in away.results if h.case.case_id == "CASE-MANIPAL-FAN-SPLIT-01"
    )
    assert split_score_toward > split_score_away


def test_filtering_and_pagination_work_deterministically():
    service = CaseSteeringService()
    page1 = service.search(
        CaseSearchRequest(
            query="pumps",
            top_k=2,
            offset=0,
            filters=CaseSearchFilters(category="agricultural_pumps"),
        )
    )
    page2 = service.search(
        CaseSearchRequest(
            query="pumps",
            top_k=2,
            offset=2,
            filters=CaseSearchFilters(category="agricultural_pumps"),
        )
    )

    assert page1.total_matches == 4
    assert len(page1.results) == 2
    assert len(page2.results) == 2
    ids_p1 = {h.case.case_id for h in page1.results}
    ids_p2 = {h.case.case_id for h in page2.results}
    assert ids_p1.isdisjoint(ids_p2)
    assert page2.results[0].rank == 3


def test_cases_search_api_endpoint_and_error_handling():
    client = TestClient(app)

    # Valid search with steering
    res = client.post(
        "/cases/search",
        json={
            "query": "50 industrial fans Manipal urgent",
            "top_k": 4,
            "steering_direction": "split_delivery",
            "steering_strength": 0.8,
            "include_projection": True,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["steering_applied"] is True
    assert body["embedding_dimension"] == EMBEDDING_DIM
    assert len(body["results"]) == 4
    assert any(pt["case_id"] == "QUERY_BASE" for pt in body["projection_points"])
    assert any(pt["case_id"] == "QUERY_STEERED" for pt in body["projection_points"])

    # Invalid steering vector dimension -> 422
    bad_dim = client.post(
        "/cases/search",
        json={
            "query": "fans",
            "steering_vector": [0.1, 0.2, 0.3],
            "steering_strength": 1.0,
        },
    )
    assert bad_dim.status_code == 422

    # Unknown steering preset -> 422
    bad_preset = client.post(
        "/cases/search",
        json={
            "query": "fans",
            "steering_direction": "nonexistent_axis",
            "steering_strength": 1.0,
        },
    )
    assert bad_preset.status_code == 422

    # Non-zero steering strength with no direction -> 422
    no_dir = client.post(
        "/cases/search",
        json={
            "query": "fans",
            "steering_strength": 1.0,
        },
    )
    assert no_dir.status_code == 422

    # Presets endpoint
    presets_res = client.get("/cases/presets")
    assert presets_res.status_code == 200
    assert len(presets_res.json()) >= 4

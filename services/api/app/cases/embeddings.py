"""Deterministic CPU-compatible local text embedding engine for SETUVYUHA (PS5).

Uses pure-Python blake2b feature hashing (word unigrams, bigrams, and character
trigrams) combined with interpretable logistics concept axes into a fixed 64-D
L2-normalized vector space. Zero external network calls or paid APIs required.
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import Any, Sequence

EMBEDDING_DIM = 64
HASH_DIMS = 48
CONCEPT_START = 48

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

# 16 interpretable logistics concept axes (indices 48..63)
CONCEPT_AXES: dict[str, tuple[int, tuple[str, ...]]] = {
    "split_delivery": (48, ("split", "partial", "staged", "batch", "two-part", "40", "10")),
    "single_load": (49, ("single", "together", "all-together", "consolidated", "strict", "insist")),
    "urgent_deadline": (50, ("urgent", "immediate", "friday", "deadline", "emergency", "opening", "asap")),
    "later_consolidation": (51, ("later", "tuesday", "postpone", "defer", "wait", "consolidated")),
    "inter_hub_recovery": (52, ("recovery", "inter-hub", "scan", "transfer", "reroute", "re-route", "shortage")),
    "udupi_hub": (53, ("udupi", "udupi-central")),
    "mangalore_hub": (54, ("mangalore", "mangalore-depot", "buffer")),
    "bengaluru_hub": (55, ("bengaluru", "bangalore")),
    "manipal_dest": (56, ("manipal", "kundapura", "brahmavar", "shop")),
    "industrial_fan": (57, ("fan", "fans", "pedestal", "industrial", "fan-hv-24-ind", "exhibition")),
    "agricultural_pump": (58, ("pump", "pumps", "submersible", "agricultural", "pmp-sub-05-agr", "irrigation")),
    "stock_shortage": (59, ("shortage", "reconciliation", "count", "missing", "backlog", "delay", "delayed")),
    "ambiguity_clarification": (60, ("ambiguous", "ambiguity", "clarify", "clarification", "dispatch-vs-arrival")),
    "high_volume": (61, ("50", "60", "80", "100", "bulk", "commercial", "wholesale")),
    "small_batch": (62, ("5", "10", "12", "15", "small", "sample", "retail")),
    "coastal_route": (63, ("coastal", "highway", "nh66", "karnataka", "regional")),
}

STEERING_PRESETS: dict[str, dict[str, Any]] = {
    "split_delivery": {
        "label": "Split Delivery Focus",
        "description": "Steer retrieval toward staged/split fulfilment cases with partial immediate dispatch.",
        "weights": {48: 1.0, 59: 0.45, 53: 0.3, 49: -0.55},
    },
    "single_load": {
        "label": "Single-Load / Strict Terms",
        "description": "Steer toward consolidated single-shipment cases where all units must arrive together.",
        "weights": {49: 1.0, 50: 0.4, 48: -0.6},
    },
    "later_consolidation": {
        "label": "Later Consolidation",
        "description": "Steer toward deferred single-delivery schedules that avoid split drops.",
        "weights": {51: 1.0, 49: 0.55, 50: -0.45},
    },
    "inter_hub_recovery": {
        "label": "Emergency Inter-Hub Recovery",
        "description": "Steer toward cross-depot recovery scans and buffer stock transfers.",
        "weights": {52: 1.0, 59: 0.65, 54: 0.4, 55: 0.35},
    },
    "urgent_deadline": {
        "label": "Urgent Deadline Priority",
        "description": "Steer toward time-critical dispatches and same-week fulfilment.",
        "weights": {50: 1.0, 48: 0.3, 51: -0.5},
    },
}


@dataclass(frozen=True)
class EmbeddingResult:
    """Result of embedding a single text input."""

    vector: list[float]
    is_empty: bool
    warnings: list[str]


def _stable_hash_bucket(feature: str, num_buckets: int) -> tuple[int, float]:
    """Deterministically map a feature string to (bucket_index, sign)."""
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    val = int.from_bytes(digest[:4], "big")
    sign = 1.0 if (digest[4] & 1) == 0 else -1.0
    return val % num_buckets, sign


def l2_normalize(vector: Sequence[float]) -> list[float]:
    """Return L2-normalized copy of a vector, preserving zero vectors safely."""
    norm_sq = sum(v * v for v in vector)
    if norm_sq <= 0.0:
        return [0.0 for _ in vector]
    norm = math.sqrt(norm_sq)
    return [round(v / norm, 8) for v in vector]


def validate_embedding_vector(vector: Sequence[Any], expected_dim: int = EMBEDDING_DIM) -> list[float]:
    """Validate dimension and finite numeric values of an embedding or steering vector."""
    if len(vector) != expected_dim:
        raise ValueError(
            f"Vector dimension mismatch: expected {expected_dim}, got {len(vector)}."
        )
    validated: list[float] = []
    for idx, item in enumerate(vector):
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise ValueError(f"Vector element at index {idx} must be a finite number.")
        fval = float(item)
        if not math.isfinite(fval):
            raise ValueError(f"Vector element at index {idx} is non-finite ({item}).")
        validated.append(fval)
    return validated


def cosine_similarity(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
    """Compute cosine similarity between two equal-dimension vectors safely."""
    a = validate_embedding_vector(vec_a, EMBEDDING_DIM)
    b = validate_embedding_vector(vec_b, EMBEDDING_DIM)
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a <= 1e-12 or norm_b <= 1e-12:
        return 0.0
    score = dot / (norm_a * norm_b)
    return round(max(-1.0, min(1.0, score)), 6)


class LocalEmbeddingEngine:
    """Pure-Python deterministic local text embedding generator."""

    def __init__(self, dimension: int = EMBEDDING_DIM) -> None:
        if dimension != EMBEDDING_DIM:
            raise ValueError(f"LocalEmbeddingEngine requires dimension={EMBEDDING_DIM}.")
        self.dimension = dimension

    def embed_text(self, text: Any) -> EmbeddingResult:
        """Generate a deterministic 64-D L2-normalized embedding for text."""
        warnings: list[str] = []
        if text is None or not isinstance(text, str):
            warnings.append("Malformed or non-string text input; returning zero embedding vector.")
            return EmbeddingResult(vector=[0.0] * self.dimension, is_empty=True, warnings=warnings)

        cleaned = text.strip().lower()
        if not cleaned:
            warnings.append("Empty text input; returning zero embedding vector.")
            return EmbeddingResult(vector=[0.0] * self.dimension, is_empty=True, warnings=warnings)

        tokens = _TOKEN_RE.findall(cleaned)
        if not tokens:
            warnings.append("No alphanumeric tokens found in text; returning zero embedding vector.")
            return EmbeddingResult(vector=[0.0] * self.dimension, is_empty=True, warnings=warnings)

        raw = [0.0] * self.dimension

        # 1. Word unigrams (weight 1.0)
        token_counts: dict[str, int] = {}
        for tok in tokens:
            token_counts[tok] = token_counts.get(tok, 0) + 1

        for tok, count in token_counts.items():
            tf = 1.0 + math.log(count)
            bucket, sign = _stable_hash_bucket(f"w:{tok}", HASH_DIMS)
            raw[bucket] += sign * tf

        # 2. Word bigrams (weight 0.85)
        for i in range(len(tokens) - 1):
            bigram = f"b:{tokens[i]}_{tokens[i + 1]}"
            bucket, sign = _stable_hash_bucket(bigram, HASH_DIMS)
            raw[bucket] += sign * 0.85

        # 3. Character trigrams for typo/prefix resilience (weight 0.35)
        compact = " ".join(tokens)
        if len(compact) >= 3:
            for i in range(len(compact) - 2):
                trigram = f"c:{compact[i:i + 3]}"
                bucket, sign = _stable_hash_bucket(trigram, HASH_DIMS)
                raw[bucket] += sign * 0.35

        # 4. Interpretable logistics concept axes (dims 48..63)
        token_set = set(tokens)
        for _concept_name, (axis_idx, keywords) in CONCEPT_AXES.items():
            hits = sum(1 for kw in keywords if kw in token_set or (len(kw) > 3 and kw in cleaned))
            if hits > 0:
                raw[axis_idx] += min(2.2, 0.85 + 0.45 * hits)

        return EmbeddingResult(vector=l2_normalize(raw), is_empty=False, warnings=warnings)

    def get_steering_preset_vector(self, preset_id: str) -> list[float]:
        """Return a normalized steering vector for a named preset."""
        key = preset_id.strip().lower()
        if key not in STEERING_PRESETS:
            available = ", ".join(sorted(STEERING_PRESETS))
            raise ValueError(f"Unknown steering_direction '{preset_id}'. Available: {available}.")
        raw = [0.0] * self.dimension
        for idx, weight in STEERING_PRESETS[key]["weights"].items():
            raw[idx] = float(weight)
        return l2_normalize(raw)

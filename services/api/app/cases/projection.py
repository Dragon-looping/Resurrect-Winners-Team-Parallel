"""Fixed, reproducible 2D projection for visualizing case embeddings (PS5).

Never randomly regenerated across requests. Keeps original 64-D embeddings
completely separate from visualization coordinates.
"""

from __future__ import annotations

import hashlib
import math
from typing import Sequence

from app.cases.embeddings import EMBEDDING_DIM, validate_embedding_vector


def _build_fixed_basis() -> tuple[list[float], list[float]]:
    """Construct two deterministic orthogonal 64-D projection axes."""
    axis_x = [0.0] * EMBEDDING_DIM
    axis_y = [0.0] * EMBEDDING_DIM

    # Deterministic pseudo-random weights for hashed dims 0..47
    for idx in range(48):
        hx = hashlib.blake2b(f"proj_x_{idx}".encode("utf-8"), digest_size=4).digest()
        hy = hashlib.blake2b(f"proj_y_{idx}".encode("utf-8"), digest_size=4).digest()
        axis_x[idx] = ((int.from_bytes(hx, "big") % 2001) - 1000) / 5000.0
        axis_y[idx] = ((int.from_bytes(hy, "big") % 2001) - 1000) / 5000.0

    # Semantic anchors on concept dims 48..63 so logistics clusters separate cleanly
    # X-axis: Split/Recovery (-/+) vs Single-Load/Later
    axis_x[48] = -0.85  # split_delivery -> left
    axis_x[49] = 0.85   # single_load -> right
    axis_x[51] = 0.70   # later_consolidation -> right
    axis_x[52] = -0.55  # inter_hub_recovery -> left
    axis_x[59] = -0.45  # stock_shortage -> left
    axis_x[60] = 0.30   # ambiguity_clarification

    # Y-axis: Urgent/Coastal (+) vs Buffer/Hub-Transfer (-)
    axis_y[50] = 0.85   # urgent_deadline -> top
    axis_y[56] = 0.45   # manipal_dest -> top
    axis_y[57] = 0.35   # industrial_fan
    axis_y[58] = -0.40  # agricultural_pump
    axis_y[54] = -0.55  # mangalore_hub -> bottom
    axis_y[55] = -0.70  # bengaluru_hub -> bottom
    axis_y[51] = -0.45  # later_consolidation -> bottom

    # Gram-Schmidt orthogonalization & normalization
    norm_x = math.sqrt(sum(v * v for v in axis_x))
    axis_x = [v / norm_x for v in axis_x]

    dot_xy = sum(x * y for x, y in zip(axis_x, axis_y))
    axis_y = [y - dot_xy * x for x, y in zip(axis_x, axis_y)]
    norm_y = math.sqrt(sum(v * v for v in axis_y))
    axis_y = [v / norm_y for v in axis_y]

    return axis_x, axis_y


_FIXED_AXIS_X, _FIXED_AXIS_Y = _build_fixed_basis()


class Fixed2DProjector:
    """Stable, deterministic 2D linear projector for 64-D embeddings."""

    def __init__(self) -> None:
        self._axis_x = _FIXED_AXIS_X
        self._axis_y = _FIXED_AXIS_Y

    def project(self, vector: Sequence[float]) -> tuple[float, float]:
        """Project a single 64-D embedding vector to fixed 2D coordinates."""
        vec = validate_embedding_vector(vector, EMBEDDING_DIM)
        if sum(v * v for v in vec) <= 1e-12:
            return (0.0, 0.0)
        x = sum(v * ax for v, ax in zip(vec, self._axis_x))
        y = sum(v * ay for v, ay in zip(vec, self._axis_y))
        return (round(x, 6), round(y, 6))

    def project_batch(self, vectors: Sequence[Sequence[float]]) -> list[tuple[float, float]]:
        """Project a batch of vectors independently so coordinates never shift with corpus size."""
        return [self.project(vec) for vec in vectors]

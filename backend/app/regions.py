import json
from functools import lru_cache
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


@lru_cache
def list_regions() -> tuple[dict, ...]:
    return tuple(json.loads((ROOT / "shared" / "regions.json").read_text(encoding="utf-8")))


def get_region(slug: str) -> dict | None:
    return next((region for region in list_regions() if region["slug"] == slug), None)

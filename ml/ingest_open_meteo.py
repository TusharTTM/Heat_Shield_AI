#!/usr/bin/env python3
"""Retrieve and validate real Open-Meteo archive/current data; never synthesize rows."""
from __future__ import annotations

import argparse
import concurrent.futures
import csv
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REGIONS = json.loads((ROOT / "shared" / "regions.json").read_text(encoding="utf-8"))
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DAILY_FIELDS = [
    "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
    "apparent_temperature_max", "apparent_temperature_min", "apparent_temperature_mean",
    "relative_humidity_2m_mean", "wind_speed_10m_max", "precipitation_sum", "shortwave_radiation_sum",
]
RANGES = {
    "temperature_2m_max": (-70, 65), "temperature_2m_min": (-80, 60), "temperature_2m_mean": (-75, 60),
    "relative_humidity_2m_mean": (0, 100), "wind_speed_10m_max": (0, 200),
    "precipitation_sum": (0, 2000), "shortwave_radiation_sum": (0, 100),
}


def request_json(url: str, attempts: int = 5) -> dict[str, Any]:
    detail = "unknown error"
    for attempt in range(attempts):
        retry_delay = 2 ** attempt
        try:
            request = Request(url, headers={"User-Agent": "HeatShieldAI-Academic/1.0"})
            with urlopen(request, timeout=60) as response:  # fixed provider URLs; no user-supplied host
                if response.status != 200:
                    raise RuntimeError("Provider returned a non-200 response")
                return json.load(response)
        except HTTPError as exc:
            detail = f"HTTP {exc.code}"
            if 400 <= exc.code < 500 and exc.code != 429:
                break
            try:
                retry_delay = max(1, int(exc.headers.get("Retry-After", retry_delay)))
            except ValueError:
                pass
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            reason = getattr(exc, "reason", exc)
            detail = f"{type(reason).__name__}: {reason}"[:240]
        if attempt + 1 < attempts:
            time.sleep(retry_delay)
    raise RuntimeError(f"Weather provider request failed: {detail}")


def fetch_region(region: dict[str, Any], start: str, end: str) -> tuple[list[dict], dict]:
    query = urlencode({
        "latitude": region["latitude"], "longitude": region["longitude"], "start_date": start, "end_date": end,
        "daily": ",".join(DAILY_FIELDS), "timezone": "Asia/Kolkata", "temperature_unit": "celsius", "wind_speed_unit": "kmh",
    })
    url = f"{ARCHIVE_URL}?{query}"
    payload = request_json(url)
    daily = payload.get("daily", {})
    times = daily.get("time", [])
    if not times:
        raise RuntimeError(f"No archive observations returned for {region['slug']}")
    rows: list[dict] = []
    seen: set[str] = set()
    for index, day in enumerate(times):
        datetime.strptime(day, "%Y-%m-%d")
        if day in seen:
            continue
        seen.add(day)
        row: dict[str, Any] = {
            "region": region["slug"], "date": day, "latitude": payload["latitude"], "longitude": payload["longitude"],
            "elevation_m": payload.get("elevation"), "timezone": payload["timezone"], "source": "Open-Meteo Historical Weather API",
        }
        for field in DAILY_FIELDS:
            values = daily.get(field, [None] * len(times))
            value = values[index] if index < len(values) else None
            if value is not None and field in RANGES:
                low, high = RANGES[field]
                if not low <= float(value) <= high:
                    raise RuntimeError(f"Out-of-range {field} for {region['slug']} {day}")
            row[field] = value
        if row["temperature_2m_max"] is None:
            raise RuntimeError(f"Missing maximum temperature for {region['slug']} {day}")
        rows.append(row)
    metadata = {
        "region": region["slug"], "requested_coordinates": [region["latitude"], region["longitude"]],
        "provider_coordinates": [payload["latitude"], payload["longitude"]], "rows": len(rows),
        "source_url": url, "units": payload.get("daily_units", {}),
    }
    return rows, metadata


def fetch_current(region: dict[str, Any]) -> dict[str, Any]:
    query = urlencode({
        "latitude": region["latitude"], "longitude": region["longitude"],
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
        "hourly": "uv_index", "timezone": "Asia/Kolkata", "forecast_days": 1,
    })
    url = f"{FORECAST_URL}?{query}"
    payload = request_json(url)
    current_hour = payload.get("current", {}).get("time", "")[:13]
    uv = None
    for index, value in enumerate(payload.get("hourly", {}).get("time", [])):
        uv_values = payload.get("hourly", {}).get("uv_index", [])
        if value[:13] == current_hour and index < len(uv_values):
            uv = uv_values[index]
            break
    return {
        "region": region["slug"], "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source_url": url, "source": "Open-Meteo forecast/current API", "payload": payload,
        "uv_index_at_current_hour": uv,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", default="2016-01-01")
    parser.add_argument("--end", default="2025-12-31")
    parser.add_argument("--output", type=Path, default=ROOT / "ml" / "datasets")
    parser.add_argument("--current-snapshots", action="store_true")
    args = parser.parse_args()
    if date.fromisoformat(args.start) >= date.fromisoformat(args.end):
        parser.error("--start must be before --end")
    args.output.mkdir(parents=True, exist_ok=True)
    all_rows: list[dict] = []
    metadata: list[dict] = []
    failures: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(fetch_region, region, args.start, args.end): region for region in REGIONS}
        for future in concurrent.futures.as_completed(futures):
            region = futures[future]
            try:
                rows, meta = future.result()
                all_rows.extend(rows)
                metadata.append(meta)
                print(f"{region['slug']}: {len(rows)} validated rows", flush=True)
            except Exception as exc:
                failures.append(f"{region['slug']}: {type(exc).__name__}: {exc}")
                print(f"ERROR {failures[-1]}", flush=True)
    all_rows.sort(key=lambda row: (row["region"], row["date"]))
    output_csv = args.output / "open_meteo_daily.csv"
    fields = ["region", "date", "latitude", "longitude", "elevation_m", "timezone", "source", *DAILY_FIELDS]
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(all_rows)
    retrieved = datetime.now(timezone.utc).isoformat()
    document = {
        "retrieved_at": retrieved, "start": args.start, "end": args.end, "provider": "Open-Meteo",
        "dataset_type": "historical_weather_reanalysis", "license": "CC BY 4.0; see https://open-meteo.com/en/license",
        "regions": sorted(metadata, key=lambda item: item["region"]), "failures": failures,
        "sha256": hashlib.sha256(output_csv.read_bytes()).hexdigest(),
    }
    (args.output / "ingestion_metadata.json").write_text(json.dumps(document, indent=2), encoding="utf-8")
    if args.current_snapshots:
        snapshots = []
        for region in REGIONS:
            try:
                snapshots.append(fetch_current(region))
            except Exception as exc:
                failures.append(f"current {region['slug']}: {type(exc).__name__}: {exc}")
        (args.output / "current_snapshots.json").write_text(json.dumps(snapshots, indent=2), encoding="utf-8")
        document["failures"] = failures
        (args.output / "ingestion_metadata.json").write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_rows)} rows; sha256={document['sha256']}")
    if failures:
        if os.getenv("GITHUB_ACTIONS") == "true":
            for failure in failures:
                annotation = failure.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
                print(f"::error::{annotation}", flush=True)
        print("Ingestion incomplete:\n" + "\n".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

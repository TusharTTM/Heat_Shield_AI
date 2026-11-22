"""Timestamp parsing tests.

Every freshness, expiry and deduplication decision depends on these two
converters. A wrong zone constant would shift every CPCB observation by 5h30m
and silently relabel stale data as current, so the conversions are pinned
explicitly rather than only exercised indirectly through fixtures.
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.app.cpcb import IST, _observation_time
from backend.app.time_utils import as_utc, utc_now
from backend.app.weather import WeatherProviderError, _parse_provider_time

IST_OFFSET = timedelta(hours=5, minutes=30)


def test_cpcb_zone_is_india_standard_time():
    assert datetime(2026, 11, 16, tzinfo=IST).utcoffset() == IST_OFFSET


@pytest.mark.parametrize("text", [
    "16-11-2026 12:00:00",
    "16-11-2026 12:00:00 ",
    "16-11-2026 12:00:00.000",
])
def test_cpcb_dd_mm_yyyy_timestamps_are_interpreted_as_ist(text):
    assert _observation_time(text) == datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc)


def test_iso_cpcb_timestamps_are_converted_not_reinterpreted():
    assert _observation_time("2026-11-16T12:00:00Z") == datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
    assert _observation_time("2026-11-16T12:00:00+05:30") == datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc)
    # A naive ISO string is station-local time, not UTC.
    assert _observation_time("2026-11-16T12:00:00") == datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize("text", ["", "   ", "not-a-date", "2026-13-45T99:99:99"])
def test_invalid_cpcb_timestamps_raise_value_error(text):
    with pytest.raises(ValueError):
        _observation_time(text)


def test_provider_local_time_is_offset_by_reported_utc_offset():
    # Open-Meteo returns local wall clock plus utc_offset_seconds; 17:30 IST is 12:00Z.
    parsed = _parse_provider_time("2026-11-16T17:30", 19800)
    assert parsed == datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
    # An explicit zone in the payload is respected and must not be double-shifted.
    assert _parse_provider_time("2026-11-16T12:00:00Z", 19800) == datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
    assert _parse_provider_time("2026-11-16T12:00:00+00:00", 19800) == datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize("value", ["", "not-a-time"])
def test_invalid_provider_times_are_provider_errors(value):
    with pytest.raises(WeatherProviderError):
        _parse_provider_time(value, 19800)


def test_as_utc_normalises_naive_values_without_shifting_aware_ones():
    naive = datetime(2026, 11, 16, 12, 0)
    assert as_utc(naive) == datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
    aware = datetime(2026, 11, 16, 12, 0, tzinfo=IST)
    assert as_utc(aware) == datetime(2026, 11, 16, 6, 30, tzinfo=timezone.utc)
    assert as_utc(utc_now()).tzinfo == timezone.utc

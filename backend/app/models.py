from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class WeatherObservation(Base):
    __tablename__ = "weather_observations"
    __table_args__ = (UniqueConstraint("region_slug", "observed_at", "source", name="uq_weather_region_time_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_slug: Mapped[str] = mapped_column(String(64), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    apparent_temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(120))
    provider_payload: Mapped[dict] = mapped_column(JSON, default=dict)


class ForecastRecord(Base):
    __tablename__ = "forecast_records"
    __table_args__ = (UniqueConstraint("region_slug", "forecast_for", "source", name="uq_forecast_region_day_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_slug: Mapped[str] = mapped_column(String(64), index=True)
    forecast_for: Mapped[date] = mapped_column(Date, index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    temperature_max_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_min_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity_mean_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed_max_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(120))


class AirQualityObservation(Base):
    __tablename__ = "air_quality_observations"
    __table_args__ = (UniqueConstraint("region_slug", "model_time", "source", name="uq_air_quality_region_time_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_slug: Mapped[str] = mapped_column(String(64), index=True)
    model_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    us_aqi: Mapped[float | None] = mapped_column(Float, nullable=True)
    european_aqi: Mapped[float | None] = mapped_column(Float, nullable=True)
    pm10: Mapped[float | None] = mapped_column(Float, nullable=True)
    pm2_5: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbon_monoxide: Mapped[float | None] = mapped_column(Float, nullable=True)
    nitrogen_dioxide: Mapped[float | None] = mapped_column(Float, nullable=True)
    sulphur_dioxide: Mapped[float | None] = mapped_column(Float, nullable=True)
    ozone: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(120))
    provider_payload: Mapped[dict] = mapped_column(JSON, default=dict)


class AirQualityForecastHour(Base):
    __tablename__ = "air_quality_forecast_hours"
    __table_args__ = (UniqueConstraint("region_slug", "model_time", "source", name="uq_air_quality_hour_region_time_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_slug: Mapped[str] = mapped_column(String(64), index=True)
    model_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    us_aqi: Mapped[float | None] = mapped_column(Float, nullable=True)
    european_aqi: Mapped[float | None] = mapped_column(Float, nullable=True)
    pm10: Mapped[float | None] = mapped_column(Float, nullable=True)
    pm2_5: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbon_monoxide: Mapped[float | None] = mapped_column(Float, nullable=True)
    nitrogen_dioxide: Mapped[float | None] = mapped_column(Float, nullable=True)
    sulphur_dioxide: Mapped[float | None] = mapped_column(Float, nullable=True)
    ozone: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(120))


class OfficialAirQualityFetch(Base):
    __tablename__ = "official_air_quality_fetches"

    region_slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    records_read: Mapped[int] = mapped_column(Integer, default=0)
    invalid_records: Mapped[int] = mapped_column(Integer, default=0)
    observation_count: Mapped[int] = mapped_column(Integer, default=0)


class OfficialAirQualityObservation(Base):
    __tablename__ = "official_air_quality_observations"
    __table_args__ = (UniqueConstraint("region_slug", "station", "observed_at", name="uq_official_aq_region_station_time"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_slug: Mapped[str] = mapped_column(String(64), index=True)
    country: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(120), index=True)
    station: Mapped[str] = mapped_column(String(300))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    aqi: Mapped[float | None] = mapped_column(Float, nullable=True)
    pollutants: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(200))


class ExternalDocumentCache(Base):
    __tablename__ = "external_document_cache"

    url: Mapped[str] = mapped_column(String(1200), primary_key=True)
    source: Mapped[str] = mapped_column(String(80))
    etag: Mapped[str | None] = mapped_column(String(512), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OfficialAlertFetch(Base):
    __tablename__ = "official_alert_fetches"

    feed_url: Mapped[str] = mapped_column(String(1200), primary_key=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    current_identifiers: Mapped[list] = mapped_column(JSON, default=list)
    invalid_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    retrieval_complete: Mapped[bool] = mapped_column(Boolean, default=True)
    stale_cache_used: Mapped[bool] = mapped_column(Boolean, default=False)


class OfficialAlert(Base):
    __tablename__ = "official_alerts"
    __table_args__ = (UniqueConstraint("identifier", "sender", name="uq_official_alert_identifier_sender"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    identifier: Mapped[str] = mapped_column(String(160), index=True)
    sender: Mapped[str] = mapped_column(String(300))
    sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30))
    msg_type: Mapped[str] = mapped_column(String(30))
    scope: Mapped[str] = mapped_column(String(30))
    references: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    event: Mapped[str | None] = mapped_column(String(300), nullable=True)
    urgency: Mapped[str | None] = mapped_column(String(40), nullable=True)
    severity: Mapped[str | None] = mapped_column(String(40), nullable=True)
    certainty: Mapped[str | None] = mapped_column(String(40), nullable=True)
    effective: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    onset: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    headline: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    areas: Mapped[list] = mapped_column(JSON, default=list)
    polygons: Mapped[list] = mapped_column(JSON, default=list)
    info_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    source_url: Mapped[str] = mapped_column(String(1200))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_in_feed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (UniqueConstraint("device_id", "observed_at", name="uq_sensor_device_time"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    temperature_c: Mapped[float] = mapped_column(Float)
    humidity_pct: Mapped[float] = mapped_column(Float)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

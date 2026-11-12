-- Initial PostgreSQL schema for a new HeatShield AI database.
-- PostGIS may be enabled by a privileged operator for future spatial queries:
-- CREATE EXTENSION IF NOT EXISTS postgis;
-- The current API uses shared scalar coordinates and does not claim PostGIS queries.

CREATE TABLE IF NOT EXISTS weather_observations (
    id SERIAL PRIMARY KEY,
    region_slug VARCHAR(64) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    temperature_c DOUBLE PRECISION,
    humidity_pct DOUBLE PRECISION,
    wind_speed_kmh DOUBLE PRECISION,
    apparent_temperature_c DOUBLE PRECISION,
    weather_code INTEGER,
    source VARCHAR(120) NOT NULL,
    provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_weather_region_time_source UNIQUE (region_slug, observed_at, source)
);
CREATE INDEX IF NOT EXISTS ix_weather_observations_region_slug ON weather_observations (region_slug);
CREATE INDEX IF NOT EXISTS ix_weather_observations_observed_at ON weather_observations (observed_at);

CREATE TABLE IF NOT EXISTS forecast_records (
    id SERIAL PRIMARY KEY,
    region_slug VARCHAR(64) NOT NULL,
    forecast_for DATE NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    temperature_max_c DOUBLE PRECISION,
    temperature_min_c DOUBLE PRECISION,
    humidity_mean_pct DOUBLE PRECISION,
    wind_speed_max_kmh DOUBLE PRECISION,
    precipitation_mm DOUBLE PRECISION,
    weather_code INTEGER,
    source VARCHAR(120) NOT NULL,
    CONSTRAINT uq_forecast_region_day_source UNIQUE (region_slug, forecast_for, source)
);
CREATE INDEX IF NOT EXISTS ix_forecast_records_region_slug ON forecast_records (region_slug);
CREATE INDEX IF NOT EXISTS ix_forecast_records_forecast_for ON forecast_records (forecast_for);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    temperature_c DOUBLE PRECISION NOT NULL,
    humidity_pct DOUBLE PRECISION NOT NULL,
    wind_speed_kmh DOUBLE PRECISION,
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    CONSTRAINT uq_sensor_device_time UNIQUE (device_id, observed_at),
    CONSTRAINT ck_sensor_temperature CHECK (temperature_c BETWEEN -50 AND 70),
    CONSTRAINT ck_sensor_humidity CHECK (humidity_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_sensor_wind CHECK (wind_speed_kmh IS NULL OR wind_speed_kmh BETWEEN 0 AND 200)
);
CREATE INDEX IF NOT EXISTS ix_sensor_readings_device_id ON sensor_readings (device_id);
CREATE INDEX IF NOT EXISTS ix_sensor_readings_observed_at ON sensor_readings (observed_at);
CREATE INDEX IF NOT EXISTS ix_sensor_readings_is_simulated ON sensor_readings (is_simulated);

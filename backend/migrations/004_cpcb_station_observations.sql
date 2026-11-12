-- CPCB observations retrieved through Open Government Data Platform India.
-- Pollutant values and units remain as supplied; missing Indian AQI is never calculated here.
CREATE TABLE IF NOT EXISTS official_air_quality_fetches (
    region_slug VARCHAR(64) PRIMARY KEY,
    retrieved_at TIMESTAMPTZ NOT NULL,
    records_read INTEGER NOT NULL DEFAULT 0,
    invalid_records INTEGER NOT NULL DEFAULT 0,
    observation_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS official_air_quality_observations (
    id SERIAL PRIMARY KEY,
    region_slug VARCHAR(64) NOT NULL,
    country VARCHAR(100) NOT NULL,
    state VARCHAR(120) NOT NULL,
    city VARCHAR(120) NOT NULL,
    station VARCHAR(300) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    aqi DOUBLE PRECISION,
    pollutants JSONB NOT NULL DEFAULT '{}'::jsonb,
    source VARCHAR(200) NOT NULL,
    CONSTRAINT uq_official_aq_region_station_time UNIQUE (region_slug, station, observed_at),
    CONSTRAINT ck_official_aq_value CHECK (aqi IS NULL OR aqi BETWEEN 0 AND 1000)
);
CREATE INDEX IF NOT EXISTS ix_official_aq_region_slug ON official_air_quality_observations (region_slug);
CREATE INDEX IF NOT EXISTS ix_official_aq_city ON official_air_quality_observations (city);
CREATE INDEX IF NOT EXISTS ix_official_aq_observed_at ON official_air_quality_observations (observed_at);

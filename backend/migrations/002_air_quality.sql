-- CAMS/Open-Meteo model estimates. These rows are not CPCB station observations.
CREATE TABLE IF NOT EXISTS air_quality_observations (
    id SERIAL PRIMARY KEY,
    region_slug VARCHAR(64) NOT NULL,
    model_time TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    us_aqi DOUBLE PRECISION,
    pm10 DOUBLE PRECISION,
    pm2_5 DOUBLE PRECISION,
    carbon_monoxide DOUBLE PRECISION,
    nitrogen_dioxide DOUBLE PRECISION,
    sulphur_dioxide DOUBLE PRECISION,
    ozone DOUBLE PRECISION,
    source VARCHAR(120) NOT NULL,
    provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_air_quality_region_time_source UNIQUE (region_slug, model_time, source),
    CONSTRAINT ck_air_quality_us_aqi CHECK (us_aqi IS NULL OR us_aqi BETWEEN 0 AND 1000),
    CONSTRAINT ck_air_quality_pm10 CHECK (pm10 IS NULL OR pm10 BETWEEN 0 AND 5000),
    CONSTRAINT ck_air_quality_pm2_5 CHECK (pm2_5 IS NULL OR pm2_5 BETWEEN 0 AND 5000),
    CONSTRAINT ck_air_quality_co CHECK (carbon_monoxide IS NULL OR carbon_monoxide BETWEEN 0 AND 20000),
    CONSTRAINT ck_air_quality_no2 CHECK (nitrogen_dioxide IS NULL OR nitrogen_dioxide BETWEEN 0 AND 2000),
    CONSTRAINT ck_air_quality_so2 CHECK (sulphur_dioxide IS NULL OR sulphur_dioxide BETWEEN 0 AND 2000),
    CONSTRAINT ck_air_quality_o3 CHECK (ozone IS NULL OR ozone BETWEEN 0 AND 2000)
);
CREATE INDEX IF NOT EXISTS ix_air_quality_observations_region_slug ON air_quality_observations (region_slug);
CREATE INDEX IF NOT EXISTS ix_air_quality_observations_model_time ON air_quality_observations (model_time);

-- Open-Meteo/CAMS model estimates only; these are not CPCB station observations.
ALTER TABLE air_quality_observations
    ADD COLUMN IF NOT EXISTS european_aqi DOUBLE PRECISION;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_air_quality_european_aqi'
    ) THEN
        ALTER TABLE air_quality_observations
            ADD CONSTRAINT ck_air_quality_european_aqi
            CHECK (european_aqi IS NULL OR european_aqi BETWEEN 0 AND 1000);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS air_quality_forecast_hours (
    id SERIAL PRIMARY KEY,
    region_slug VARCHAR(64) NOT NULL,
    model_time TIMESTAMPTZ NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    us_aqi DOUBLE PRECISION,
    european_aqi DOUBLE PRECISION,
    pm10 DOUBLE PRECISION,
    pm2_5 DOUBLE PRECISION,
    carbon_monoxide DOUBLE PRECISION,
    nitrogen_dioxide DOUBLE PRECISION,
    sulphur_dioxide DOUBLE PRECISION,
    ozone DOUBLE PRECISION,
    source VARCHAR(120) NOT NULL,
    CONSTRAINT uq_air_quality_hour_region_time_source UNIQUE (region_slug, model_time, source),
    CONSTRAINT ck_air_quality_hour_us_aqi CHECK (us_aqi IS NULL OR us_aqi BETWEEN 0 AND 1000),
    CONSTRAINT ck_air_quality_hour_european_aqi CHECK (european_aqi IS NULL OR european_aqi BETWEEN 0 AND 1000),
    CONSTRAINT ck_air_quality_hour_pm10 CHECK (pm10 IS NULL OR pm10 BETWEEN 0 AND 5000),
    CONSTRAINT ck_air_quality_hour_pm2_5 CHECK (pm2_5 IS NULL OR pm2_5 BETWEEN 0 AND 5000),
    CONSTRAINT ck_air_quality_hour_co CHECK (carbon_monoxide IS NULL OR carbon_monoxide BETWEEN 0 AND 20000),
    CONSTRAINT ck_air_quality_hour_no2 CHECK (nitrogen_dioxide IS NULL OR nitrogen_dioxide BETWEEN 0 AND 2000),
    CONSTRAINT ck_air_quality_hour_so2 CHECK (sulphur_dioxide IS NULL OR sulphur_dioxide BETWEEN 0 AND 2000),
    CONSTRAINT ck_air_quality_hour_o3 CHECK (ozone IS NULL OR ozone BETWEEN 0 AND 2000)
);
CREATE INDEX IF NOT EXISTS ix_air_quality_forecast_hours_region_slug ON air_quality_forecast_hours (region_slug);
CREATE INDEX IF NOT EXISTS ix_air_quality_forecast_hours_model_time ON air_quality_forecast_hours (model_time);

-- Persistent conditional-request cache required by NDMA's CAP integration guide.
CREATE TABLE IF NOT EXISTS external_document_cache (
    url VARCHAR(1200) PRIMARY KEY,
    source VARCHAR(80) NOT NULL,
    etag VARCHAR(512),
    body TEXT NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS official_alert_fetches (
    feed_url VARCHAR(1200) PRIMARY KEY,
    retrieved_at TIMESTAMPTZ NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    current_identifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    invalid_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    retrieval_complete BOOLEAN NOT NULL DEFAULT TRUE,
    stale_cache_used BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS official_alerts (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(160) NOT NULL,
    sender VARCHAR(300) NOT NULL,
    sent TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL,
    msg_type VARCHAR(30) NOT NULL,
    scope VARCHAR(30) NOT NULL,
    "references" TEXT NOT NULL DEFAULT '',
    language VARCHAR(40),
    sender_name VARCHAR(300),
    category VARCHAR(80),
    event VARCHAR(300),
    urgency VARCHAR(40),
    severity VARCHAR(40),
    certainty VARCHAR(40),
    effective TIMESTAMPTZ,
    onset TIMESTAMPTZ,
    expires TIMESTAMPTZ,
    headline TEXT,
    description TEXT,
    instruction TEXT,
    areas JSONB NOT NULL DEFAULT '[]'::jsonb,
    polygons JSONB NOT NULL DEFAULT '[]'::jsonb,
    info_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url VARCHAR(1200) NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    last_seen_in_feed_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_official_alert_identifier_sender UNIQUE (identifier, sender)
);
CREATE INDEX IF NOT EXISTS ix_official_alerts_identifier ON official_alerts (identifier);
CREATE INDEX IF NOT EXISTS ix_official_alerts_expires ON official_alerts (expires);

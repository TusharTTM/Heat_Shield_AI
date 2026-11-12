# Datasets — ingestion implemented, no real dataset bundled

`ml/ingest_open_meteo.py` now retrieves and validates real Open-Meteo archive/current data with source, license, units, coordinates, retrieval timestamps, and SHA-256 metadata. Generated CSV/JSON files are git-ignored.

No archive request succeeded in the local sandbox and no historical CSV is installed in Git. Automated local ingestion tests use explicit mocked provider payloads. Separately, GitHub run `42465620614` successfully retrieved 7,672 real rows for 2023–2025 and retained them as the temporary `heatshield-open-meteo-42465620614` CI artifact (expiration 8 December 2026). That external artifact is not a bundled dataset or PostgreSQL import. Frontend demonstration fixtures must never be copied here or used for training.

Run the commands in `ml/README.md` in an environment with provider network access. Partial/failed ingestion output is not eligible for model promotion.

# Model artifacts — none promoted

The chronological training/evaluation pipeline is implemented in `ml/training/`. No promoted model artifact is installed in this checkout. GitHub run `42465620614` produced and FastAPI-verified the real candidate `20261108T090518Z-7879b519d722` from source-backed 2023–2025 data. Its external CI artifact expires 8 December 2026; it is not committed, deployed, or a live accuracy guarantee.

`train.py` writes `temperature_model.joblib` and `temperature_model.metadata.json` only after executing all three model fits and chronological holdout evaluation. Joblib files are git-ignored; preserve validated artifacts and metadata in controlled external/model storage with their dataset hash and evaluation record.

Synthetic test artifacts are created only in temporary test directories, labelled `synthetic_pipeline_test`, and must never be deployed. Backend inference stays unavailable until a matching, reviewed real-data model/metadata pair is configured.

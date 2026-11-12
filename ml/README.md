# Historical data and machine learning

**Current boundary:** ingestion, chronological feature engineering, model comparison, evaluation, artifact writing/loading, inference explanation, and model-inferred hotspot utilities are implemented and tested. No real historical dataset or promoted model artifact is bundled. Local tests train on explicitly labelled synthetic fixtures only to verify software mechanics; their metrics are not weather-performance claims.

**Verified real 15-region candidate:** GitHub run `42579707328` retrieved **16,440 real Open-Meteo archive rows** across all **15 configured Indian locations** (`2023-01-01` through `2025-12-31`, `16,395` usable feature rows, `13,110` training rows `<= 2025-05-26`), evaluated all three models chronologically on **3,285 later rows** (`>= 2025-05-27`), and loaded the resulting candidate (`20261109T073141Z-9010a3bc4b8e`) through FastAPI for **15 regional predictions** and **5 `model_inferred` hotspots**:
- **Linear Regression:** MAE `0.8922°C`, RMSE `1.2354°C`, R² `0.8742`
- **Random Forest:** MAE `0.8891°C`, RMSE `1.2324°C`, R² `0.8748`
- **Gradient Boosting (selected, lowest RMSE):** MAE `0.8759°C`, RMSE `1.2156°C`, R² `0.8782`

(Earlier seven-region baseline run `42465620614` trained on `7,672` rows with Gradient Boosting MAE `0.8218°C`, RMSE `1.1471°C`, R² `0.8731`.) These are run-specific reanalysis holdout results, not a production accuracy guarantee. The candidate remains an external CI artifact, not an installed/promoted production service.

## 1. Retrieve real source-backed data

Open-Meteo archive data is historical weather/reanalysis, not physical sensor measurements. Provider access, applicable usage terms, and network egress are required.

```bash
python -m pip install -r ml/requirements-dev.txt
python ml/ingest_open_meteo.py --start 2016-01-01 --end 2025-12-31
```

Outputs are git-ignored:

- `ml/datasets/open_meteo_daily.csv`
- `ml/datasets/ingestion_metadata.json` (provider, license, coordinates, units, retrieval time, row counts, failures, SHA-256)

Failed regions are reported and make the command exit non-zero. Partial output and metadata are retained for diagnosis but are not promotion-eligible. Frontend demo fixtures are never copied into this pipeline.

## 2. Train and evaluate chronologically

```bash
python ml/training/train.py \
  --dataset ml/datasets/open_meteo_daily.csv \
  --metadata ml/datasets/ingestion_metadata.json \
  --output ml/saved_models
```

For each region/date, features use only the three preceding daily maximum temperatures, their shifted mean/standard deviation, seasonal sine/cosine, and a region category. The latest 20% of global feature dates is held out without shuffling. Linear Regression, Random Forest, and Gradient Boosting are compared using **MAE, RMSE, and R²**. The lowest-RMSE candidate is then refit on all feature rows.

The model and `temperature_model.metadata.json` share a dataset-hash/timestamp version. Metadata records the exact split, row counts, metrics, provenance match, limitations, and promotion eligibility. A real promoted model requires matching source metadata, `dataset_type=historical_weather_reanalysis`, and no ingestion failures, followed by human metric review.

## 3. Inference and hotspots

The backend loads only a model/metadata pair with matching versions. `POST /api/v1/ml/predict` accepts a configured region, target date, three prior maxima (oldest to newest), and optional humidity. It returns the predicted next-day maximum, artifact version, actual holdout metrics, and a plain-language explanation. It is explicitly not an official forecast.

Heat risk is deterministic NWS heat-index screening from predicted temperature and supplied humidity, not a learned risk classifier. `/api/v1/ml/hotspots` ranks model outputs and labels every item `model_inferred`; it does not claim observed geographic hotspot detection.

Without both artifact files, ML endpoints return `MODEL_UNAVAILABLE`. No accuracy, live ML dashboard, or trained deployment is claimed in this checkout.

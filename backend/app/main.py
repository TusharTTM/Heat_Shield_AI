import hmac
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .air_quality import AirQualityClient
from .air_quality_service import air_quality_history, current_air_quality, forecast_air_quality
from .config import Settings, get_settings
from .cpcb import CPCBClient
from .cpcb_service import current_official_air_quality, official_air_quality_history
from .db import Base, build_engine, build_session_factory, get_db
from .ml_service import ModelService, ModelUnavailable
from .models import SensorReading
from .regions import list_regions
from .risk import RECOMMENDATIONS, air_quality_risk_result, risk_result, safety_result
from .sachet import SachetClient
from .sachet_service import current_official_alerts
from .schemas import (
    AirQualityForecastResponse, AirQualityHistoryResponse, AirQualityResponse, AirQualityRiskResponse,
    CurrentWeatherResponse, ForecastResponse, HealthResponse, HistoryResponse, HotspotItem,
    OfficialAirQualityHistoryResponse, OfficialAirQualityResponse, OfficialAlertsResponse,
    PredictionRequest, PredictionResponse, RegionResponse, RiskResponse, SafetyResponse,
    SensorIngestResponse, SensorReadingCreate, SensorReadingResponse, SensorStatusResponse,
)
from .time_utils import as_utc, utc_now
from .weather import WeatherClient
from .weather_service import current_weather, forecast_weather, region_or_404, weather_history

logger = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None, weather_client: WeatherClient | None = None,
    air_quality_client: AirQualityClient | None = None, cpcb_client: CPCBClient | None = None,
    sachet_client: SachetClient | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
    engine = build_engine(settings.database_url)
    session_factory = build_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(bind=engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="HeatShield AI API", version="0.1.0", lifespan=lifespan,
        description="Source-aware weather and CAMS air-quality models, deterministic heat/AQI screening, optional ML inference, and authenticated sensor ingestion. No endpoint returns demo fixtures or model estimates as station observations.",
    )
    app.state.settings = settings
    app.state.SessionLocal = session_factory
    app.state.weather_client = weather_client or WeatherClient(settings.weather_base_url, settings.weather_timeout_seconds)
    app.state.air_quality_client = air_quality_client or AirQualityClient(settings.air_quality_base_url, settings.air_quality_timeout_seconds)
    app.state.cpcb_client = cpcb_client or CPCBClient(settings.cpcb_base_url, settings.data_gov_in_api_key, settings.cpcb_timeout_seconds)
    app.state.sachet_client = sachet_client or SachetClient(settings.sachet_feed_url, settings.sachet_timeout_seconds)
    app.state.model_service = ModelService(settings)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=False,
        allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Sensor-Key"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/v1/sensors"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        content = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "detail": str(exc.detail)}
        return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(content), headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content=jsonable_encoder({
            "code": "VALIDATION_ERROR", "detail": "Request validation failed", "errors": exc.errors(),
        }))

    @app.exception_handler(Exception)
    async def unhandled_error(_request: Request, exc: Exception):
        logger.exception("Unhandled API error: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"code": "INTERNAL_ERROR", "detail": "The request could not be completed."})

    def require_sensor_key(x_sensor_key: Annotated[str | None, Header(alias="X-Sensor-Key")] = None) -> None:
        if not settings.sensor_api_key:
            raise HTTPException(status_code=503, detail={"code": "SENSOR_AUTH_NOT_CONFIGURED", "detail": "Sensor authentication is not configured on this server."})
        if not x_sensor_key or not hmac.compare_digest(x_sensor_key, settings.sensor_api_key):
            raise HTTPException(status_code=401, detail={"code": "SENSOR_UNAUTHORIZED", "detail": "A valid sensor API key is required."}, headers={"WWW-Authenticate": "X-Sensor-Key"})

    def sensor_dict(reading: SensorReading) -> dict:
        return {
            "id": reading.id, "device_id": reading.device_id, "observed_at": as_utc(reading.observed_at),
            "received_at": as_utc(reading.received_at), "temperature_c": reading.temperature_c,
            "humidity_pct": reading.humidity_pct, "wind_speed_kmh": reading.wind_speed_kmh,
            "is_simulated": reading.is_simulated, "note": reading.note,
        }

    @app.get("/", include_in_schema=False)
    def root():
        return {"name": "HeatShield AI API", "documentation": "/docs", "health": "/api/v1/health"}

    @app.get("/api/v1/regions", response_model=list[RegionResponse], tags=["weather"])
    def regions():
        return list(list_regions())

    @app.get("/api/v1/weather/current/{slug}", response_model=CurrentWeatherResponse, tags=["weather"])
    def current(slug: str, db: Session = Depends(get_db)):
        return current_weather(db, slug, app.state.weather_client, settings)

    @app.get("/api/v1/weather/forecast/{slug}", response_model=ForecastResponse, tags=["weather"])
    def forecast(slug: str, db: Session = Depends(get_db)):
        return forecast_weather(db, slug, app.state.weather_client, settings)

    @app.get("/api/v1/weather/history/{slug}", response_model=HistoryResponse, tags=["weather"])
    def history(
        slug: str, start: datetime | None = None, end: datetime | None = None,
        limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db),
    ):
        if (start and start.tzinfo is None) or (end and end.tzinfo is None):
            raise HTTPException(status_code=422, detail={"code": "TIMEZONE_REQUIRED", "detail": "History timestamps must include a timezone offset."})
        if start and end and start > end:
            raise HTTPException(status_code=422, detail={"code": "INVALID_DATE_RANGE", "detail": "start must be before end"})
        return weather_history(db, slug, start, end, limit, settings)

    @app.get("/api/v1/official/alerts/{slug}", response_model=OfficialAlertsResponse, tags=["official-sources"])
    def official_alerts(slug: str, db: Session = Depends(get_db)):
        return current_official_alerts(db, slug, app.state.sachet_client, settings)

    @app.get("/api/v1/official/air-quality/current/{slug}", response_model=OfficialAirQualityResponse, tags=["official-sources"])
    def official_air_quality(slug: str, db: Session = Depends(get_db)):
        return current_official_air_quality(db, slug, app.state.cpcb_client, settings)

    @app.get("/api/v1/official/air-quality/history/{slug}", response_model=OfficialAirQualityHistoryResponse, tags=["official-sources"])
    def official_air_quality_stored_history(
        slug: str, limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db),
    ):
        return official_air_quality_history(db, slug, limit)

    @app.get("/api/v1/air-quality/current/{slug}", response_model=AirQualityResponse, tags=["air-quality"])
    def air_quality(slug: str, db: Session = Depends(get_db)):
        return current_air_quality(db, slug, app.state.air_quality_client, settings)

    @app.get("/api/v1/air-quality/forecast/{slug}", response_model=AirQualityForecastResponse, tags=["air-quality"])
    def air_quality_forecast(slug: str, db: Session = Depends(get_db)):
        return forecast_air_quality(db, slug, app.state.air_quality_client, settings)

    @app.get("/api/v1/air-quality/history/{slug}", response_model=AirQualityHistoryResponse, tags=["air-quality"])
    def air_quality_stored_history(
        slug: str, start: datetime | None = None, end: datetime | None = None,
        limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db),
    ):
        if (start and start.tzinfo is None) or (end and end.tzinfo is None):
            raise HTTPException(status_code=422, detail={"code": "TIMEZONE_REQUIRED", "detail": "History timestamps must include a timezone offset."})
        if start and end and start > end:
            raise HTTPException(status_code=422, detail={"code": "INVALID_DATE_RANGE", "detail": "start must be before end"})
        return air_quality_history(db, slug, start, end, limit, settings)

    @app.get("/api/v1/risk/air-quality/{slug}", response_model=AirQualityRiskResponse, tags=["risk"])
    def air_quality_risk(slug: str, db: Session = Depends(get_db)):
        values = current_air_quality(db, slug, app.state.air_quality_client, settings)
        if values["us_aqi"] is None and values["european_aqi"] is None:
            raise HTTPException(status_code=503, detail={"code": "AIR_QUALITY_RISK_UNAVAILABLE", "detail": "US AQI or European AQI is required for air-quality screening."})
        return {
            **air_quality_risk_result(values["us_aqi"], values["european_aqi"]), "region": slug, "model_time": values["model_time"],
            "source": values["source"], "freshness": values["freshness"], "is_station_observation": False,
        }

    @app.get("/api/v1/risk/{slug}", response_model=RiskResponse, tags=["risk"])
    def risk(slug: str, db: Session = Depends(get_db)):
        current_values = current_weather(db, slug, app.state.weather_client, settings)
        if current_values["temperature_c"] is None or current_values["humidity_pct"] is None:
            raise HTTPException(status_code=503, detail={"code": "RISK_UNAVAILABLE", "detail": "Temperature and humidity are required for heat-risk screening."})
        result = risk_result(current_values["temperature_c"], current_values["humidity_pct"])
        return {**result, "region": slug, "observed_at": current_values["observed_at"], "source": current_values["source"], "freshness": current_values["freshness"]}

    @app.get("/api/v1/risk", tags=["risk"])
    def risk_map(db: Session = Depends(get_db)):
        results = []
        for region in list_regions():
            try:
                values = current_weather(db, region["slug"], app.state.weather_client, settings)
                if values["temperature_c"] is None or values["humidity_pct"] is None:
                    raise ValueError("Missing risk inputs")
                results.append({
                    "location": region, "status": values["freshness"], "source": values["source"],
                    "observed_at": values["observed_at"], **risk_result(values["temperature_c"], values["humidity_pct"]),
                })
            except (HTTPException, ValueError):
                results.append({"location": region, "status": "unavailable", "source": None, "observed_at": None})
        return results

    @app.get("/api/v1/safety/{level}", response_model=SafetyResponse, tags=["safety"])
    def safety(level: str):
        if level not in RECOMMENDATIONS:
            raise HTTPException(status_code=404, detail={"code": "RISK_LEVEL_NOT_FOUND", "detail": "Choose low, moderate, high, or extreme."})
        return safety_result(level)

    @app.post("/api/v1/sensors/readings", response_model=SensorIngestResponse, status_code=201, tags=["sensors"])
    def ingest_sensor(reading: SensorReadingCreate, db: Session = Depends(get_db), _: None = Depends(require_sensor_key)):
        if reading.observed_at > utc_now() + timedelta(minutes=5):
            raise HTTPException(status_code=422, detail={"code": "TIMESTAMP_IN_FUTURE", "detail": "observed_at cannot be more than five minutes in the future."})
        if reading.observed_at < utc_now() - timedelta(days=3650):
            raise HTTPException(status_code=422, detail={"code": "TIMESTAMP_TOO_OLD", "detail": "observed_at is outside the accepted ingestion window."})
        existing = db.scalar(select(SensorReading).where(SensorReading.device_id == reading.device_id, SensorReading.observed_at == reading.observed_at))
        incoming_simulated = reading.source == "simulated"
        if existing:
            same = (
                existing.temperature_c == reading.temperature_c and existing.humidity_pct == reading.humidity_pct
                and existing.wind_speed_kmh == reading.wind_speed_kmh and existing.is_simulated == incoming_simulated
                and existing.note == reading.note
            )
            if not same:
                raise HTTPException(status_code=409, detail={"code": "READING_CONFLICT", "detail": "This device/timestamp already contains different values."})
            return SensorIngestResponse(created=False, reading=SensorReadingResponse(**sensor_dict(existing)))
        stored = SensorReading(
            device_id=reading.device_id, observed_at=reading.observed_at, received_at=utc_now(),
            temperature_c=reading.temperature_c, humidity_pct=reading.humidity_pct,
            wind_speed_kmh=reading.wind_speed_kmh, is_simulated=incoming_simulated, note=reading.note,
        )
        db.add(stored)
        db.commit()
        db.refresh(stored)
        return SensorIngestResponse(created=True, reading=SensorReadingResponse(**sensor_dict(stored)))

    @app.get("/api/v1/sensors/{device_id}/readings", response_model=list[SensorReadingResponse], tags=["sensors"])
    def sensor_readings(device_id: str, limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db), _: None = Depends(require_sensor_key)):
        rows = db.scalars(select(SensorReading).where(SensorReading.device_id == device_id).order_by(SensorReading.observed_at.desc()).limit(limit)).all()
        return [sensor_dict(row) for row in rows]

    @app.get("/api/v1/sensors/{device_id}/status", response_model=SensorStatusResponse, tags=["sensors"])
    def sensor_status(device_id: str, db: Session = Depends(get_db), _: None = Depends(require_sensor_key)):
        reading = db.scalar(select(SensorReading).where(SensorReading.device_id == device_id).order_by(SensorReading.observed_at.desc()).limit(1))
        if reading is None:
            return {"device_id": device_id, "state": "no_data", "last_reading_at": None, "is_simulated": None}
        age = (utc_now() - as_utc(reading.observed_at)).total_seconds()
        return {
            "device_id": device_id, "state": "online" if 0 <= age <= settings.sensor_stale_seconds else "stale",
            "last_reading_at": as_utc(reading.observed_at), "is_simulated": reading.is_simulated,
        }

    @app.get("/api/v1/ml/status", tags=["ml"])
    def ml_status():
        service: ModelService = app.state.model_service
        metadata = service.metadata
        return {
            "status": service.status, "model_version": metadata.get("model_version") if metadata else None,
            "selected_model": metadata.get("selected_model") if metadata else None,
            "trained_at": metadata.get("trained_at") if metadata else None,
            "dataset_type": metadata.get("dataset_type") if metadata else None,
        }

    @app.post("/api/v1/ml/predict", response_model=PredictionResponse, tags=["ml"])
    def predict(request: PredictionRequest):
        region_or_404(request.region)
        try:
            return app.state.model_service.predict(request.region, request.target_date, request.recent_max_temperatures, request.humidity_pct)
        except ModelUnavailable as exc:
            raise HTTPException(status_code=503, detail={"code": "MODEL_UNAVAILABLE", "detail": str(exc)}) from exc

    @app.post("/api/v1/ml/hotspots", response_model=list[HotspotItem], tags=["ml"])
    def hotspots(requests: list[PredictionRequest]):
        predictions = [predict(item) for item in requests]
        ranked = sorted(predictions, key=lambda item: item["predicted_temperature_c"], reverse=True)[:5]
        return [{"region": item["region"], "predicted_temperature_c": item["predicted_temperature_c"], "evidence_type": "model_inferred", "model_version": item["model_version"]} for item in ranked]

    @app.get("/api/v1/health", response_model=HealthResponse, tags=["status"])
    @app.get("/api/v1/status", response_model=HealthResponse, include_in_schema=False)
    def health(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT 1"))
            database = "ok"
        except Exception:
            database = "unavailable"
        return {
            "status": "ok" if database == "ok" else "degraded", "database": database,
            "weather_provider": "Open-Meteo (network checked only by weather requests)",
            "air_quality_provider": "Open-Meteo Air Quality API/CAMS (network checked only by air-quality requests)",
            "cpcb_provider": "CPCB via data.gov.in (credential configured; network checked only by CPCB requests)" if app.state.cpcb_client.configured else "CPCB via data.gov.in (API key not configured)",
            "sachet_provider": "NDMA SACHET CAP (enabled; network checked only by official-alert requests)" if settings.sachet_enabled else "NDMA SACHET CAP (disabled)",
            "ml_model": app.state.model_service.status, "timestamp": utc_now(),
        }

    return app


app = create_app()

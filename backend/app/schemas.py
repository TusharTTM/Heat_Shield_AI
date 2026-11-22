from datetime import date, datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

_CONTROL_LINE_BREAKS = "\r\n\x0b\x0c\x85\u2028\u2029"


def _reject_line_breaks(value: str) -> str:
    if any(character in value for character in _CONTROL_LINE_BREAKS):
        raise ValueError("Line breaks are not allowed in assistant context fields.")
    return value


class RegionResponse(BaseModel):
    slug: str
    name: str
    state: str
    latitude: float
    longitude: float
    elevation_m: float | int | None = None
    # shared/regions.json names this `is_coastal`; accept both so the API never
    # reports a coastal city as inland just because the key name differs.
    coastal: bool = Field(default=False, validation_alias=AliasChoices("coastal", "is_coastal"))


class CurrentWeatherResponse(BaseModel):
    region: str
    location: RegionResponse
    observed_at: datetime
    retrieved_at: datetime
    temperature_c: float | None
    humidity_pct: float | None
    wind_speed_kmh: float | None
    apparent_temperature_c: float | None
    heat_index_c: float | None
    weather_code: int | None
    source: str
    freshness: Literal["current", "stale"]
    provider_status: Literal["ok", "unavailable"]
    message: str | None = None
    is_simulated: bool = False


class ForecastDayResponse(BaseModel):
    date: date
    temperature_max_c: float | None
    temperature_min_c: float | None
    humidity_mean_pct: float | None
    wind_speed_max_kmh: float | None
    precipitation_mm: float | None
    weather_code: int | None
    description: str


class ForecastResponse(BaseModel):
    region: str
    location: RegionResponse
    retrieved_at: datetime
    source: str
    freshness: Literal["current", "stale"]
    provider_status: Literal["ok", "unavailable"]
    message: str | None = None
    days: list[ForecastDayResponse]


class AirQualityResponse(BaseModel):
    region: str
    location: RegionResponse
    model_time: datetime
    retrieved_at: datetime
    us_aqi: float | None
    european_aqi: float | None
    pm10: float | None
    pm2_5: float | None
    carbon_monoxide: float | None
    nitrogen_dioxide: float | None
    sulphur_dioxide: float | None
    ozone: float | None
    aqi_standard: Literal["US AQI"] = "US AQI"
    aqi_standards: list[Literal["US AQI", "European AQI"]] = Field(default_factory=lambda: ["US AQI", "European AQI"])
    source: str
    evidence_type: Literal["air-quality-model"] = "air-quality-model"
    is_station_observation: Literal[False] = False
    freshness: Literal["current", "stale"]
    provider_status: Literal["ok", "unavailable"]
    message: str | None = None


class AirQualityHourResponse(BaseModel):
    model_time: datetime
    retrieved_at: datetime
    us_aqi: float | None
    european_aqi: float | None
    pm10: float | None
    pm2_5: float | None
    carbon_monoxide: float | None
    nitrogen_dioxide: float | None
    sulphur_dioxide: float | None
    ozone: float | None
    source: str
    evidence_type: Literal["air-quality-model"] = "air-quality-model"


class AirQualityForecastResponse(AirQualityResponse):
    hourly: list[AirQualityHourResponse]
    forecast_status: Literal["ok", "unavailable"]
    forecast_message: str | None = None


class AirQualityHistoryResponse(BaseModel):
    region: str
    count: int
    status: Literal["stored_model_estimates", "empty"]
    items: list[AirQualityResponse]


class AirQualityRiskResponse(BaseModel):
    region: str
    model_time: datetime
    source: str
    freshness: Literal["current", "stale"]
    us_aqi: float | None
    european_aqi: float | None
    aqi_category: str | None
    european_aqi_category: str | None
    european_level: Literal["low", "moderate", "high", "extreme"] | None
    level: Literal["low", "moderate", "high", "extreme"]
    explanation: str
    recommendation: str
    method: str
    is_station_observation: Literal[False] = False


class CPCBPollutantResponse(BaseModel):
    pollutant_id: str
    minimum: float | None
    maximum: float | None
    average: float | None
    unit: str | None


class OfficialAirQualityObservationResponse(BaseModel):
    station: str
    country: str
    state: str
    city: str
    observed_at: datetime
    retrieved_at: datetime
    aqi: float | None
    aqi_category: str | None
    aqi_standard: Literal["Indian CPCB AQI"] | None
    screening_level: Literal["low", "moderate", "high", "extreme"] | None
    pollutants: dict[str, CPCBPollutantResponse]
    source: str
    evidence_type: Literal["station-observation"] = "station-observation"


class OfficialAirQualityResponse(BaseModel):
    region: str
    location: RegionResponse
    source: str
    evidence_type: Literal["station-observation"] = "station-observation"
    freshness: Literal["current", "stale"]
    provider_status: Literal["ok", "unavailable"]
    retrieved_at: datetime
    latest_observation_at: datetime | None
    records_read: int
    invalid_records: int
    count: int
    observations: list[OfficialAirQualityObservationResponse]
    message: str | None
    attribution: str
    resource_url: str
    license_url: str
    aqi_method: str


class OfficialAirQualityHistoryResponse(BaseModel):
    region: str
    count: int
    status: Literal["stored_station_observations", "empty"]
    items: list[OfficialAirQualityObservationResponse]


class OfficialAlertResponse(BaseModel):
    identifier: str
    sender: str
    sender_name: str | None
    sent: datetime | None
    status: str
    msg_type: str
    scope: str
    language: str | None
    category: str | None
    event: str | None
    urgency: str | None
    severity: str | None
    certainty: str | None
    level: Literal["low", "moderate", "high", "extreme"] | None
    effective: datetime | None
    onset: datetime | None
    expires: datetime | None
    headline: str | None
    description: str | None
    instruction: str | None
    areas: list[str]
    match_type: str
    matched_area: str | None
    match_explanation: str
    source_url: str
    retrieved_at: datetime
    is_official: Literal[True] = True


class OfficialAlertsResponse(BaseModel):
    region: str
    location: RegionResponse
    source: str
    evidence_type: Literal["official-warning"] = "official-warning"
    provider_status: Literal["ok", "unavailable"]
    freshness: Literal["current", "stale"]
    retrieval_complete: bool
    retrieved_at: datetime
    checked_at: datetime
    active_messages_evaluated: int
    failed_count: int
    invalid_count: int
    unresolved_area_count: int
    validity_incomplete_count: int
    count: int
    alerts: list[OfficialAlertResponse]
    message: str | None
    limitations: str
    attribution: str
    portal_url: str
    feed_url: str
    integration_guide_url: str


class HistoryResponse(BaseModel):
    region: str
    count: int
    status: Literal["stored_observations", "empty"]
    items: list[CurrentWeatherResponse]


class RiskResponse(BaseModel):
    region: str
    observed_at: datetime
    source: str
    freshness: Literal["current", "stale"]
    temperature_c: float
    humidity_pct: float
    heat_index_c: float
    level: Literal["low", "moderate", "high", "extreme"]
    underlying_level: str
    explanation: str
    screening_warning: str
    method: str


class SafetyResponse(BaseModel):
    level: str
    recommendation: str
    general_tips: list[dict]
    emergency_guidance: str


class SensorReadingCreate(BaseModel):
    device_id: str = Field(pattern=r"^[A-Za-z0-9_-]{3,64}$")
    observed_at: datetime
    temperature_c: float = Field(ge=-50, le=70)
    humidity_pct: float = Field(ge=0, le=100)
    wind_speed_kmh: float | None = Field(default=None, ge=0, le=200)
    source: Literal["physical", "simulated"]
    note: str | None = Field(default=None, max_length=300)

    @field_validator("observed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("observed_at must include a timezone offset")
        return value


class SensorReadingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    observed_at: datetime
    received_at: datetime
    temperature_c: float
    humidity_pct: float
    wind_speed_kmh: float | None
    is_simulated: bool
    note: str | None


class SensorIngestResponse(BaseModel):
    created: bool
    reading: SensorReadingResponse


class SensorStatusResponse(BaseModel):
    device_id: str
    state: Literal["online", "stale", "no_data"]
    last_reading_at: datetime | None
    is_simulated: bool | None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]
    weather_provider: str
    air_quality_provider: str
    cpcb_provider: str
    sachet_provider: str
    ml_model: Literal["loaded", "not_configured", "unavailable"]
    timestamp: datetime


class PredictionRequest(BaseModel):
    region: str
    target_date: date
    recent_max_temperatures: list[float] = Field(min_length=3, max_length=3)
    humidity_pct: float | None = Field(default=None, ge=0, le=100)

    @field_validator("recent_max_temperatures")
    @classmethod
    def plausible_temperatures(cls, values: list[float]) -> list[float]:
        if any(value < -70 or value > 65 for value in values):
            raise ValueError("recent temperatures must be between -70°C and 65°C")
        return values


class PredictionResponse(BaseModel):
    region: str
    target_date: date
    predicted_temperature_c: float
    model_version: str
    model_name: str
    evaluation: dict
    explanation: str
    risk: dict | None
    is_ml_prediction: bool = True
    official_forecast: bool = False


class HotspotItem(BaseModel):
    region: str
    predicted_temperature_c: float
    evidence_type: Literal["model_inferred"]
    model_version: str


class AssistantRegionRef(BaseModel):
    """City-level location only. `extra="forbid"` rejects profile names, emails,
    or precise coordinates so they can never reach the assistant provider."""

    model_config = ConfigDict(extra="forbid")

    slug: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    state: str = Field(min_length=1, max_length=120)

    @field_validator("slug", "name", "state")
    @classmethod
    def single_line(cls, value: str) -> str:
        return _reject_line_breaks(value)


class AssistantContextItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=400)
    evidence_type: Literal["weather-model", "air-quality-model", "official-warning", "app-state"]
    source: str = Field(min_length=1, max_length=200)
    observed_at: datetime | None = None
    freshness: Literal["current", "stale", "unknown"] = "unknown"

    @field_validator("label", "value", "source")
    @classmethod
    def single_line(cls, value: str) -> str:
        """Context rows render as one prompt line each; line breaks are rejected.

        Without this, a cached provider payload could append its own
        ``[OFFICIAL WARNING ...]`` row and be attributed to an official feed.
        """
        return _reject_line_breaks(value)


class AssistantMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region: AssistantRegionRef
    messages: list[AssistantMessage] = Field(min_length=1, max_length=40)
    context: list[AssistantContextItem] = Field(min_length=1, max_length=30)


class AssistantSourceItem(BaseModel):
    label: str
    source: str
    evidence_type: Literal["weather-model", "air-quality-model", "official-warning", "app-state"]
    observed_at: datetime | None = None
    freshness: Literal["current", "stale", "unknown"] = "unknown"


class AssistantChatResponse(BaseModel):
    reply: str
    model: str
    generated_at: datetime
    sources: list[AssistantSourceItem]
    disclaimer: str


class AssistantStatusResponse(BaseModel):
    status: Literal["ready", "not_configured"]
    provider: str
    model: str | None
    data_policy: str


class ErrorResponse(BaseModel):
    detail: str
    code: str

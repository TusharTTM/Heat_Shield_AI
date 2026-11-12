from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "esp32_dht22"


def test_firmware_contract_requires_tls_time_validation_and_physical_source():
    source = (ROOT / "src" / "main.cpp").read_text()
    assert 'payload["source"] = "physical"' in source
    assert 'http.addHeader("X-Sensor-Key", SENSOR_API_KEY)' in source
    assert "tlsClient.setCACert(ROOT_CA_CERT)" in source
    assert "setInsecure" not in source
    assert "synchronizeClock()" in source
    assert "observationTimestamp" in source
    assert "isnan(humidity)" in source and "isnan(temperature)" in source
    assert 'payload["source"] = "simulated"' not in source


def test_no_real_credentials_are_committed():
    example = (ROOT / "include" / "config.h.example").read_text()
    assert "replace-with-wifi-ssid" in example
    assert "replace-with-a-long-random-server-issued-key" in example
    assert not (ROOT / "include" / "config.h").exists()
    platform = (ROOT / "platformio.ini").read_text()
    assert "framework = arduino" in platform
    assert "ArduinoJson" in platform and "DHT sensor library" in platform

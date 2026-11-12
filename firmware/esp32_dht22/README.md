# ESP32 + DHT22 firmware (unverified on hardware)

This firmware reads a physical DHT22 and sends timestamped JSON to the FastAPI ingestion endpoint over authenticated HTTPS. It does **not** contain a simulation mode. Backend software tests use separately labelled simulated readings.

## Hardware and wiring

- ESP32 development board supported by the `esp32dev` PlatformIO target.
- DHT22/AM2302 powered at 3.3 V, data connected to GPIO4, and an appropriate pull-up resistor (commonly 4.7–10 kΩ) between data and 3.3 V.
- Wi-Fi coverage and a deployed HTTPS API reachable from the device network.

Check the specific board/sensor datasheet before wiring. Do not claim this reference pinout has been verified on your hardware.

## Configure and build

```bash
cd firmware/esp32_dht22
cp include/config.h.example include/config.h
# Replace Wi-Fi, API URL, device ID, long random sensor key, and the API root CA PEM.
pio run
pio run --target upload
pio device monitor
```

The deployed server must have the same `SENSOR_API_KEY`. The firmware refuses invalid DHT values and missing NTP time instead of inventing readings/timestamps. `setInsecure()` is intentionally not used; update `ROOT_CA_CERT` when the server certificate chain changes.

The device sends `source: "physical"`. HTTP 200/201 is the only accepted ingestion result. Duplicate timestamps are idempotent at the server; conflicting values are rejected. A deployed production system should add per-device credentials, local buffering/retry policy, certificate rotation, secure provisioning, and OTA update controls.

## Verification boundary

No ESP32, DHT22, local PlatformIO executable, device network, or deployed HTTPS endpoint was available in this workspace. The source contract is statically tested, and the real PlatformIO `pio run` compile passed in GitHub integration runs including `42465067443` and `42465420060` using placeholder configuration. Upload, sensor accuracy, TLS/NTP interoperability, and physical connectivity remain unverified until performed with real hardware, credentials, and a deployed API.

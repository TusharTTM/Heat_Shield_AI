#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "config.h"

DHT dht(DHT_PIN, DHT22);

bool connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) {
        return true;
    }
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    for (int attempt = 0; attempt < 30 && WiFi.status() != WL_CONNECTED; ++attempt) {
        delay(500);
    }
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Wi-Fi unavailable; reading was not sent.");
        return false;
    }
    return true;
}

bool synchronizeClock() {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    for (int attempt = 0; attempt < 30; ++attempt) {
        if (time(nullptr) > 1700000000) {
            return true;
        }
        delay(500);
    }
    Serial.println("NTP time unavailable; refusing to invent a timestamp.");
    return false;
}

bool observationTimestamp(char *buffer, size_t size) {
    time_t now = time(nullptr);
    if (now <= 1700000000) {
        return false;
    }
    struct tm utc;
    gmtime_r(&now, &utc);
    return strftime(buffer, size, "%Y-%m-%dT%H:%M:%SZ", &utc) > 0;
}

bool sendReading(float temperatureC, float humidityPct) {
    char observedAt[25];
    if (!observationTimestamp(observedAt, sizeof(observedAt))) {
        Serial.println("Valid UTC time unavailable; reading was not sent.");
        return false;
    }
    WiFiClientSecure tlsClient;
    tlsClient.setCACert(ROOT_CA_CERT);
    HTTPClient http;
    http.setConnectTimeout(10000);
    http.setTimeout(15000);
    if (!http.begin(tlsClient, API_URL)) {
        Serial.println("Could not initialize HTTPS request.");
        return false;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Sensor-Key", SENSOR_API_KEY);

    JsonDocument payload;
    payload["device_id"] = DEVICE_ID;
    payload["observed_at"] = observedAt;
    payload["temperature_c"] = serialized(String(temperatureC, 2));
    payload["humidity_pct"] = serialized(String(humidityPct, 2));
    payload["source"] = "physical";
    payload["note"] = "ESP32 DHT22 firmware reading";
    String body;
    serializeJson(payload, body);

    int status = http.POST(body);
    bool accepted = status == 200 || status == 201;
    Serial.printf("Ingestion HTTP status: %d\n", status);
    if (!accepted) {
        String response = http.getString();
        response.replace(SENSOR_API_KEY, "[redacted]");
        Serial.println("Reading rejected or API unavailable; no success is assumed.");
        Serial.println(response.substring(0, 300));
    }
    http.end();
    return accepted;
}

void setup() {
    Serial.begin(115200);
    dht.begin();
    if (connectWiFi()) {
        synchronizeClock();
    }
}

void loop() {
    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();
    if (isnan(humidity) || isnan(temperature) || humidity < 0 || humidity > 100 || temperature < -50 || temperature > 70) {
        Serial.println("Invalid DHT22 reading; nothing was sent.");
    } else if (connectWiFi() && synchronizeClock()) {
        sendReading(temperature, humidity);
    }
    delay(READ_INTERVAL_MS);
}

#include <WiFi.h>
#include "LittleFS.h"
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ElegantOTA.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>

#define FIRMWARE_VERSION "2.0.4"

bool debug = false;

// Wi-Fi credentials
const char* SSID = "SSID";
const char* PASSWORD = "PASSWORD";
const char* hostname = "sv7200";
const char* serverUrl = "http://opcua_server_ip:5000/update";

// Track Wi-Fi status
bool wifiConnected = false;
unsigned long wifiReconnectInterval = 15000;
unsigned long lastWifiReconnectAttempt = 0;

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);
AsyncEventSource events("/events");

volatile int pulseCount = 0;
volatile int pulseCount2 = 0;

int f1 = 0;
int f2 = 0;
float temperature = 0;
float flow = 0;

unsigned long lastTime = 0;

void IRAM_ATTR pulseCounter() {
    pulseCount++;
}

void IRAM_ATTR pulseCounter2() {
    pulseCount2++;
}

void setup() {
  Serial.begin(115200);
  initLittleFS();
  setupWiFi();
  webRoutes();
  server.serveStatic("/", LittleFS, "/");
  server.addHandler(&events);
  ElegantOTA.begin(&server);
  server.begin();
  Serial.println("Web server started");
  
  if (MDNS.begin(hostname)) {
    Serial.println("mDNS responder started");
    Serial.print("Access your ESP32 at: http://");
    Serial.print(hostname);
    Serial.println(".local");
  } else {
    Serial.println("Error starting mDNS");
  }
  
  pinMode(18, INPUT_PULLDOWN);
  pinMode(19, INPUT_PULLDOWN);
  attachInterrupt(digitalPinToInterrupt(18), pulseCounter, RISING);
  attachInterrupt(digitalPinToInterrupt(19), pulseCounter2, RISING);
  
  Serial.println("ESP32 setup complete");
  Serial.print("Sending data to: ");
  Serial.println(serverUrl);
}

void loop() {
  // Handle WiFi reconnection
  if (WiFi.status() != WL_CONNECTED && !wifiConnected) {
    if (millis() - lastWifiReconnectAttempt >= wifiReconnectInterval) {
      Serial.println("Attempting to reconnect to WiFi...");
      setupWiFi();
      lastWifiReconnectAttempt = millis();
    }
  }
  
  unsigned long currentTime = millis();
  if (currentTime - lastTime >= 1000) { // Measures every second
    noInterrupts();
    f1 = pulseCount;
    f2 = pulseCount2;
    pulseCount = 0;
    pulseCount2 = 0;
    interrupts();
    
    lastTime = currentTime;
    flow = (float) f1/10.0;
    temperature = (float) f2/10.0 - 10;

    if (debug){
      temperature = random(80, 90);
      flow = random(60, 70);
    }

    notifyClients();
    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.println(" °C");
    Serial.print("Flow: ");
    Serial.print(flow);
    Serial.println(" L/min");
    
    sendDataToServer(temperature, flow);
  }
  
  // Handle ElegantOTA
  ElegantOTA.loop();
}

void setupWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(hostname);
    Serial.print("Connecting to ");
    Serial.println(SSID);
    WiFi.begin(SSID, PASSWORD);
    
    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("\nConnected to ");
        Serial.println(SSID);
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
        Serial.print("Signal strength (RSSI): ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");
        wifiConnected = true;
    } else {
        Serial.println("\nFailed to connect to WiFi. Running in offline mode.");
        wifiConnected = false;
    }
}

void initLittleFS() {
    if (!LittleFS.begin(true)) {
        Serial.println("An error has occurred while mounting LittleFS");
    }
    else {
        Serial.println("LittleFS mounted successfully");
    }
}

void notifyClients() {
    DynamicJsonDocument doc(512);
    doc["flow"] = flow;
    doc["temperature"] = temperature;
    doc["timestamp"] = millis();
    doc["firmware_version"] = FIRMWARE_VERSION;

    String json;
    serializeJson(doc, json);
    
    Serial.println("Sending to web clients: " + json);
    events.send(json.c_str(), "update", millis());
}

void webRoutes(){
    // Route for root / web page
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(LittleFS, "/index.html", "text/html");
    });

    server.on("/app.js", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(LittleFS, "/app.js", "application/javascript");
    });

    // Add a status endpoint for debugging
    server.on("/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(512);
        doc["temperature"] = temperature;
        doc["flow"] = flow;
        doc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
        doc["wifi_rssi"] = WiFi.RSSI();
        doc["free_heap"] = ESP.getFreeHeap();
        doc["uptime"] = millis();
        doc["firmware_version"] = FIRMWARE_VERSION;
        
        String json;
        serializeJson(doc, json);
        request->send(200, "application/json", json);
    });

    // Add firmware version endpoint
    server.on("/firmware", HTTP_GET, [](AsyncWebServerRequest *request) {
        DynamicJsonDocument doc(256);
        doc["version"] = FIRMWARE_VERSION;
        doc["compile_date"] = __DATE__;
        doc["compile_time"] = __TIME__;
        
        String json;
        serializeJson(doc, json);
        request->send(200, "application/json", json);
    });

    events.onConnect([](AsyncEventSourceClient *client) {
        Serial.println("Client connected to /events");
        notifyClients();
    });
}

void sendDataToServer(float temperature, float flow) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000); // 5 second timeout

    String payload = "{\"temperature\":" + String(temperature, 2) + 
                     ",\"flow\":" + String(flow, 2) + "}";

    Serial.print("Sending to OPC-UA server: ");
    Serial.println(payload);

    int responseCode = http.POST(payload);
    
    if (responseCode > 0) {
      String response = http.getString();
      Serial.print("HTTP Response code: ");
      Serial.println(responseCode);
      Serial.print("Response: ");
      Serial.println(response);
      
      if (responseCode == 200) {
        Serial.println("✓ Data sent successfully to OPC-UA server");
      } else {
        Serial.println("⚠ Server responded but with error code");
      }
    } else {
      Serial.print("✗ Failed to send data. HTTP error: ");
      Serial.println(responseCode);
      Serial.println("Check if Python OPC-UA server is running!");
    }
    
    http.end();
  } else {
    Serial.println("✗ WiFi not connected - cannot send data to OPC-UA server");
    wifiConnected = false;
  }
}
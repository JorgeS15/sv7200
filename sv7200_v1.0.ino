#include <WiFi.h>
#include "LittleFS.h"
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ElegantOTA.h>
#include <ArduinoJson.h>

bool debug = true;

// Wi-Fi credentials
const char* SSID = "ssid";
const char* PASSWORD = "password";

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
  pinMode(18, INPUT_PULLDOWN);
  pinMode(19, INPUT_PULLDOWN);
  attachInterrupt(digitalPinToInterrupt(18), pulseCounter, RISING);
  attachInterrupt(digitalPinToInterrupt(19), pulseCounter2, RISING);

}

void loop() {
  unsigned long currentTime = millis();
    if (currentTime - lastTime >= 1000) { //Measures every second
        noInterrupts();
        f1 = pulseCount;
        f2 = pulseCount2;
        pulseCount = 0;
        pulseCount2 = 0;
        interrupts();
        lastTime = millis();
        temperature = (float) f1/10.0 - 10;
        flow = (float) f2/10.0;

        if (debug){
            temperature = random(0, 90);
            flow = random(0, 100);
        }

        notifyClients();
        /*
        Serial.print("F1: ");
        Serial.print(f1);
        Serial.println(" Hz");
        Serial.print("F2: ");
        Serial.print(f2);
        Serial.println(" Hz");
        */
        Serial.println("Temperatura: ");
        Serial.print(temperature);
        Serial.println(" ºC");
        Serial.println("Caudal: ");
        Serial.print(flow);
        Serial.println(" L/min");
    }

}

void setupWiFi() {
    WiFi.mode(WIFI_STA);
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
    DynamicJsonDocument doc(256);
    doc["flow"] = flow;
    doc["temperature"] = temperature;

    String json;
    serializeJson(doc, json);
    
    Serial.println("Sending: " + json);
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

    server.on("/command", HTTP_POST, [](AsyncWebServerRequest *request) {
    }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        DynamicJsonDocument doc(128);
        DeserializationError error = deserializeJson(doc, data, len);
        
        if (!error) {
            if (doc.containsKey("command")) {                
                notifyClients();
                request->send(200, "application/json", "{\"status\":\"ok\"}");
                return;
            }
        }
        request->send(400, "application/json", "{\"error\":\"invalid request\"}");
    });

    events.onConnect([](AsyncEventSourceClient *client) {
        Serial.println("Client connected to /events");
        notifyClients();
    });
}
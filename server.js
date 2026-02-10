
import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3030;

console.log("--- PowerLog Server Startvorgang ---");

// Pfad-Konfiguration
const defaultDataDir = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH 
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(__dirname, process.env.DB_PATH)) 
  : path.join(defaultDataDir, 'powerlog.db');

const DATA_DIR = path.dirname(DB_PATH);

// 1. Verzeichnis und Datei-Prüfung (Wichtig für Docker Volumes)
try {
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`[PowerLog] Erstelle Verzeichnis: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Prüfen ob wir im Verzeichnis schreiben dürfen
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
  console.log(`[PowerLog] Schreibzugriff auf ${DATA_DIR} ist OK.`);

  // Explizites Anlegen der Datei, falls sie nicht existiert
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[PowerLog] Erstelle neue Datenbank-Datei: ${DB_PATH}`);
    // Wir erstellen eine leere Datei, damit SQLite keine Probleme mit Berechtigungen bekommt
    fs.closeSync(fs.openSync(DB_PATH, 'w'));
  }
} catch (err) {
  console.error(`[PowerLog] KRITISCHER FEHLER beim Dateisystem-Zugriff: ${err.message}`);
  console.error(`Stellen Sie sicher, dass der Docker-User (UID 1000) Schreibrechte auf das Volume hat.`);
}

// 2. Datenbank-Verbindung (Standard-Initialisierung)
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`[PowerLog] SQLite Verbindungsfehler: ${err.message}`);
    process.exit(1);
  }
  console.log(`[PowerLog] Datenbank bereit unter: ${DB_PATH}`);
});

app.use(cors());
app.use(express.json());

// 3. Tabellen-Schema erstellen
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS batteries (
    id TEXT PRIMARY KEY,
    name TEXT,
    brand TEXT,
    size TEXT,
    category TEXT,
    quantity INTEGER,
    totalQuantity INTEGER,
    minQuantity INTEGER,
    inUse INTEGER,
    usageAccumulator INTEGER,
    capacityMah INTEGER,
    chargeCycles INTEGER,
    lastCharged TEXT,
    chargingHistory TEXT
  )`, (err) => {
    if (err) {
      console.error("[PowerLog] Fehler beim Erstellen der Tabelle:", err.message);
    } else {
      console.log("[PowerLog] Tabellen-Schema ist aktuell.");
    }
  });
});

// API Endpunkte
app.get('/api/batteries', (req, res) => {
  db.all("SELECT * FROM batteries", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsedRows = (rows || []).map(row => ({
      ...row,
      chargingHistory: row.chargingHistory ? JSON.parse(row.chargingHistory) : []
    }));
    res.json(parsedRows);
  });
});

app.post('/api/batteries', (req, res) => {
  const b = req.body;
  if (!b.id || !b.name) return res.status(400).json({ error: "ID und Name erforderlich." });
  
  const historyJson = JSON.stringify(b.chargingHistory || []);
  const sql = `REPLACE INTO batteries (
    id, name, brand, size, category, quantity, totalQuantity, 
    minQuantity, inUse, usageAccumulator, capacityMah, chargeCycles, 
    lastCharged, chargingHistory
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [
    b.id, b.name, b.brand || '', b.size || b.name, b.category, 
    Number(b.quantity) || 0, Number(b.totalQuantity) || 0, Number(b.minQuantity) || 0, 
    Number(b.inUse) || 0, Number(b.usageAccumulator) || 0, Number(b.capacityMah) || 0, 
    Number(b.chargeCycles) || 0, b.lastCharged || '', historyJson
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: b.id });
  });
});

app.delete('/api/batteries/:id', (req, res) => {
  db.run("DELETE FROM batteries WHERE id = ?", req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend nicht gefunden.");
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PowerLog] ✅ Server aktiv auf Port ${PORT}`);
});

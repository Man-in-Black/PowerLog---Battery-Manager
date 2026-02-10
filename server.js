
import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3030;

console.log("--- PowerLog Server Start ---");

// Absolute Pfade sicherstellen
const defaultDbPath = path.join(__dirname, 'data', 'powerlog.db');
const DB_PATH = process.env.DB_PATH 
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(__dirname, process.env.DB_PATH)) 
  : defaultDbPath;

console.log(`[PowerLog] Datenbank-Pfad: ${DB_PATH}`);

try {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    console.log(`[PowerLog] Erstelle Verzeichnis: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (err) {
  console.error(`[PowerLog] KRITISCH: Verzeichnis konnte nicht erstellt werden: ${err.message}`);
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`[PowerLog] KRITISCH: Datenbank-Verbindungsfehler: ${err.message}`);
    process.exit(1);
  }
  console.log("[PowerLog] Datenbank erfolgreich verbunden.");
});

app.use(cors());
app.use(express.json());

// Tabellen initialisieren
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
      console.log("[PowerLog] Datenbank-Schema bereit.");
    }
  });
});

// API Routes
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
  if (!b.id || !b.name) {
    return res.status(400).json({ error: "Invalid battery data: Missing id or name" });
  }
  
  const historyJson = JSON.stringify(b.chargingHistory || []);
  
  const sql = `REPLACE INTO batteries (
    id, name, brand, size, category, quantity, totalQuantity, 
    minQuantity, inUse, usageAccumulator, capacityMah, chargeCycles, 
    lastCharged, chargingHistory
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [
    b.id, 
    b.name, 
    b.brand || '', 
    b.size || b.name, 
    b.category, 
    b.quantity || 0, 
    b.totalQuantity || 0, 
    b.minQuantity || 0, 
    b.inUse || 0, 
    b.usageAccumulator || 0, 
    b.capacityMah || 0, 
    b.chargeCycles || 0, 
    b.lastCharged || '', 
    historyJson
  ], function(err) {
    if (err) {
      console.error("[PowerLog] SQL Fehler beim Speichern:", err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log(`[PowerLog] Eintrag gespeichert: ${b.name} (${b.id})`);
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
    res.status(404).send("index.html nicht gefunden.");
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PowerLog] ✅ Server läuft auf http://0.0.0.0:${PORT}`);
});

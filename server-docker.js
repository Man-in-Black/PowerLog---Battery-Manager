import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3030;

console.log("--- PowerLog Startvorgang ---");

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
    if (err) console.error("[PowerLog] Fehler beim Erstellen der Tabelle:", err.message);
  });
});

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
  if (!b.id || !b.name) return res.status(400).json({ error: "Invalid battery data" });
  const historyJson = JSON.stringify(b.chargingHistory || []);
  const stmt = db.prepare(`REPLACE INTO batteries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  stmt.run([
    b.id, b.name, b.brand, b.size, b.category, b.quantity,
    b.totalQuantity, b.minQuantity, b.inUse, b.usageAccumulator,
    b.capacityMah, b.chargeCycles, b.lastCharged, historyJson
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

// Statische Dateien aus dist servieren (Vite Build Output)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA Fallback
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("index.html nicht gefunden. Build-Fehler?");
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PowerLog] ✅ Server läuft auf http://0.0.0.0:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[PowerLog] KRITISCH: Port ${PORT} wird bereits verwendet!`);
  } else {
    console.error(`[PowerLog] KRITISCH: Serverfehler: ${err.message}`);
  }
  process.exit(1);
});

import { Platform } from 'react-native';
import type { AnomalyFleetSummary } from '../types';

// On web, expo-sqlite's synchronous APIs crash at import time.
// Use a simple in-memory cache as fallback.
let memoryCache: { data: AnomalyFleetSummary; updatedAt: string } | null = null;

let db: any = null;

function getDb() {
  if (db !== undefined && db !== null) return db;
  if (Platform.OS === 'web') {
    db = null;
    return null;
  }
  try {
    const SQLite = require('expo-sqlite');
    db = SQLite.openDatabaseSync('sagarview.db');
    db.execSync('CREATE TABLE IF NOT EXISTS fleet_cache (id TEXT PRIMARY KEY, payload TEXT, updated_at TEXT);');
  } catch (e) {
    console.warn('SQLite unavailable, using in-memory cache', e);
    db = null;
  }
  return db;
}

export function saveFleetSummary(data: AnomalyFleetSummary) {
  const now = new Date().toISOString();
  memoryCache = { data, updatedAt: now };

  const database = getDb();
  if (!database) return;
  try {
    database.runSync(
      'INSERT OR REPLACE INTO fleet_cache (id, payload, updated_at) VALUES (?, ?, ?)',
      ['latest', JSON.stringify(data), now]
    );
  } catch (e) {
    console.warn('Failed to save fleet summary to SQLite', e);
  }
}

export function loadFleetSummary(): { data: AnomalyFleetSummary; updatedAt: string } | null {
  const database = getDb();
  if (!database) return memoryCache;
  try {
    const row = database.getFirstSync<{ payload: string; updated_at: string }>(
      'SELECT payload, updated_at FROM fleet_cache WHERE id = ?',
      ['latest']
    );
    if (row) {
      const result = { data: JSON.parse(row.payload), updatedAt: row.updated_at };
      memoryCache = result;
      return result;
    }
    return memoryCache;
  } catch (e) {
    console.warn('Failed to load fleet summary from SQLite', e);
    return memoryCache;
  }
}

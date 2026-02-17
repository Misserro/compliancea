import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if running on Railway (has /data volume)
const isRailway = fs.existsSync("/data");

export const DATA_DIR = isRailway ? "/data" : path.join(__dirname, "..");
export const DOCUMENTS_DIR = path.join(DATA_DIR, "documents");
export const GDRIVE_DIR = path.join(DOCUMENTS_DIR, "gdrive");
export const DB_DIR = path.join(DATA_DIR, "db");
export const DB_PATH = path.join(DB_DIR, "database.sqlite");

// Export for logging
export { isRailway };

/**
 * Ensure required directories exist
 */
export function ensureDirectories() {
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(GDRIVE_DIR)) {
    fs.mkdirSync(GDRIVE_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

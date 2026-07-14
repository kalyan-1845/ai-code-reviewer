import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_COLLECTION = '_migrations';

const migrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
});

let MigrationModel;
function getMigrationModel() {
  if (!MigrationModel) {
    MigrationModel = mongoose.model('_Migration', migrationSchema, MIGRATIONS_COLLECTION);
  }
  return MigrationModel;
}

function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();
  return files.map(file => {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const name = file.replace(/\.js$/, '');
    return { name, filePath };
  });
}

export async function runMigrations() {
  const db = mongoose.connection.db;
  if (!db) {
    console.log('[migrate] No database connection - skipping migrations');
    return;
  }

  const collections = await db.listCollections({ name: MIGRATIONS_COLLECTION }).toArray();
  if (collections.length === 0) {
    await db.createCollection(MIGRATIONS_COLLECTION);
  }

  const Migration = getMigrationModel();
  const applied = await Migration.find({}).lean();
  const appliedNames = new Set(applied.map(m => m.name));
  const available = loadMigrations();

  if (available.length === 0) {
    console.log('[migrate] No pending migrations');
    return;
  }

  for (const migration of available) {
    if (appliedNames.has(migration.name)) {
      continue;
    }
    try {
      const mod = await import(migration.filePath);
      if (typeof mod.up !== 'function') {
        console.warn(`[migrate] Migration ${migration.name} has no up() function - skipping`);
        continue;
      }
      console.log(`[migrate] Running migration: ${migration.name}...`);
      await mod.up(db);
      await Migration.create({ name: migration.name });
      console.log(`[migrate] Migration ${migration.name} applied`);
    } catch (err) {
      console.error(`[migrate] Migration ${migration.name} failed:`, err.message);
      throw err;
    }
  }
}

export default { runMigrations };

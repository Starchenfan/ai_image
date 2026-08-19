import mysql, {
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import type { Preset } from "./types";
import { uid } from "./cn";

const globalForPresets = globalThis as unknown as {
  presetsMysqlPool?: Pool;
  presetsSchemaPromise?: Promise<void>;
};

function isConfigured() {
  return Boolean(process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function getPool() {
  if (!globalForPresets.presetsMysqlPool) {
    globalForPresets.presetsMysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      maxIdle: 5,
    });
  }
  return globalForPresets.presetsMysqlPool;
}

async function ensureSchema() {
  if (!isConfigured()) return;
  if (!globalForPresets.presetsSchemaPromise) {
    globalForPresets.presetsSchemaPromise = (async () => {
      const pool = getPool();
      await pool.execute(`CREATE TABLE IF NOT EXISTS presets (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        model_id VARCHAR(64) NOT NULL,
        prompt TEXT NULL,
        negative_prompt TEXT NULL,
        count INT NOT NULL DEFAULT 1,
        aspect_ratio VARCHAR(32) NOT NULL DEFAULT '1:1',
        image_size VARCHAR(32) NOT NULL,
        seed BIGINT NOT NULL DEFAULT -1,
        parameters JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    })().catch((error) => {
      globalForPresets.presetsSchemaPromise = undefined;
      throw error;
    });
  }
  await globalForPresets.presetsSchemaPromise;
}

/** In-memory fallback when MySQL is not configured. */
const memPresets: Preset[] = [];

type PresetRow = RowDataPacket & {
  id: string;
  name: string;
  service_id: string;
  model_id: string;
  prompt: string | null;
  negative_prompt: string | null;
  count: number;
  aspect_ratio: string;
  image_size: string;
  seed: number | string;
  parameters: unknown;
  created_at: Date | string;
};

function parseParams(value: unknown): Preset["parameters"] {
  if (!value) return {};
  if (typeof value === "object" && !Buffer.isBuffer(value)) {
    return value as Preset["parameters"];
  }
  try {
    return JSON.parse(Buffer.isBuffer(value) ? value.toString("utf8") : String(value));
  } catch {
    return {};
  }
}

function rowToPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    serviceId: row.service_id,
    modelId: row.model_id,
    prompt: row.prompt || undefined,
    negativePrompt: row.negative_prompt || undefined,
    count: Number(row.count || 1),
    aspectRatio: row.aspect_ratio || "1:1",
    size: row.image_size,
    seed: Number(row.seed ?? -1),
    parameters: parseParams(row.parameters),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function listPresets(): Promise<Preset[]> {
  if (!isConfigured()) {
    return [...memPresets].sort((a, b) => b.createdAt - a.createdAt);
  }
  try {
    await ensureSchema();
    const [rows] = await getPool().query<PresetRow[]>(
      "SELECT * FROM presets ORDER BY created_at DESC"
    );
    return rows.map(rowToPreset);
  } catch (error) {
    console.error("Failed to read presets:", error);
    return [...memPresets];
  }
}

export async function createPreset(
  p: Omit<Preset, "id" | "createdAt">
): Promise<Preset> {
  const preset: Preset = { ...p, id: uid("preset"), createdAt: Date.now() };
  if (!isConfigured()) {
    memPresets.unshift(preset);
    return preset;
  }
  try {
    await ensureSchema();
    await getPool().execute(
      `INSERT INTO presets (
        id, name, service_id, model_id, prompt, negative_prompt, count,
        aspect_ratio, image_size, seed, parameters, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        preset.id,
        preset.name,
        preset.serviceId,
        preset.modelId,
        preset.prompt || null,
        preset.negativePrompt || null,
        preset.count,
        preset.aspectRatio,
        preset.size,
        preset.seed,
        JSON.stringify(preset.parameters),
        new Date(preset.createdAt),
      ]
    );
    return preset;
  } catch (error) {
    console.error("Failed to create preset:", error);
    memPresets.unshift(preset);
    return preset;
  }
}

export async function deletePreset(id: string): Promise<boolean> {
  if (!isConfigured()) {
    const i = memPresets.findIndex((p) => p.id === id);
    if (i === -1) return false;
    memPresets.splice(i, 1);
    return true;
  }
  try {
    await ensureSchema();
    const [r] = await getPool().execute<ResultSetHeader>(
      "DELETE FROM presets WHERE id = ?",
      [id]
    );
    return r.affectedRows > 0;
  } catch (error) {
    console.error("Failed to delete preset:", error);
    return false;
  }
}

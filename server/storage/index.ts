import { D1Adapter, readD1Credentials } from "./d1";
import { LocalAdapter, openLocalDb } from "./local";
import { initAdapter } from "./bootstrap";
import type { BatchItem, StorageMode } from "./types";

export * from "./types";

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export const localAdapter = new LocalAdapter(openLocalDb());

const d1Credentials = readD1Credentials();
export const d1Adapter: D1Adapter | null = d1Credentials ? new D1Adapter(d1Credentials) : null;

/** ENV STORAGE_MODE, when set, locks the switch across restarts. */
export const envMode: StorageMode | null =
  process.env.STORAGE_MODE?.trim().toLowerCase() === "d1"
    ? "d1"
    : process.env.STORAGE_MODE?.trim().toLowerCase() === "local"
      ? "local"
      : null;

// ---------------------------------------------------------------------------
// Runtime mode — persisted in the LOCAL database only, because it must be
// readable before any remote adapter exists.
// ---------------------------------------------------------------------------

type ModeSource = "env" | "settings" | "default";

let current: { kind: StorageMode; adapter: LocalAdapter | D1Adapter } | null = null;
let localInitDone = false;
export const d1State: { booted: boolean; lastError: string | null; fallbackActive: boolean } = {
  booted: false,
  lastError: null,
  fallbackActive: false,
};

/** Init D1 schema with retries; records the last precise failure in d1State. */
async function ensureD1Initialized(retries = 3): Promise<boolean> {
  if (!d1Adapter) return false;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initAdapter(d1Adapter);
      d1State.booted = true;
      d1State.lastError = null;
      d1State.fallbackActive = false;
      return true;
    } catch (err) {
      d1State.lastError = err instanceof Error ? err.message : String(err);
      if (attempt < retries) await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  d1State.booted = false;
  return false;
}

async function bootstrap(): Promise<void> {
  await initAdapter(localAdapter);
  localInitDone = true;

  let stored: string | null = null;
  try {
    const row = await localAdapter.prepare(`SELECT value FROM settings WHERE key = 'storage_mode'`).get();
    stored = row?.value ?? null;
  } catch {
    /* fresh db edge case — defaults apply */
  }

  let kind: StorageMode;
  if (envMode) {
    kind = envMode;
  } else if (stored === "d1" && d1Adapter) {
    kind = "d1";
  } else {
    kind = "local";
  }
  if (kind === "d1" && !d1Adapter) kind = "local";

  if (d1Adapter) {
    const ok = await ensureD1Initialized();
    if (!ok && kind === "d1") {
      // Never serve requests against an un-initialized remote — degrade to
      // local so the app stays functional and the Settings UI shows why.
      console.error("[storage] D1 init failed — serving from LOCAL until it recovers:", d1State.lastError);
      d1State.fallbackActive = true;
      kind = "local";
    }
  }

  current = { kind, adapter: kind === "d1" ? d1Adapter! : localAdapter };
}

const bootstrapPromise = bootstrap().catch((err) => {
  console.error("[storage] bootstrap failed:", err);
});

/** Resolves once the active adapter is usable (schema ensured on both backends). */
export function storageReady(): Promise<void> {
  return bootstrapPromise;
}

export function activeKind(): StorageMode {
  return current?.kind ?? (envMode ?? "local");
}

export function activeSource(): ModeSource {
  if (envMode) return "env";
  if (!localInitDone) return "default";
  return "settings";
}

/** The adapter every content/config query should use. */
export function activeStorage() {
  if (!current) throw new Error("Storage not initialized yet");
  return current.adapter;
}

export async function setRuntimeMode(mode: StorageMode): Promise<void> {
  if (envMode) {
    throw new Error(`Switching is locked by the STORAGE_MODE env var (currently '${envMode}').`);
  }
  await bootstrapPromise;
  if (mode === "d1") {
    if (!d1Adapter) {
      throw new Error(
        "Cloudflare D1 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN."
      );
    }
    if (!d1State.booted || d1State.lastError) {
      // Retry so a transient boot-time network issue doesn't block switching.
      const ok = await ensureD1Initialized();
      if (!ok) {
        throw new Error(`Cannot reach Cloudflare D1: ${d1State.lastError}`);
      }
    }
  }
  current = { kind: mode, adapter: mode === "d1" ? d1Adapter! : localAdapter };
  await localAdapter
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('storage_mode', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(mode);
}

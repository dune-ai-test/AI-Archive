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
export const d1State: { booted: boolean; lastError: string | null } = {
  booted: false,
  lastError: null,
};

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

  current = { kind, adapter: kind === "d1" ? d1Adapter! : localAdapter };

  if (d1Adapter) {
    try {
      await initAdapter(d1Adapter);
      d1State.booted = true;
      d1State.lastError = null;
    } catch (err) {
      d1State.lastError = err instanceof Error ? err.message : String(err);
      console.error("[storage] D1 bootstrap failed:", d1State.lastError);
    }
  }
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
      // Retry once so a transient boot-time network issue doesn't block switching.
      try {
        await initAdapter(d1Adapter);
        d1State.booted = true;
        d1State.lastError = null;
      } catch (err) {
        d1State.lastError = err instanceof Error ? err.message : String(err);
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

import { SAVE_SCHEMA_VERSION } from "../storage/outcomes";
import type {
  GeoSave,
  LedgerEntry,
  LedgerOutcome,
  LegacyStreakBaseline,
  TrophyMapEntry,
} from "../storage/outcomes";

/**
 * Save-code codec (US-019) — the whole player state as one copy-pasteable
 * string. Pure: no DOM, no storage, no clock. This is deliberately the same
 * payload a future Supabase sync would push, so it stays a standalone module
 * that `lib/storage` and `lib/streak` call rather than the other way round.
 *
 * Wire format: `GEO1.<base64url(compact JSON)>.<checksum>`
 *
 * - `GEO1` is the CODEC version — how the frame itself is built. A code from
 *   a future codec (`GEO2…`) is rejected by name rather than misparsed.
 * - The payload's first element is the SAVE SCHEMA version, migrated on
 *   decode (see `migrateCompact`). Two versions, two jobs: the frame can stay
 *   put while the state inside it grows.
 * - The checksum makes truncated/typo'd pastes fail loudly. base64url is
 *   URL- and clipboard-safe but does contain look-alike characters (O/0,
 *   I/l), so a paste that loses or mangles a character is caught here rather
 *   than being decoded into a plausible-but-wrong history.
 */

export const SAVE_CODE_CODEC_VERSION = 1;
export const SAVE_CODE_PREFIX = `GEO${SAVE_CODE_CODEC_VERSION}`;

/** Day offsets are counted from here, so a date costs ~4 chars instead of 12. */
const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_DAY = 86_400_000;

const OUTCOMES: readonly LedgerOutcome[] = ["solved", "solved_late", "failed", "frozen"];
const TIERS: readonly TrophyMapEntry["tier"][] = ["in_time", "late"];

/** Ledger row: [day offset, outcome code, score, country dictionary index]. */
type CompactLedgerRow = [number, number, number, number];
/** Trophy row: [country dictionary index, tier code, day offset]. */
type CompactTrophyRow = [number, number, number];
/** Legacy streak baseline: [current, longest, last played day offset | null]. */
type CompactStreak = [number, number, number | null];
/**
 * Country codes are pulled into a dictionary and referenced by index: a
 * ledger repeats the same ~190 codes for years, and the quoted 3-letter code
 * is otherwise the biggest single field in every row.
 */
type CompactSave = [number, string[], CompactLedgerRow[], CompactTrophyRow[], CompactStreak?];

export type DecodeFailureReason =
  | "empty"
  | "not_a_save_code"
  | "newer_codec"
  | "checksum"
  | "corrupt"
  | "newer_schema";

export type DecodeResult =
  | { ok: true; save: GeoSave; migratedFrom: number | null }
  | { ok: false; reason: DecodeFailureReason; message: string };

// ── date <-> day offset ────────────────────────────────────────────────────

function dateToDay(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - EPOCH_MS) / MS_PER_DAY);
}

function dayToDate(day: number): string | null {
  if (!Number.isInteger(day)) return null;
  const ms = EPOCH_MS + day * MS_PER_DAY;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

// ── base64url ──────────────────────────────────────────────────────────────

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const remaining = bytes.length - i;
    out += B64URL[(chunk >> 18) & 63] + B64URL[(chunk >> 12) & 63];
    if (remaining > 1) out += B64URL[(chunk >> 6) & 63];
    if (remaining > 2) out += B64URL[chunk & 63];
  }
  return out;
}

function base64urlToBytes(text: string): Uint8Array | null {
  const bits: number[] = [];
  for (const char of text) {
    const value = B64URL.indexOf(char);
    if (value < 0) return null;
    bits.push(value);
  }
  // A trailing group of exactly 1 sextet carries no whole byte — malformed.
  if (bits.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((bits.length * 6) / 8));
  let index = 0;
  for (let i = 0; i < bits.length; i += 4) {
    const chunk =
      (bits[i] << 18) | ((bits[i + 1] ?? 0) << 12) | ((bits[i + 2] ?? 0) << 6) | (bits[i + 3] ?? 0);
    const remaining = bits.length - i;
    bytes[index++] = (chunk >> 16) & 255;
    if (remaining > 2) bytes[index++] = (chunk >> 8) & 255;
    if (remaining > 3) bytes[index++] = chunk & 255;
  }
  return bytes;
}

// ── checksum ───────────────────────────────────────────────────────────────

/** FNV-1a 32-bit, base36 — short, dependency-free, and plenty for typo detection. */
export function checksum(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase();
}

// ── framing ────────────────────────────────────────────────────────────────

/**
 * Wraps an already-compacted payload in the versioned, checksummed frame.
 * Exported so tests (and any future migration fixture) can mint codes for
 * schema versions this build no longer writes.
 */
export function frameCode(compact: unknown, prefix: string = SAVE_CODE_PREFIX): string {
  const payload = bytesToBase64url(new TextEncoder().encode(JSON.stringify(compact)));
  return `${prefix}.${payload}.${checksum(payload)}`;
}

// ── encode ─────────────────────────────────────────────────────────────────

/** Interns country codes in first-seen order, returning stable indices. */
function codeDictionary() {
  const codes: string[] = [];
  const index = new Map<string, number>();
  return {
    codes,
    idFor(code: string): number {
      const existing = index.get(code);
      if (existing !== undefined) return existing;
      const id = codes.push(code) - 1;
      index.set(code, id);
      return id;
    },
  };
}

function compactSave(save: GeoSave): CompactSave {
  const dictionary = codeDictionary();

  const ledger: CompactLedgerRow[] = [];
  for (const [date, entry] of Object.entries(save.ledger).sort(([a], [b]) => a.localeCompare(b))) {
    const day = dateToDay(date);
    const outcome = OUTCOMES.indexOf(entry.outcome);
    if (day === null || outcome < 0) continue; // Unwritable rows are dropped, never guessed at.
    ledger.push([
      day,
      outcome,
      Math.max(0, Math.round(entry.score)) || 0,
      dictionary.idFor(entry.target ?? ""),
    ]);
  }

  const trophies: CompactTrophyRow[] = [];
  for (const [code, entry] of Object.entries(save.trophyMap).sort(([a], [b]) => a.localeCompare(b))) {
    const day = dateToDay(entry.date);
    const tier = TIERS.indexOf(entry.tier);
    if (day === null || tier < 0) continue;
    trophies.push([dictionary.idFor(code), tier, day]);
  }

  const compact: CompactSave = [SAVE_SCHEMA_VERSION, dictionary.codes, ledger, trophies];
  if (save.streakMigration) {
    const { current_streak, longest_streak, last_played_date } = save.streakMigration;
    compact.push([
      Math.max(0, Math.round(current_streak)) || 0,
      Math.max(0, Math.round(longest_streak)) || 0,
      last_played_date ? dateToDay(last_played_date) : null,
    ]);
  }
  return compact;
}

export function encodeSaveCode(save: GeoSave): string {
  return frameCode(compactSave(save));
}

// ── decode ─────────────────────────────────────────────────────────────────

function fail(reason: DecodeFailureReason, message: string): DecodeResult {
  return { ok: false, reason, message };
}

const CORRUPT_MESSAGE =
  "That save code is damaged or incomplete. Copy the whole code and try again — nothing was changed.";

function isRow(value: unknown, length: number): value is unknown[] {
  return Array.isArray(value) && value.length >= length;
}

/**
 * Brings an older payload up to the current save schema.
 *
 * v0 (pre-trophy-map) carried only a ledger; its trophies are re-derived from
 * the solves already in that ledger, which is exactly how `recordOutcome`
 * writes them — so the migration adds no information the code didn't have.
 */
function migrateCompact(compact: unknown[]): { compact: CompactSave; from: number } | null {
  const version = compact[0];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return null;
  if (version === SAVE_SCHEMA_VERSION) return { compact: compact as CompactSave, from: version };
  if (version === 0) {
    // v0 rows carried the country code inline: [day, outcome, score, "PER"].
    const rows: unknown[] = Array.isArray(compact[1]) ? compact[1] : [];
    const dictionary = codeDictionary();
    const ledger: CompactLedgerRow[] = [];
    const trophies: CompactTrophyRow[] = [];
    for (const row of rows) {
      if (!isRow(row, 4)) return null;
      const [day, outcome, score, target] = row;
      if (typeof day !== "number" || typeof outcome !== "number") return null;
      if (typeof score !== "number" || typeof target !== "string") return null;
      const code = dictionary.idFor(target);
      ledger.push([day, outcome, score, code]);
      if (target !== "" && (outcome === 0 || outcome === 1)) {
        trophies.push([code, outcome, day]); // solved | solved_late → in_time | late
      }
    }
    return { compact: [SAVE_SCHEMA_VERSION, dictionary.codes, ledger, trophies], from: 0 };
  }
  return null;
}

function expandSave(compact: CompactSave): GeoSave | null {
  const [, codes, ledgerRows, trophyRows] = compact;
  if (!Array.isArray(codes) || !Array.isArray(ledgerRows) || !Array.isArray(trophyRows)) return null;
  if (codes.some((code) => typeof code !== "string")) return null;

  const ledger: Record<string, LedgerEntry> = {};
  for (const row of ledgerRows) {
    if (!isRow(row, 4)) return null;
    const [day, outcome, score, code] = row;
    if (typeof day !== "number" || typeof outcome !== "number") return null;
    if (typeof score !== "number" || typeof code !== "number") return null;
    const date = dayToDate(day);
    const kind = OUTCOMES[outcome];
    const target = codes[code];
    if (date === null || !kind || target === undefined || !Number.isFinite(score)) return null;
    ledger[date] = { outcome: kind, score: Math.max(0, Math.round(score)), target };
  }

  const trophyMap: Record<string, TrophyMapEntry> = {};
  for (const row of trophyRows) {
    if (!isRow(row, 3)) return null;
    const [code, tier, day] = row;
    if (typeof code !== "number" || typeof tier !== "number" || typeof day !== "number") return null;
    const date = dayToDate(day);
    const kind = TIERS[tier];
    const target = codes[code];
    if (date === null || !kind || !target) return null;
    trophyMap[target] = { tier: kind, date };
  }

  const save: GeoSave = { version: SAVE_SCHEMA_VERSION, ledger, trophyMap };

  const streak = compact[4];
  if (streak !== undefined) {
    if (!isRow(streak, 3)) return null;
    const [current, longest, lastDay] = streak;
    if (typeof current !== "number" || typeof longest !== "number") return null;
    if (lastDay !== null && typeof lastDay !== "number") return null;
    const lastPlayed = lastDay === null ? null : dayToDate(lastDay);
    if (lastDay !== null && lastPlayed === null) return null;
    const baseline: LegacyStreakBaseline = {
      current_streak: Math.max(0, Math.round(current)),
      longest_streak: Math.max(0, Math.round(longest)),
      last_played_date: lastPlayed,
    };
    save.streakMigration = baseline;
  }

  return save;
}

/**
 * Parses a pasted save code. Never throws and never partially applies — the
 * caller gets either a complete save or a message to show the player.
 */
export function decodeSaveCode(input: string): DecodeResult {
  // Clipboards and chat apps love to inject newlines and stray spaces.
  const cleaned = (input ?? "").replace(/\s+/g, "");
  if (cleaned === "") return fail("empty", "Paste a save code first.");

  const parts = cleaned.split(".");
  if (parts.length !== 3 || parts.some((part) => part === "")) {
    return fail("not_a_save_code", "That doesn't look like a Geo save code.");
  }

  const [rawPrefix, payload, stamp] = parts;
  const prefix = rawPrefix.toUpperCase();
  if (prefix !== SAVE_CODE_PREFIX) {
    const match = /^GEO(\d+)$/.exec(prefix);
    if (match && Number(match[1]) > SAVE_CODE_CODEC_VERSION) {
      return fail("newer_codec", "That save code comes from a newer version of Geo. Update the game, then import it.");
    }
    return fail("not_a_save_code", "That doesn't look like a Geo save code.");
  }

  if (stamp.toUpperCase() !== checksum(payload)) {
    return fail("checksum", CORRUPT_MESSAGE);
  }

  const bytes = base64urlToBytes(payload);
  if (!bytes) return fail("corrupt", CORRUPT_MESSAGE);

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail("corrupt", CORRUPT_MESSAGE);
  }
  // Length 2 is the v0 shape (version + ledger); migrateCompact widens it.
  if (!Array.isArray(parsed) || parsed.length < 2) return fail("corrupt", CORRUPT_MESSAGE);

  const version = parsed[0];
  if (typeof version === "number" && Number.isInteger(version) && version > SAVE_SCHEMA_VERSION) {
    return fail("newer_schema", "That save code holds newer data than this version of Geo understands. Update the game, then import it.");
  }

  const migrated = migrateCompact(parsed);
  if (!migrated) return fail("corrupt", CORRUPT_MESSAGE);

  const save = expandSave(migrated.compact);
  if (!save) return fail("corrupt", CORRUPT_MESSAGE);

  return { ok: true, save, migratedFrom: migrated.from === SAVE_SCHEMA_VERSION ? null : migrated.from };
}

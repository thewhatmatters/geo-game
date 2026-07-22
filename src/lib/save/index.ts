import { readSave, writeSave } from "../storage/outcomes";
import type { GeoSave } from "../storage/outcomes";
import { decodeSaveCode, encodeSaveCode } from "./codec";
import { mergeSaves } from "./merge";

export {
  SAVE_CODE_PREFIX,
  SAVE_CODE_CODEC_VERSION,
  checksum,
  decodeSaveCode,
  encodeSaveCode,
  frameCode,
} from "./codec";
export type { DecodeFailureReason, DecodeResult } from "./codec";
export { betterEntry, mergeSaves } from "./merge";

export type ImportResult =
  | { ok: true; save: GeoSave; message: string }
  | { ok: false; message: string };

/**
 * Decode → merge → persist, in that order, so a bad code never reaches
 * storage. The one storage-touching function in this module; everything
 * above it (`codec`, `merge`) stays pure so the same payload can be handed
 * to a sync backend later.
 */
export function importSaveCode(
  code: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): ImportResult {
  const decoded = decodeSaveCode(code);
  if (!decoded.ok) return { ok: false, message: decoded.message };

  const local = readSave(storage);
  const merged = mergeSaves(local, decoded.save);
  writeSave(merged, storage);

  const days = Object.keys(merged.ledger).length;
  const countries = Object.keys(merged.trophyMap).length;
  const migrated = decoded.migratedFrom !== null ? " Older save format upgraded." : "";
  return {
    ok: true,
    save: merged,
    message: `Save restored — ${days} day${days === 1 ? "" : "s"} on record, ${countries} countr${countries === 1 ? "y" : "ies"} claimed.${migrated}`,
  };
}

/** The player's current state as a code, read through the storage seam. */
export function exportSaveCode(
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): string {
  return encodeSaveCode(readSave(storage));
}

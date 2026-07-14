import countriesData from "../../data/countries.json";

export interface Country {
  name: string;
  path: string;
  centroid: { lat: number; lng: number };
  neighbor_codes: string[];
  unique_letters: number;
  is_island: boolean;
}

export type CountryCode = string;

const countries = countriesData as Record<CountryCode, Country>;

// Sorted for a stable, reproducible index order independent of JSON key order.
const countryCodes = Object.keys(countries).sort();

export function getCountry(code: CountryCode): Country {
  return countries[code];
}

/** Every country keyed by code — used by the world-map backdrop layer (see WorldMapLayer), which renders all of them at once rather than looking each up individually. */
export function getAllCountries(): Record<CountryCode, Country> {
  return countries;
}

export interface DailySelection {
  date: string;
  targetCode: CountryCode;
  target: Country;
  neighborCodes: CountryCode[];
}

/**
 * FNV-1a variant string hash. Not cryptographic — we only need a stable,
 * well-distributed bucket index that's identical for every player given
 * the same input string, not collision resistance or unpredictability.
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

/**
 * Neighbor slots are always fixed at 3 (see CLAUDE.md). When a country has
 * more than 3 land neighbors, the PRD leaves the exact selection rule
 * unspecified beyond "deterministic, seeded like the daily country" — this
 * picks the same way the daily country itself is picked: hash each
 * candidate neighbor (salted with the date and target code so the ordering
 * differs per day), sort by that hash, and keep the first 3. Countries with
 * 0 neighbors (islands) naturally fall through to an empty list.
 */
export function selectNeighborSubset(
  dateString: string,
  targetCode: CountryCode,
  target: Pick<Country, "neighbor_codes">,
): CountryCode[] {
  if (target.neighbor_codes.length <= 3) {
    return [...target.neighbor_codes];
  }
  return target.neighbor_codes
    .map((code) => ({ code, hash: hashString(`${dateString}:${targetCode}:${code}`) }))
    .sort((a, b) => a.hash - b.hash)
    .slice(0, 3)
    .map((entry) => entry.code);
}

/**
 * Deterministically picks today's target country and its neighbor subset
 * from a UTC calendar date: hash(UTC date) mod country_count. Identical
 * input always yields identical output, so every player sees the same
 * puzzle on the same day.
 */
export function getDailyCountry(date: Date): DailySelection {
  const dateString = toUtcDateString(date);
  const targetIndex = hashString(dateString) % countryCodes.length;
  const targetCode = countryCodes[targetIndex];
  const target = countries[targetCode];

  return {
    date: dateString,
    targetCode,
    target,
    neighborCodes: selectNeighborSubset(dateString, targetCode, target),
  };
}

// Build-time script (not part of the app bundle): merges US-002's outline +
// centroid data with neighbor adjacency (from a local world-countries
// snapshot) and name-difficulty metadata, writing src/data/countries.json.
// Re-run via `npm run gen:countries` whenever countries-geo.json or the
// world-countries dependency is updated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worldCountries from 'world-countries/countries.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO_PATH = path.join(__dirname, '../src/data/countries-geo.json');
const OUT_PATH = path.join(__dirname, '../src/data/countries.json');

const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf-8'));
const geoCodes = new Set(Object.keys(geo));

// world-countries (a static npm snapshot derived from restcountries.com)
// keys Kosovo as "UNK" (the provisional UN/ISO code), while US-002 keyed it
// as the slug "KOSOVO" since it has no real ISO 3166-1 numeric id. Remap in
// both directions so Kosovo's own borders resolve and so other countries'
// `borders` entries referencing "UNK" point at our "KOSOVO" key.
const UNK_ALIAS = 'KOSOVO';
const wcByCode = new Map();
for (const country of worldCountries) {
  const code = country.cca3 === 'UNK' ? UNK_ALIAS : country.cca3;
  wcByCode.set(code, country);
}

// restcountries.com's `borders` field (and this world-countries snapshot of
// it) lists Sri Lanka as bordering India via the historical Adam's
// Bridge/Ram Setu land connection, which has been fully submerged for
// centuries — a long-documented quirk of that dataset. CLAUDE.md explicitly
// names Sri Lanka as a 0-land-neighbor island example for this game, so that
// one phantom entry is dropped here rather than left in.
const PHANTOM_BORDERS = { LKA: ['IND'] };

function uniqueLetterCount(name) {
  const letters = name.toLowerCase().replace(/[^a-z]/g, '');
  return new Set(letters).size;
}

const result = {};
let withAdjacency = 0;
for (const [code, entry] of Object.entries(geo)) {
  const wc = wcByCode.get(code);
  // restcountries.com's `borders` field (the source CLAUDE.md names for this
  // story) is fully deprecated as of this session; world-countries ships the
  // same data as a static npm snapshot, so it's used as a drop-in local
  // replacement. A handful of restcountries/world-countries territories
  // (Gibraltar, French Guiana, etc.) aren't present in world-atlas's 50m
  // topology at all, so any border reference to them is dropped rather than
  // pointing at a country with no outline data.
  const rawBorders = wc ? wc.borders ?? [] : null;
  const phantoms = PHANTOM_BORDERS[code] ?? [];
  const neighborCodes = rawBorders
    ? rawBorders
        .map((b) => (b === 'UNK' ? UNK_ALIAS : b))
        .filter((b) => geoCodes.has(b) && !phantoms.includes(b))
    : [];

  if (wc) withAdjacency++;

  result[code] = {
    name: entry.name,
    fun_fact: entry.fun_fact,
    // Flag emoji (world-countries' own `flag` field — regional-indicator
    // pair for the country's cca2). Only ever shown for a SOLVED share
    // string; empty for the handful of world-atlas territories with no
    // world-countries record, and the share string just omits it then.
    flag: wc?.flag ?? '',
    path: entry.path,
    centroid: entry.centroid,
    neighbor_codes: neighborCodes,
    unique_letters: uniqueLetterCount(entry.name),
    is_island: neighborCodes.length === 0,
  };
}

const invalidFacts = Object.entries(result)
  .filter(([, entry]) => typeof entry.fun_fact !== 'string' || entry.fun_fact.trim() === '')
  .map(([code]) => code);
if (invalidFacts.length > 0) {
  throw new Error(`Missing non-empty fun_fact after metadata merge for: ${invalidFacts.join(', ')}`);
}

fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');

console.log(
  `Wrote ${Object.keys(result).length} countries to ${path.relative(process.cwd(), OUT_PATH)} ` +
    `(${withAdjacency} matched a world-countries adjacency record, ${Object.keys(result).length - withAdjacency} have no source data and are treated as islands)`,
);

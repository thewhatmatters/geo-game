// Build-time script (not part of the app bundle): reads world-atlas's 50m
// TopoJSON, projects each country to an SVG outline path, and writes
// src/data/countries-geo.json. Re-run via `npm run gen:countries-geo`
// whenever world-atlas is upgraded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath, geoCentroid } from 'd3-geo';
import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json' with { type: 'json' };
import worldCountries from 'world-countries/countries.json' with { type: 'json' };

countries.registerLocale(en);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '../src/data/countries-geo.json');
const FACTS_PATH = path.join(__dirname, '../src/data/country-facts-review.json');

const facts = JSON.parse(fs.readFileSync(FACTS_PATH, 'utf-8'));

const MANUAL_DEMONYMS = {
  KOSOVO: ['Kosovar'],
  SOMALILAND: ['Somalilander'],
  'N-CYPRUS': ['Turkish Cypriot'],
};
const MANUAL_NAME_ALIASES = {
  VAT: ['Vatican', 'Vatican City'],
  MKD: ['Macedonia'],
};

function normalized(value) {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en');
}

function containsSpoiler(fact, term) {
  const haystack = normalized(fact);
  const needle = normalized(term).trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(haystack);
}

function sourceCountryFor(code) {
  return worldCountries.find(
    (entry) => (entry.cca3 === 'UNK' ? 'KOSOVO' : entry.cca3) === code,
  );
}

function demonymsFor(code) {
  const country = sourceCountryFor(code);
  const values = country?.demonyms?.eng ? Object.values(country.demonyms.eng) : [];
  return [...new Set([...values, ...(MANUAL_DEMONYMS[code] ?? [])])]
    .flatMap((value) => value.split(/,|\bor\b/i))
    .map((value) => value.trim())
    .filter(Boolean);
}

// Every country is projected into ONE shared coordinate frame (not an
// independent per-country fit-to-box) so that a target and its neighbors'
// paths share real relative scale and position — a neighbor's border lines
// up with the target's by construction, rather than two independently-
// normalized shapes placed near each other. The app computes a per-round
// viewBox from the target's own bounding box at render time (see
// src/lib/geo/scene.ts); WORLD_SIZE just needs to be large enough that
// coordinates aren't crushed into a tiny sub-pixel range.
const WORLD_SIZE = 4000;

// A handful of Natural Earth entries (disputed/minor territories) carry no
// ISO 3166-1 numeric id at all, so they have no alpha-3 code to key by. Per
// the "no manual overrides" rule we still include them (world-atlas's set of
// territories is taken as-is), keyed by a slug of their Natural Earth name
// instead of a real ISO code.
function slugKey(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const topology = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../node_modules/world-atlas/countries-50m.json'), 'utf-8'),
);
const collection = feature(topology, topology.objects.countries);

// Group Natural Earth geometries by resolved code: a few countries (e.g.
// Australia + its Ashmore and Cartier Islands territory) appear as more than
// one geometry sharing the same numeric id and must be merged into one
// country entry.
const groups = new Map();
for (const geoJsonFeature of collection.features) {
  const numericId = geoJsonFeature.id;
  const alpha3 = numericId ? countries.numericToAlpha3(String(numericId)) : undefined;
  const code = alpha3 ?? slugKey(geoJsonFeature.properties.name);
  const name = alpha3 ? countries.getName(alpha3, 'en') : geoJsonFeature.properties.name;

  if (!groups.has(code)) {
    groups.set(code, { name, geometries: [] });
  }
  groups.get(code).geometries.push(geoJsonFeature.geometry);
}

// One projection, fit to the whole world once — every country's path comes
// out of the SAME projection, so their coordinates are directly comparable.
const projection = geoEquirectangular().fitSize([WORLD_SIZE, WORLD_SIZE / 2], collection);
const pathGenerator = geoPath(projection);

const result = {};
for (const [code, { name, geometries }] of groups) {
  const mergedGeometry =
    geometries.length === 1
      ? geometries[0]
      : { type: 'GeometryCollection', geometries };

  const svgPath = pathGenerator(mergedGeometry);
  const [lng, lat] = geoCentroid(mergedGeometry);

  result[code] = {
    name,
    fun_fact: facts[code]?.fun_fact,
    path: svgPath,
    centroid: { lat, lng },
  };
}

const missingFacts = Object.entries(result)
  .filter(([, entry]) => typeof entry.fun_fact !== 'string' || entry.fun_fact.trim() === '')
  .map(([code]) => code);
if (missingFacts.length > 0) {
  throw new Error(`Missing non-empty fun_fact for: ${missingFacts.join(', ')}`);
}

const malformedReviewEntries = Object.entries(facts)
  .filter(([, review]) => typeof review.needsReview !== 'boolean')
  .map(([code]) => code);
if (malformedReviewEntries.length > 0) {
  throw new Error(`Review manifest entries need a boolean needsReview flag: ${malformedReviewEntries.join(', ')}`);
}

const spoilerViolations = Object.entries(result).flatMap(([code, entry]) => {
  const sourceCountry = sourceCountryFor(code);
  const forbidden = [
    entry.name,
    sourceCountry?.name?.common,
    sourceCountry?.name?.official,
    ...(MANUAL_NAME_ALIASES[code] ?? []),
    ...demonymsFor(code),
  ].filter(Boolean);
  return forbidden
    .filter((term) => containsSpoiler(entry.fun_fact, term))
    .map((term) => `${code} contains "${term}"`);
});
if (spoilerViolations.length > 0) {
  throw new Error(`fun_fact spoiler guard failed:\n${spoilerViolations.join('\n')}`);
}

const extraFacts = Object.keys(facts).filter((code) => !(code in result));
if (extraFacts.length > 0) {
  throw new Error(`Review manifest has unknown country codes: ${extraFacts.join(', ')}`);
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');

console.log(`Wrote ${Object.keys(result).length} countries to ${path.relative(process.cwd(), OUT_PATH)}`);

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

countries.registerLocale(en);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '../src/data/countries-geo.json');

// Fixed square viewBox every country's path is projected into (0 0 SIZE SIZE).
// CountryOutline (US-005) renders every outline against this same viewBox so
// tiny and huge countries both fill their box consistently.
const VIEWBOX_SIZE = 200;

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

const result = {};
for (const [code, { name, geometries }] of groups) {
  const mergedGeometry =
    geometries.length === 1
      ? geometries[0]
      : { type: 'GeometryCollection', geometries };

  const projection = geoEquirectangular().fitSize([VIEWBOX_SIZE, VIEWBOX_SIZE], mergedGeometry);
  const pathGenerator = geoPath(projection);
  const svgPath = pathGenerator(mergedGeometry);
  const [lng, lat] = geoCentroid(mergedGeometry);

  result[code] = {
    name,
    path: svgPath,
    centroid: { lat, lng },
  };
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');

console.log(`Wrote ${Object.keys(result).length} countries to ${path.relative(process.cwd(), OUT_PATH)}`);

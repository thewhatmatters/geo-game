// Deterministic fallback for maintaining the review manifest without an LLM
// API key. The curated trivia dataset is rewritten from a question into a
// short, answer-free statement; every generated entry remains flagged until
// a human reviewer explicitly clears it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRIVIA_PATH = path.join(__dirname, '../src/data/trivia.json');
const OUT_PATH = path.join(__dirname, '../src/data/country-facts-review.json');

const trivia = JSON.parse(fs.readFileSync(TRIVIA_PATH, 'utf-8'));

const FACT_OVERRIDES = {
  AUT: "The Christmas carol 'Silent Night' was written and first performed here, in a small village church in 1818.",
  ESH: 'This territory is Africa’s last major unresolved colonial-era territorial dispute, claimed by both a neighboring kingdom and a local independence movement.',
  GRC: 'Discovering ancient ruins during construction is common enough here that major building projects can pause for years while archaeologists excavate first.',
  MKD: 'This place adopted its current longer name in 2019 to resolve a decades-long naming dispute with its neighbor to the south.',
};

function toFact(question) {
  let fact = question
    .replace(/^In which country do people /, 'Here, people ')
    .replace(/^In which country does /, 'Here, ')
    .replace(/^In which country was /, 'This is where ')
    .replace(/^In which country is /, 'This is where ')
    .replace(/\bwhich country's\b/gi, "this place's")
    .replace(/\bwhich country\b/gi, 'this place')
    .replace(/\bwhich territory's\b/gi, "this territory's")
    .replace(/\bwhich territory\b/gi, 'this territory')
    .replace(/\bwhich island nation's\b/gi, "this island nation's")
    .replace(/\bwhich island nation\b/gi, 'this island nation')
    .replace(/\bwhich island's\b/gi, "this island's")
    .replace(/\bwhich island\b/gi, 'this island')
    .replace(/\bwhich continent\b/gi, 'this continent')
    .replace(/\bwhich economy\b/gi, 'this economy')
    .replace(/\bwhich glacier\b/gi, 'this glacier')
    .replace(/^Which is /, 'This is ')
    .replace(/^Which was /, 'This was ')
    .replace(/^Which /, 'This ')
    .replace(/\?$/, '.');

  return fact[0].toUpperCase() + fact.slice(1);
}

const manifest = Object.fromEntries(
  Object.entries(trivia).map(([code, question]) => [
    code,
    { fun_fact: FACT_OVERRIDES[code] ?? toFact(question), needsReview: true },
  ]),
);

fs.writeFileSync(OUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Object.keys(manifest).length} facts to ${path.relative(process.cwd(), OUT_PATH)}`);

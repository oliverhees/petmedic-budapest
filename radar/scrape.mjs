#!/usr/bin/env node
/**
 * Wohnungs-Radar: durchsucht alberlet.hu nach neuen haustierfreundlichen
 * Kleinwohnungen in den Ziel-Bezirken und pflegt radar/seen.json + radar/latest.json.
 *
 * Läuft in GitHub Actions (Node 20+, globales fetch). Keine Dependencies.
 * Optional: Telegram-Push, wenn TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID gesetzt sind.
 *
 * Selbsttest der Parser ohne Netz: node radar/scrape.mjs --selftest
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
const SEEN_PATH = join(DIR, "seen.json");
const LATEST_PATH = join(DIR, "latest.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.6",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Listing-Links aus einer Suchseiten-HTML ziehen. Slug trägt Bezirk, m2, Zimmer, ID. */
export function parseSearchHtml(html) {
  const re =
    /\/kiado-alberlet\/(budapest-([IVXivx]+)-kerulet-[a-z0-9-]*?(\d+)m2-[a-z0-9-]*?_(\d+))/g;
  const out = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, slug, district, m2, id] = m;
    out.set(id, {
      id,
      url: `https://www.alberlet.hu/kiado-alberlet/${slug}`,
      district: district.toUpperCase(),
      m2: parseInt(m2, 10),
      rooms: (slug.match(/-(\d+)-szoba_/) || [])[1] || null,
      street: prettyStreet(slug),
    });
  }
  return [...out.values()];
}

function prettyStreet(slug) {
  const m = slug.match(/^budapest-[IVXivx]+-kerulet-(.+?)-?\d+m2/);
  if (!m) return "";
  return m[1]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Preis (Ft/hó) aus Detailseiten-HTML (title/h1 enthalten "… 315 000 Ft/hó"). */
export function parsePriceFt(html) {
  const scopes = [];
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (t) scopes.push(t[1]);
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h) scopes.push(h[1]);
  scopes.push(html.slice(0, 20000));
  for (const s of scopes) {
    const m = s.replace(/&nbsp;| /g, " ").match(/(\d[\d\s.]{3,12})\s*Ft\s*\/\s*h[oó]/i);
    if (m) {
      const n = parseInt(m[1].replace(/[\s.]/g, ""), 10);
      if (n >= 50000 && n <= 3000000) return n;
    }
  }
  return null;
}

function loadJson(path, fallback) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`WARN: ${path} unlesbar (${e.message}) – starte leer.`);
  }
  return fallback;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return await res.text();
}

async function sendTelegram(items, isInitial) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || isInitial || items.length === 0) return;
  const lines = items
    .slice(0, 10)
    .map(
      (it) =>
        `• ${it.district}. Bezirk, ${it.m2} m²${it.priceFt ? `, ${it.priceFt.toLocaleString("de-DE")} Ft` : ""}\n${it.url}`
    );
  const text = `🐕🏠 Wohnungs-Radar: ${items.length} neue${items.length === 1 ? "s" : ""} Angebot${items.length === 1 ? "" : "e"}!\n\n${lines.join("\n\n")}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    console.log(`Telegram: ${res.status}`);
  } catch (e) {
    console.error(`Telegram-Fehler (ignoriert): ${e.message}`);
  }
}

function selftest() {
  const sampleSearch = `
    <a href="/kiado-alberlet/budapest-XIV-kerulet-gizella-ut-54m2-2-szoba_780844">x</a>
    <a href="/kiado-alberlet/budapest-IX-kerulet-vagohid-utca-36m2-1-szoba_780499">y</a>
    <a href="/kiado-alberlet/budapest-II-kerulet-margit-korut-80m2-3-szoba_770001">z</a>
    <a href="/kiado-alberlet/budapest-XIV-kerulet-gizella-ut-54m2-2-szoba_780844">dupe</a>`;
  const items = parseSearchHtml(sampleSearch);
  console.assert(items.length === 3, "dedupe/parse fehlgeschlagen");
  const g = items.find((i) => i.id === "780844");
  console.assert(g.district === "XIV" && g.m2 === 54 && g.rooms === "2", "slug-parse falsch");
  console.assert(g.street === "Gizella Ut", "street-parse falsch");
  const price = parsePriceFt(
    `<title>Kiadó albérlet 315000 Ft/hó áron: Budapest</title><h1>Budapest, XIV. kerület Gizella út, 54 m2, 315 000 Ft/hó</h1>`
  );
  console.assert(price === 315000, `preis-parse falsch: ${price}`);
  console.assert(parsePriceFt("<title>kein preis</title>") === null, "null-preis falsch");
  console.log("Selftest OK");
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const seen = loadJson(SEEN_PATH, {});
  const latest = loadJson(LATEST_PATH, { generatedAt: null, items: [] });
  const isInitial = Object.keys(seen).length === 0;
  const now = new Date().toISOString();

  // 1) Suchseiten einsammeln
  const found = new Map();
  for (const url of CONFIG.searchUrls) {
    try {
      const html = await fetchText(url);
      for (const it of parseSearchHtml(html)) found.set(it.id, it);
      console.log(`Suchseite OK (${found.size} kumuliert): ${url}`);
    } catch (e) {
      console.error(`WARN Suchseite fehlgeschlagen: ${e.message}`);
    }
    await sleep(1500);
  }
  if (found.size === 0) {
    console.error("FEHLER: 0 Listings gefunden – Seite blockt oder Struktur geändert. Kein Schreiben.");
    process.exit(2);
  }

  // 2) Kriterien anwenden (Bezirk + Fläche aus dem Slug)
  const matching = [...found.values()].filter(
    (it) =>
      CONFIG.districts.includes(it.district) &&
      it.m2 >= CONFIG.minM2 &&
      it.m2 <= CONFIG.maxM2
  );
  console.log(`Treffer nach Bezirk+Fläche: ${matching.length} von ${found.size}`);

  // 3) Neue IDs bestimmen
  const fresh = matching.filter((it) => !seen[it.id]);
  console.log(`Davon neu: ${fresh.length}${isInitial ? " (Erstlauf – aktueller Bestand)" : ""}`);

  // 4) Detailseiten für Preis (gedrosselt)
  const withPrice = [];
  for (const it of fresh.slice(0, CONFIG.maxDetailFetchesPerRun)) {
    try {
      const html = await fetchText(it.url);
      it.priceFt = parsePriceFt(html);
    } catch (e) {
      console.error(`WARN Detail ${it.id}: ${e.message}`);
      it.priceFt = null;
    }
    it.firstSeen = now;
    it.initial = isInitial;
    withPrice.push(it);
    await sleep(1500);
  }

  // 5) Preisfilter (unbekannter Preis bleibt drin, wird markiert)
  const accepted = withPrice.filter((it) => it.priceFt === null || it.priceFt <= CONFIG.maxFt);
  console.log(`Nach Preisfilter (≤ ${CONFIG.maxFt} Ft): ${accepted.length}`);

  // 6) State aktualisieren: alles Gefundene als gesehen markieren
  for (const it of matching) {
    if (!seen[it.id]) seen[it.id] = { firstSeen: now, m2: it.m2, district: it.district };
  }

  // 7) latest.json: Neue vorn, alte behalten solange < keepDays und noch online (in found)
  const cutoff = Date.now() - CONFIG.keepDays * 864e5;
  const kept = (latest.items || []).filter(
    (it) => new Date(it.firstSeen).getTime() > cutoff && found.has(it.id) && !accepted.some((n) => n.id === it.id)
  );
  const items = [...accepted, ...kept].slice(0, CONFIG.maxItemsOnPage);
  const out = {
    generatedAt: now,
    criteria: {
      districts: CONFIG.districts,
      maxFt: CONFIG.maxFt,
      minM2: CONFIG.minM2,
      maxM2: CONFIG.maxM2,
    },
    newCount: isInitial ? 0 : accepted.length,
    totalMatching: matching.length,
    items,
  };
  writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 1));
  writeFileSync(LATEST_PATH, JSON.stringify(out, null, 1));
  console.log(`Geschrieben: ${items.length} Einträge in latest.json`);

  // 8) Telegram (nur echte Neuzugänge, nie beim Erstlauf)
  await sendTelegram(accepted, isInitial);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

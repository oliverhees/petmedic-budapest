#!/usr/bin/env node
/**
 * Injiziert radar/latest.json als HTML in index.html zwischen
 * <!--RADAR:START--> und <!--RADAR:END-->. Läuft im Deploy-Build vor StatiCrypt.
 * Ohne latest.json bleibt der statische Platzhalter stehen.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const INDEX = join(DIR, "..", "index.html");
const LATEST = join(DIR, "latest.json");

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

if (!existsSync(LATEST)) {
  console.log("render: kein latest.json – Platzhalter bleibt.");
  process.exit(0);
}

const data = JSON.parse(readFileSync(LATEST, "utf8"));
const html = readFileSync(INDEX, "utf8");

const when = new Date(data.generatedAt);
const whenStr = when.toLocaleString("de-DE", {
  timeZone: "Europe/Budapest",
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const rows = (data.items || [])
  .map((it) => {
    const price = it.priceFt
      ? `${Number(it.priceFt).toLocaleString("de-DE")} Ft <span style="color:var(--muted)">(≈ ${Math.round(it.priceFt / 364)} €)</span>`
      : `<span class="pill warn">Preis erfragen</span>`;
    const badge = it.initial
      ? ""
      : ` <span class="pill ok">NEU ${new Date(it.firstSeen).toLocaleDateString("de-DE", { timeZone: "Europe/Budapest", day: "2-digit", month: "2-digit" })}</span>`;
    return `<tr>
      <td><a href="${esc(it.url)}" target="_blank" rel="noopener"><b>${esc(it.district)}.</b> ${esc(it.street || "Wohnung")}</a>${badge}</td>
      <td class="num">${it.m2} m²${it.rooms ? ` · ${esc(it.rooms)} Zi.` : ""}</td>
      <td class="num">${price}</td>
    </tr>`;
  })
  .join("\n");

const block = `
      <p class="sub">Zuletzt aktualisiert: <b>${whenStr}</b> (Budapest-Zeit) · ${data.items?.length || 0} passende Angebote${data.newCount ? ` · <b>${data.newCount} neu seit letztem Lauf</b>` : ""} · Kriterien: Bezirke ${data.criteria.districts.join(", ")} · ≤ ${Number(data.criteria.maxFt).toLocaleString("de-DE")} Ft · ${data.criteria.minM2}–${data.criteria.maxM2} m² · haustierfreundlich</p>
      ${rows
        ? `<div class="tbl-scroll"><table>
        <thead><tr><th>Angebot</th><th>Größe</th><th>Miete/Monat</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
        : `<div class="note">Aktuell keine passenden Angebote im Raster – der Radar läuft weiter und meldet Neues automatisch.</div>`}
`;

const START = "<!--RADAR:START-->";
const END = "<!--RADAR:END-->";
const i = html.indexOf(START);
const j = html.indexOf(END);
if (i === -1 || j === -1 || j < i) {
  console.error("render: RADAR-Marker nicht gefunden!");
  process.exit(1);
}
writeFileSync(INDEX, html.slice(0, i + START.length) + block + html.slice(j));
console.log(`render: ${data.items?.length || 0} Einträge injiziert (Stand ${whenStr}).`);

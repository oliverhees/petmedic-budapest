# 🐕🐕 Budapest-Plan

Eine mobile-first Info-Seite für den Umzug nach Budapest ans McDaniel College (Pre-Medical) –
mit Wohnungs-Guide, interaktivem Budget-Rechner, Finanzierungs-Optionen, Hunde-Einreise,
Behörden-Timeline und einer Master-Checkliste, deren Häkchen im Browser gespeichert werden.

Die ganze Seite ist eine **einzelne, self-contained `index.html`** (kein Build, kein Backend).
Häkchen und Budget-Regler werden per `localStorage` auf dem Gerät der Nutzerin gespeichert.

---

## 🔒 Wichtig: Passwortschutz

GitHub Pages kann **kein Passwort** – auch bei privatem Repo ist eine veröffentlichte Seite
öffentlich erreichbar. Ein reines JavaScript-Passwort im HTML wäre nur Deko. Deshalb gibt es
zwei saubere Wege:

### Option A – Cloudflare Pages + Access (Favorit, kostenlos)

Echtes Login per E-Mail-Code, kein Verschlüsseln nötig.

1. Dieses Repo zu GitHub pushen.
2. Auf [pages.cloudflare.com](https://pages.cloudflare.com) das Repo verbinden → deployt
   automatisch bei jedem Push (Build command leer lassen, Output-Verzeichnis `/`).
3. Im Cloudflare-Dashboard unter **Zero Trust → Access → Applications** eine Policy auf die
   Pages-Domain legen: **nur die E-Mail-Adresse der Nutzerin erlauben**. Sie bekommt beim
   Öffnen einen Einmal-Code per Mail – echtes Login, kostenlos bis 50 Nutzer.

### Option B – GitHub Pages + StatiCrypt (wenn's GitHub sein soll)

Die HTML-Datei wird beim Deploy mit einem Passwort **AES-verschlüsselt**. Ohne Passwort sieht
man nur Zeichensalat – im Gegensatz zu einem JS-Prompt tatsächlich sicher. Der mitgelieferte
GitHub-Action-Workflow erledigt das automatisch.

1. Repo → **Settings → Secrets and variables → Actions** → neues Secret
   `STATICRYPT_PASSWORD` mit dem Wunsch-Passwort anlegen.
2. Repo → **Settings → Pages** → Source auf **GitHub Actions** stellen.
3. Unter **Actions** den Workflow „Deploy (StatiCrypt → GitHub Pages)" einmal starten
   (oder einfach etwas pushen).
4. Seite läuft unter `https://<dein-user>.github.io/<repo-name>/` – geschützt durch das Passwort.

> **Nicht empfohlen:** Netlify/Vercel-Passwortschutz (nur in Bezahl-Tarifen) oder ein
> selbstgebautes JS-Passwort (bietet keine echte Sicherheit).

---

## 🖥️ Lokal ansehen

Einfach `index.html` im Browser öffnen (Doppelklick genügt). Für localStorage in manchen
Browsern besser über einen kleinen lokalen Server:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

---

## ✏️ Inhalte ändern

Alles steckt in `index.html` (Inhalt, CSS, JS in einer Datei). Text anpassen → committen →
pushen. Bei Option A/B deployt sich die Seite automatisch neu.

Neue Checklisten-Punkte: einfach ein `<li>` mit einer **eindeutigen** Checkbox-`id`
(`id="c16"` usw.) im Abschnitt „Master-Checkliste" ergänzen – die Speicher-Logik greift
automatisch über die `id`.

---

## 🔥 Wohnungs-Radar (automatische Suche)

Der Workflow `.github/workflows/radar.yml` durchsucht **2× täglich** (ca. 6:30 & 16:30 Uhr
Budapest-Zeit) alberlet.hu nach neuen Angeboten gemäß `radar/config.json`
(Bezirke VIII/IX/XIII/XIV/XIX, 25–60 m², bis 220.000 Ft, haustierfreundlich),
committet den Stand (`radar/seen.json`, `radar/latest.json`) und stößt automatisch
einen neuen Pages-Deploy an — die Treffer erscheinen in der Sektion „🔥 Wohnungs-Radar"
auf der Seite.

- **Kriterien ändern:** `radar/config.json` editieren und pushen. Die Such-URL folgt dem
  Muster `kerulet:viii+ix+…` / `haziallat-engedelyezve:igen` — Bezirke dort mitpflegen.
- **Manuell laufen lassen:** Actions → „Wohnungs-Radar (alberlet.hu)" → Run workflow.
- **ingatlan.com** blockt automatisierte Zugriffe → dort den nativen E-Mail-Alert
  („hirdetésfigyelő") direkt auf der Plattform einrichten.

### Optional: Telegram-Push bei neuen Treffern

1. In Telegram [@BotFather](https://t.me/BotFather) öffnen → `/newbot` → Namen vergeben →
   **Bot-Token** kopieren.
2. Dem neuen Bot eine Nachricht schicken (einmal „Start" drücken).
3. `https://api.telegram.org/bot<TOKEN>/getUpdates` im Browser öffnen →
   die **chat.id** aus der Antwort kopieren.
4. Repo → Settings → Secrets and variables → Actions → zwei Secrets anlegen:
   `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID`.

Ab dann meldet der Radar echte Neuzugänge zusätzlich per Telegram (beim allerersten
Lauf/Bestandsaufbau wird bewusst nicht gepusht).

## 📁 Struktur

```
.
├── index.html                    # die komplette Seite (localStorage für Häkchen + Budget)
├── README.md                     # diese Anleitung
├── .staticrypt.json              # Verschlüsselungs-Salt (KEIN Passwort!) – hält "Remember me" über Deploys stabil
└── .github/workflows/deploy.yml  # Auto-Deploy: verschlüsselt via StatiCrypt → GitHub Pages
```

Das Passwort steht **nur** im GitHub-Secret `STATICRYPT_PASSWORD`, niemals im Repo.

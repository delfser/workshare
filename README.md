# WorkShare Web

Separates Webprojekt fuer die Desktop-Verwaltung von WorkShare.

Wichtig:
- Dieses Projekt ist bewusst getrennt von der mobilen App.
- Die bestehende Android-App wird dadurch nicht umgebaut.
- Das Web liest dieselben Firebase-Daten, nutzt aber eine eigene Web-App-Konfiguration.

## Aktueller Stand

Phase 1 ist absichtlich risikoarm:
- Login mit E-Mail und Passwort
- Live-Projektliste fuer den eingeloggten Benutzer
- Anzeige von Rolle, Projektcode, Archivstatus und Zeitstempeln
- Read-only Desktop-Oberflaeche als sichere Basis

Noch nicht in Phase 1:
- Projektbearbeitung im Web
- Materialbearbeitung im Web
- Einladungen im Web
- Workgroup-Verwaltung im Web

## Voraussetzungen

In Firebase muss zusaetzlich eine Web-App fuer dasselbe Projekt angelegt werden.

Danach eine `.env.local` im Projektordner anlegen auf Basis von `.env.local.example`.

## Start

```bash
npm install
npm run dev
```

Dann im Browser:

```text
http://localhost:3000
```

## Firebase Web Setup

In Firebase Console:

1. Projekt `workshare-41953` oeffnen
2. App hinzufuegen
3. Web-App registrieren
4. Firebase Config kopieren
5. Werte in `.env.local` eintragen
6. In Authentication sicherstellen, dass E-Mail/Passwort aktiv ist

## Struktur

- `src/app` App Router Einstieg
- `src/components` UI und Login/Dashboard
- `src/lib/firebase-*` Firebase Initialisierung
- `src/lib/project-stream.ts` Live-Projektstream ueber `project_members` und `projects`

## Naechster Ausbau

Sinnvolle naechste Schritte:

1. Projektdetailseite im Web
2. Materialtabelle mit Live-Sync
3. Katalogverwaltung
4. Rollenverwaltung fuer Mitglieder
5. Fotoansicht und Download

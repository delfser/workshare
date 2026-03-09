# WorkShare

WorkShare ist eine Flutter-Android-App fuer Handwerker zur projektbezogenen Materialverwaltung mit Firebase-Live-Synchronisation.

## Features V1
- E-Mail/Passwort Login und Registrierung
- Projektverwaltung (anlegen, bearbeiten, loeschen)
- Projektrollen: `owner`, `admin`, `worker`, `viewer`
- Mitglieder per E-Mail einladen
- Materialverwaltung pro Projekt (CRUD) mit Live-Sync
- Katalogverwaltung (CRUD) mit Prefix-Autocomplete (case-insensitive)
- Einheit wird bei Katalogauswahl automatisch uebernommen
- PDF-Export der Materialliste
- Einstellungen mit Benutzerinfo, Light/Dark/Systemmodus und Logout
- Firestore Offline-Cache (queued writes + Sync nach Netzrueckkehr)

## Architektur
Siehe: `ARCHITECTURE.md`

## Projektstruktur
- `lib/models`
- `lib/services`
- `lib/providers`
- `lib/screens`
- `lib/widgets`
- `lib/core`
- `lib/utils`
- `assets/seeds`

## Voraussetzungen
- Flutter SDK (stable)
- Firebase CLI
- FlutterFire CLI
- Android Studio + Android SDK

## Setup Schritt fuer Schritt
1. Projektverzeichnis betreten:
   - `cd workshare`
2. Flutter-Projektdateien initialisieren (falls auf neuem Rechner noch nicht vorhanden):
   - `flutter create . --org com.workshare --project-name workshare`
3. Dependencies installieren:
   - `flutter pub get`
4. Firebase Projekt erstellen (Console) und Android App registrieren mit Paket-ID:
   - `com.workshare.workshare`
5. `google-services.json` nach `android/app/google-services.json` legen.
6. FlutterFire konfigurieren:
   - `flutterfire configure --platforms=android`
7. Firestore Rules deployen:
   - `firebase deploy --only firestore:rules`
8. App starten:
   - `flutter run`

## Firestore Collections
- `users`
- `projects`
- `project_members`
- `materials`
- `catalog_entries`
- `invitations`

## Pflichtfelder
### materials
- `id`, `projectId`, `name`, `quantity`, `unit`, `catalogEntryId?`, `note?`, `createdBy`, `createdAt`, `updatedAt`

### catalog_entries
- `id`, `name`, `nameLower`, `unit`, `category?`, `createdBy`, `isActive`, `createdAt`, `updatedAt`

### invitations
- `id`, `projectId`, `projectName`, `email`, `role`, `invitedBy`, `status`, `createdAt`, `acceptedAt?`

### project_members
- `id`, `projectId`, `userId`, `email`, `role`, `invitedBy?`, `joinedAt`

## Wichtige Firestore Indexes
In Firebase Console unter Firestore > Indexes anlegen:
1. Collection `materials`
   - `projectId` ASC
   - `updatedAt` DESC
2. Collection `catalog_entries`
   - `isActive` ASC
   - `nameLower` ASC

## Security Rules
- Datei: `firestore.rules`
- Zugriff nur fuer authentifizierte Nutzer
- Projektdaten nur fuer Projektmitglieder
- Mitgliederverwaltung nur `owner/admin`
- Material schreiben nur `owner/admin/worker`
- `viewer` nur lesen

## Seed fuer Katalogeintraege
Beispieldaten:
- `assets/seeds/catalog_entries.json`

Optionales Seed-Skript (Node + Admin SDK):
1. Admin SDK installieren:
   - `npm i firebase-admin`
2. Credentials setzen (`GOOGLE_APPLICATION_CREDENTIALS`)
3. Seed ausfuehren:
   - `node firebase/seed_catalog.js`

## Branding
- App-Name in der UI: **WorkShare**

## Hinweise
- Version 1 enthaelt absichtlich keine Arbeitszeiten-Exports und keine komplexe Kalkulation.
- Katalogvorschlaege im Materialformular nutzen Prefix-Matching (`k` -> `k...`, `ka` -> `ka...`) und sind case-insensitive.


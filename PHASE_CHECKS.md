# Phase Checks

## Phase 1: Projektstruktur und Firebase-Anbindung
- Struktur `models/services/screens/widgets/providers` vorhanden.
- `pubspec.yaml` inkl. Firebase-Pakete vorhanden.
- `main.dart` initialisiert Firebase.
- Check: konsistent.

## Phase 2: Auth
- Login/Registrierung via Firebase Auth implementiert.
- User-Profil wird in `users` geschrieben.
- Logout in Einstellungen integriert.
- Check: konsistent.

## Phase 3: Projekte und Mitglieder
- Projekt-CRUD vorhanden.
- `project_members` mit Rollenmodell vorhanden.
- Einladungen per E-Mail implementiert.
- Check: konsistent.

## Phase 4: Materialverwaltung
- Material-CRUD pro Projekt vorhanden.
- Live-Sync via Firestore Streams vorhanden.
- Rollenpruefung in UI fuer Schreibrechte vorhanden.
- Check: konsistent.

## Phase 5: Katalog mit Prefix-Autocomplete
- Katalog-CRUD vorhanden.
- Prefix-Matching case-insensitive via `nameLower` + `startAt/endAt` vorhanden.
- Einheit wird bei Auswahl uebernommen.
- Check: konsistent.

## Phase 6: Einstellungen und Dark Mode
- Benutzerinfo, Light/Dark/Systemmodus und Logout vorhanden.
- ThemeMode persistent via SharedPreferences.
- Check: konsistent.

## Phase 7: PDF-Export nur Material
- PDF-Export fuer Materialliste implementiert.
- Export aus Projekt-Detail per Aktion erreichbar.
- Check: konsistent.

## Phase 8: Security Rules und Abschluss
- `firestore.rules` mit Rollen-/Membership-Logik vorhanden.
- Seed-Daten + Seed-Skript vorhanden.
- README mit exakten Setup-Schritten vorhanden.
- Check: konsistent (lokaler Build/Analyze nicht moeglich, Flutter SDK in Umgebung fehlt).

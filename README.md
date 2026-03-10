# WorkShare

WorkShare ist eine Android-App fuer Teams auf der Baustelle.

Mit WorkShare koennt ihr Projekte gemeinsam verwalten, Material live synchronisieren, Fotos hochladen und Teammitglieder kontrolliert einladen.

## Fuer Endbenutzer

### 1. App installieren
1. APK von eurem internen Link herunterladen.
2. Auf Android installieren (bei Bedarf "Unbekannte Apps installieren" erlauben).
3. App starten und Konto erstellen oder einloggen.

### 2. Erste Schritte in der App
1. Projekt mit `+` erstellen.
2. Material im Projekt erfassen.
3. Optional: Katalogeintraege anlegen, damit Materialvorschlaege schneller sind.
4. Team per Einladung hinzufuegen.

### 3. Einladungen (neu)
- Einladungen erscheinen als Benachrichtigung (Glocke oben rechts in der Projektuebersicht).
- Du kannst jede Einladung **annehmen** oder **ablehnen**.
- Projekt- und Workgroup-Einladungen werden **nicht** mehr automatisch uebernommen.

### 4. Update-Hinweise
- In der App wird ein Update als Benachrichtigung gezeigt.
- Der Hinweis wird pro Version nur **einmal** angezeigt.
- Manuelle Update-Pruefung bleibt in `Einstellungen -> Auf Update pruefen`.

### 5. Offline-Verhalten
- Du kannst auch ohne Internet arbeiten.
- Daten werden lokal zwischengespeichert und bei Internet automatisch synchronisiert.

## Funktionen (Version 1.x)
- Login/Registrierung mit E-Mail + Passwort
- Projekte anlegen/bearbeiten/loeschen
- Rollen pro Projekt: `owner`, `admin`, `worker`, `viewer`
- Projektbeitritt per Projektcode
- Projekt-Einladung per E-Mail mit Annahme/Ablehnung
- Workgroups (Gruppen) inkl. Einladung per Code oder E-Mail
- Materialverwaltung mit Live-Sync
- Katalog mit Prefix-Autocomplete (case-insensitive)
- PDF-Export fuer Materialliste
- Foto-Tab im Projekt mit Cloud-Sync
- Dark Mode / Light Mode / Systemmodus

## Wichtige Hinweise fuer Teamleiter
- Nur Mitglieder sehen Projektdaten.
- Rechte werden ueber Firestore Security Rules erzwungen.
- Bei Workgroup-Austritt koennen Projekte getrennt werden, damit jede Person unabhaengig weiterarbeiten kann.

## Cloud-Setup (einmalig, Administrator)
1. Firebase Projekt erstellen.
2. Android App mit Paket-ID `com.workshare.workshare` registrieren.
3. `google-services.json` nach `android/app/google-services.json` kopieren.
4. Authentication aktivieren: E-Mail/Passwort.
5. Firestore Database erstellen.
6. Firebase Storage erstellen.
7. Regeln deployen:
   - `firebase deploy --only firestore:rules`
   - `firebase deploy --only storage`

## Entwickler-Setup (lokal)
1. `flutter pub get`
2. `flutterfire configure --platforms=android`
3. `flutter run`

## OTA (manuelle Updates)
- OTA-Quelle kommt aus `version.json` (Server-URL in `lib/core/app_config.dart`).
- App prueft optional auf neue Version und verlinkt auf die APK.

## Projektstruktur
- `lib/models`
- `lib/services`
- `lib/providers`
- `lib/screens`
- `lib/widgets`
- `assets/seeds`

## Sicherheit
- Firestore Rules: `firestore.rules`
- Storage Rules: `storage.rules`

## Branding
- App-Name in der UI: **WorkShare**
- Entwickler: Daniel Delfser

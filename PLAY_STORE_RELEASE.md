# WorkShare fuer Play Store vorbereiten (Schritt fuer Schritt)

Diese Anleitung ist fuer den aktuellen Projektstand und fuehrt dich von `0` bis zur fertigen Upload-Datei (`.aab`).

## 1) Einmalig: Google Play Console
1. In die Play Console einloggen.
2. App anlegen (Name: `WorkShare`).
3. Paketname muss exakt passen: `com.workshare.workshare`.

## 2) Upload-Key erstellen (lokal)
Im Projektordner `android` in PowerShell:

```powershell
keytool -genkey -v -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Wichtig:
- Passwort merken.
- Datei liegt danach unter `android/upload-keystore.jks`.

## 3) key.properties anlegen
1. Datei `android/key.properties.example` kopieren nach `android/key.properties`.
2. Werte eintragen:

```properties
storePassword=DEIN_STORE_PASSWORT
keyPassword=DEIN_KEY_PASSWORT
keyAlias=upload
storeFile=upload-keystore.jks
```

## 4) Version setzen
In `pubspec.yaml`:
- `version: 1.0.x+BUILDNUMMER`
- Beispiel: `version: 1.0.5+6`

Regel:
- `versionName` (vor dem `+`) ist fuer Nutzer sichtbar.
- `buildNumber` (nach dem `+`) muss bei jedem Upload steigen.

## 5) App Bundle bauen (Play Store Format)
Im Projekt-Root:

```powershell
flutter clean
flutter pub get
flutter build appbundle --release
```

Ergebnis:
- `build/app/outputs/bundle/release/app-release.aab`

## 6) Upload in Play Console
1. Play Console -> deine App -> `Produktion` (oder zuerst `Interner Test`).
2. `Neue Version erstellen`.
3. `app-release.aab` hochladen.
4. Release-Notizen eintragen.
5. Speichern und zur Pruefung einreichen.

## 7) Pflichtangaben in der Play Console (einmalig)
- App-Inhalte / Altersfreigabe
- Datensicherheit
- Datenschutzrichtlinie (oeffentliche URL)
- App-Zugriff (falls notwendig)

## 8) Wichtiger Hinweis zu OTA
Falls du App-Updates ueber deinen eigenen Link nutzt:
- Fuer Play-Store-Versionen sollte der In-App-Update-Hinweis auf Play-Store-Update umgestellt oder deaktiviert werden.
- Sonst kann es fuer Store-Nutzer verwirrend sein.

## 9) Typische Fehler
- `versionCode already used` -> Buildnummer hinter `+` erhoehen.
- Signing-Fehler -> `android/key.properties` oder Keystore-Pfad pruefen.
- Falscher Paketname -> muss `com.workshare.workshare` sein.

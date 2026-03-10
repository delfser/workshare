class AppConfig {
  const AppConfig._();

  // OTA aktiviert, aber nur manuell ueber Einstellungen.
  static const otaEnabled = true;

  // Interne OTA-Quelle (version.json).
  // Kann optional per --dart-define=OTA_VERSION_URL ueberschrieben werden.
  static const otaVersionUrl = String.fromEnvironment(
    'OTA_VERSION_URL',
    defaultValue: 'https://ff-friesach.at/workshare/version.json',
  );
}

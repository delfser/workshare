class AppConfig {
  const AppConfig._();

  // OTA vorerst deaktiviert.
  static const otaEnabled = false;

  // Interne OTA-Quelle (version.json).
  // Kann optional per --dart-define=OTA_VERSION_URL überschrieben werden.
  static const otaVersionUrl = String.fromEnvironment(
    'OTA_VERSION_URL',
    defaultValue: 'https://ff-friesach.at/workshare/version.json',
  );
}
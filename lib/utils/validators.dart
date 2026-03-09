class Validators {
  static String? requiredText(String? value, {String label = 'Feld'}) {
    if (value == null || value.trim().isEmpty) {
      return '$label ist erforderlich';
    }
    return null;
  }

  static String? email(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'E-Mail ist erforderlich';
    }
    final regex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!regex.hasMatch(value.trim())) {
      return 'Ungueltige E-Mail';
    }
    return null;
  }

  static String? positiveNumber(String? value, {String label = 'Menge'}) {
    if (value == null || value.trim().isEmpty) {
      return '$label ist erforderlich';
    }
    final parsed = double.tryParse(value.replaceAll(',', '.'));
    if (parsed == null || parsed <= 0) {
      return '$label muss groesser als 0 sein';
    }
    return null;
  }
}

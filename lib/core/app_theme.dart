import 'package:flutter/material.dart';

class AppTheme {
  static const _seed = Color(0xFF4F6385);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _seed,
      brightness: Brightness.light,
      primary: const Color(0xFF4F6385),
      secondary: const Color(0xFF6E7F9D),
      surface: const Color(0xFFF4F6FA),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: const Color(0xFFF0F3F7),
      cardColor: Colors.white,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: const Color(0xFFF0F3F7),
        foregroundColor: scheme.onSurface,
        elevation: 0,
        toolbarHeight: 76,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: UnderlineInputBorder(),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFE9EDF5),
        selectedColor: const Color(0xFFD8E2F4),
        side: const BorderSide(color: Color(0xFFB8C2D6)),
        labelStyle: const TextStyle(fontSize: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: Color(0xFFF7F9FC),
        elevation: 0,
        indicatorColor: Color(0xFFDDE6F6),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: const StadiumBorder(),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
    );
  }

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _seed,
      brightness: Brightness.dark,
      primary: const Color(0xFF9EB0CF),
      secondary: const Color(0xFFB6C3D8),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: const Color(0xFF101521),
        foregroundColor: scheme.onSurface,
        toolbarHeight: 76,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      inputDecorationTheme: const InputDecorationTheme(border: UnderlineInputBorder()),
      navigationBarTheme: const NavigationBarThemeData(
        elevation: 0,
        indicatorColor: Color(0xFF2B3953),
      ),
    );
  }
}

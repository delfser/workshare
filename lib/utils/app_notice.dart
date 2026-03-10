import 'package:flutter/material.dart';

import '../core/app_globals.dart';

enum AppNoticeType { success, error, info }

void showAppNotice(
  BuildContext context,
  String message, {
  AppNoticeType type = AppNoticeType.info,
}) {
  final themeContext = AppGlobals.scaffoldMessengerKey.currentContext ??
      (context.mounted ? context : null);
  if (themeContext == null) return;

  final colors = Theme.of(themeContext).colorScheme;
  late final Color background;

  switch (type) {
    case AppNoticeType.success:
      background = Colors.green.shade700;
      break;
    case AppNoticeType.error:
      background = colors.error;
      break;
    case AppNoticeType.info:
      background = colors.primaryContainer;
      break;
  }

  final textColor =
      type == AppNoticeType.info ? colors.onPrimaryContainer : Colors.white;

  final messenger = AppGlobals.scaffoldMessengerKey.currentState;
  if (messenger != null) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message, style: TextStyle(color: textColor)),
          backgroundColor: background,
          behavior: SnackBarBehavior.floating,
        ),
      );
    return;
  }

  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: TextStyle(color: textColor)),
        backgroundColor: background,
        behavior: SnackBarBehavior.floating,
      ),
    );
}

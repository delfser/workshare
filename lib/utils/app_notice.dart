import 'package:flutter/material.dart';

enum AppNoticeType { success, error, info }

void showAppNotice(
  BuildContext context,
  String message, {
  AppNoticeType type = AppNoticeType.info,
}) {
  if (!context.mounted) return;

  final colors = Theme.of(context).colorScheme;
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

  final textColor = type == AppNoticeType.info ? colors.onPrimaryContainer : Colors.white;

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

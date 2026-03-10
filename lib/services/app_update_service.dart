import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import '../core/app_config.dart';
import '../models/app_update_info.dart';

class AppUpdateService {
  Future<AppUpdateInfo?> checkForUpdate() async {
    final url = AppConfig.otaVersionUrl.trim();
    if (url.isEmpty) return null;

    final response = await http.get(Uri.parse(url), headers: const {
      'Cache-Control': 'no-cache'
    }).timeout(const Duration(seconds: 12));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          'Update-Server nicht erreichbar (${response.statusCode}).');
    }

    final jsonBody = jsonDecode(response.body);
    if (jsonBody is! Map<String, dynamic>) {
      throw Exception('Ungültige version.json.');
    }

    final info = AppUpdateInfo.fromJson(jsonBody);
    if (info.apkUrl.isEmpty || info.buildNumber <= 0) {
      throw Exception('version.json ist unvollständig.');
    }

    final package = await PackageInfo.fromPlatform();
    final localBuild = int.tryParse(package.buildNumber) ?? 0;

    if (info.buildNumber > localBuild) {
      return info;
    }
    return null;
  }
}

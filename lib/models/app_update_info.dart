class AppUpdateInfo {
  const AppUpdateInfo({
    required this.version,
    required this.buildNumber,
    required this.apkUrl,
    required this.mandatory,
    required this.notes,
  });

  final String version;
  final int buildNumber;
  final String apkUrl;
  final bool mandatory;
  final String notes;

  factory AppUpdateInfo.fromJson(Map<String, dynamic> json) {
    return AppUpdateInfo(
      version: (json['version'] as String? ?? '').trim(),
      buildNumber: (json['buildNumber'] as num?)?.toInt() ?? 0,
      apkUrl: (json['apkUrl'] as String? ?? '').trim(),
      mandatory: json['mandatory'] as bool? ?? false,
      notes: (json['notes'] as String? ?? '').trim(),
    );
  }
}

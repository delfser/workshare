enum ProjectPhotoUploadStatus { queued, uploading, uploaded, failed }

class ProjectPhoto {
  const ProjectPhoto({
    required this.id,
    required this.projectId,
    required this.storagePath,
    required this.downloadUrl,
    required this.localPath,
    required this.uploadStatus,
    required this.uploadProgress,
    this.errorMessage,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String projectId;
  final String storagePath;
  final String downloadUrl;
  final String localPath;
  final ProjectPhotoUploadStatus uploadStatus;
  final double uploadProgress;
  final String? errorMessage;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isUploaded => uploadStatus == ProjectPhotoUploadStatus.uploaded && downloadUrl.isNotEmpty;

  factory ProjectPhoto.fromMap(String id, Map<String, dynamic> map) {
    final rawStatus = (map['uploadStatus'] as String? ?? '').trim().toLowerCase();
    final status = ProjectPhotoUploadStatus.values.firstWhere(
      (s) => s.name == rawStatus,
      orElse: () => ((map['downloadUrl'] as String? ?? '').isNotEmpty
          ? ProjectPhotoUploadStatus.uploaded
          : ProjectPhotoUploadStatus.queued),
    );
    return ProjectPhoto(
      id: id,
      projectId: map['projectId'] as String? ?? '',
      storagePath: map['storagePath'] as String? ?? '',
      downloadUrl: map['downloadUrl'] as String? ?? '',
      localPath: map['localPath'] as String? ?? '',
      uploadStatus: status,
      uploadProgress: (map['uploadProgress'] as num?)?.toDouble() ?? (status == ProjectPhotoUploadStatus.uploaded ? 1 : 0),
      errorMessage: map['errorMessage'] as String?,
      createdBy: map['createdBy'] as String? ?? '',
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }
}

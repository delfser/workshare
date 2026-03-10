import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';

import '../models/project_photo.dart';
import 'firebase_service.dart';

class ProjectPhotoService {
  static final Set<String> _activeUploads = <String>{};

  Stream<List<ProjectPhoto>> streamPhotos(String projectId) {
    return FirebaseService.projectPhotos
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) {
      final photos = snapshot.docs
          .map((doc) => ProjectPhoto.fromMap(doc.id, doc.data()))
          .toList();
      photos.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return photos;
    });
  }

  Future<int> uploadPhotos({
    required String projectId,
    required String createdBy,
    required List<XFile> files,
  }) async {
    if (files.isEmpty) return 0;

    var queued = 0;
    for (var i = 0; i < files.length; i++) {
      final file = files[i];
      final doc = FirebaseService.projectPhotos.doc();
      final localFile = await _prepareLocalFile(file, i);
      final now = FirebaseService.now();

      await doc.set({
        'id': doc.id,
        'projectId': projectId,
        'storagePath': '',
        'downloadUrl': '',
        'localPath': localFile.path,
        'uploadStatus': ProjectPhotoUploadStatus.queued.name,
        'uploadProgress': 0,
        'errorMessage': null,
        'createdBy': createdBy,
        'createdAt': now,
        'updatedAt': now,
      });

      queued++;
      unawaited(_uploadQueuedPhoto(doc.id));
    }

    return queued;
  }

  Future<void> retryPendingUploads({
    required String projectId,
    required String createdBy,
  }) async {
    try {
      final snapshot = await FirebaseService.projectPhotos
          .where('projectId', isEqualTo: projectId)
          .where('createdBy', isEqualTo: createdBy)
          .get()
          .timeout(const Duration(seconds: 15));

      for (final doc in snapshot.docs) {
        final photo = ProjectPhoto.fromMap(doc.id, doc.data());
        if (photo.uploadStatus == ProjectPhotoUploadStatus.uploaded) continue;
        if (photo.localPath.isEmpty) continue;
        if (!File(photo.localPath).existsSync()) continue;
        unawaited(_uploadQueuedPhoto(photo.id));
      }
    } catch (_) {
      // Keep silent while offline; timer will retry later.
    }
  }

  Future<void> retryPhoto(String photoId) {
    return _uploadQueuedPhoto(photoId);
  }

  Future<void> _uploadQueuedPhoto(String photoId) async {
    if (_activeUploads.contains(photoId)) return;
    _activeUploads.add(photoId);
    try {
      final docRef = FirebaseService.projectPhotos.doc(photoId);
      final doc = await docRef.get().timeout(const Duration(seconds: 15));
      if (!doc.exists || doc.data() == null) return;

      final photo = ProjectPhoto.fromMap(doc.id, doc.data()!);
      if (photo.uploadStatus == ProjectPhotoUploadStatus.uploaded) return;
      if (photo.localPath.isEmpty) return;

      final file = File(photo.localPath);
      if (!file.existsSync()) {
        await _markFailed(docRef, 'Lokale Datei nicht gefunden.');
        return;
      }

      final extension = _safeExtension(file.path);
      final storagePath =
          'project_photos/${photo.projectId}/${photo.id}.$extension';
      final ref = FirebaseService.storage.ref().child(storagePath);

      await docRef.update({
        'uploadStatus': ProjectPhotoUploadStatus.uploading.name,
        'uploadProgress': 0.02,
        'errorMessage': null,
        'updatedAt': FirebaseService.now(),
      }).timeout(const Duration(seconds: 15));

      try {
        final task = ref.putFile(file);
        await for (final event in task.snapshotEvents) {
          final total = event.totalBytes <= 0 ? 1 : event.totalBytes;
          final progress =
              (event.bytesTransferred / total).clamp(0, 1).toDouble();
          await docRef.update({
            'uploadStatus': ProjectPhotoUploadStatus.uploading.name,
            'uploadProgress': progress,
            'updatedAt': FirebaseService.now(),
          }).timeout(const Duration(seconds: 15));
        }

        final url = await ref.getDownloadURL();
        await docRef.update({
          'storagePath': storagePath,
          'downloadUrl': url,
          'uploadStatus': ProjectPhotoUploadStatus.uploaded.name,
          'uploadProgress': 1,
          'errorMessage': null,
          'updatedAt': FirebaseService.now(),
        }).timeout(const Duration(seconds: 15));
      } catch (e) {
        await _markFailed(docRef, e.toString());
      }
    } finally {
      _activeUploads.remove(photoId);
    }
  }

  Future<void> _markFailed(
    DocumentReference<Map<String, dynamic>> docRef,
    String message,
  ) {
    return docRef.update({
      'uploadStatus': ProjectPhotoUploadStatus.failed.name,
      'errorMessage': message,
      'updatedAt': FirebaseService.now(),
    }).timeout(const Duration(seconds: 15));
  }

  Future<File> _prepareLocalFile(XFile file, int index) async {
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory('${docs.path}/workshare/photos');
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }

    final target =
        '${dir.path}/ws_photo_${DateTime.now().millisecondsSinceEpoch}_$index.jpg';
    try {
      final compressed = await FlutterImageCompress.compressAndGetFile(
        file.path,
        target,
        quality: 92,
        minWidth: 3200,
        minHeight: 3200,
        format: CompressFormat.jpeg,
      );
      if (compressed != null) {
        return File(compressed.path);
      }
    } catch (_) {
      // If compression is not available on this device, copy original.
    }

    return File(file.path).copy(target);
  }

  Future<void> deletePhoto(ProjectPhoto photo) async {
    if (photo.storagePath.isNotEmpty) {
      try {
        await FirebaseService.storage.ref().child(photo.storagePath).delete();
      } catch (_) {
        // Ignore storage delete failures, firestore doc deletion is authoritative in UI.
      }
    }
    if (photo.localPath.isNotEmpty) {
      try {
        final f = File(photo.localPath);
        if (f.existsSync()) {
          await f.delete();
        }
      } catch (_) {}
    }
    await FirebaseService.projectPhotos.doc(photo.id).delete();
  }

  String _safeExtension(String path) {
    final trimmed = path.trim().toLowerCase();
    if (trimmed.endsWith('.png')) return 'png';
    if (trimmed.endsWith('.webp')) return 'webp';
    return 'jpg';
  }
}

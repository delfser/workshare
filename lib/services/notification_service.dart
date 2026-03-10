import 'package:cloud_firestore/cloud_firestore.dart';

import 'firebase_service.dart';

class NotificationService {
  Stream<List<QueryDocumentSnapshot<Map<String, dynamic>>>>
      streamUserNotifications(String userId) {
    if (userId.trim().isEmpty) {
      return const Stream<
          List<QueryDocumentSnapshot<Map<String, dynamic>>>>.empty();
    }
    return FirebaseService.appNotifications
        .where('userId', isEqualTo: userId)
        .snapshots()
        .map((s) {
      final docs = s.docs.toList();
      docs.sort((a, b) {
        final aTs = a.data()['createdAt'] as Timestamp?;
        final bTs = b.data()['createdAt'] as Timestamp?;
        final aMs = aTs?.millisecondsSinceEpoch ?? 0;
        final bMs = bTs?.millisecondsSinceEpoch ?? 0;
        return bMs.compareTo(aMs);
      });
      return docs.take(100).toList();
    });
  }

  Stream<int> streamUnreadNotificationCount(String userId) {
    if (userId.trim().isEmpty) {
      return const Stream<int>.empty();
    }
    return FirebaseService.appNotifications
        .where('userId', isEqualTo: userId)
        .where('readAt', isEqualTo: null)
        .snapshots()
        .map((s) => s.size);
  }

  Future<void> createNotification({
    required String userId,
    required String title,
    required String message,
    String type = 'info',
    String? projectId,
    String? workgroupId,
  }) async {
    if (userId.trim().isEmpty) return;
    final doc = FirebaseService.appNotifications.doc();
    await doc.set({
      'id': doc.id,
      'userId': userId,
      'title': title.trim(),
      'message': message.trim(),
      'type': type.trim(),
      'projectId': projectId,
      'workgroupId': workgroupId,
      'createdBy': FirebaseService.currentUid,
      'createdAt': FirebaseService.now(),
      'readAt': null,
    }).timeout(const Duration(seconds: 15));
  }

  Future<void> markAllAsRead(String userId) async {
    if (userId.trim().isEmpty) return;
    final unread = await FirebaseService.appNotifications
        .where('userId', isEqualTo: userId)
        .where('readAt', isEqualTo: null)
        .get()
        .timeout(const Duration(seconds: 15));
    if (unread.docs.isEmpty) return;

    final batch = FirebaseService.db.batch();
    for (final doc in unread.docs) {
      batch.update(doc.reference, {'readAt': FirebaseService.now()});
    }
    await batch.commit().timeout(const Duration(seconds: 15));
  }

  Future<void> deleteNotification(String notificationId, String userId) async {
    if (notificationId.trim().isEmpty || userId.trim().isEmpty) return;
    final doc = await FirebaseService.appNotifications
        .doc(notificationId)
        .get()
        .timeout(const Duration(seconds: 15));
    final data = doc.data();
    if (!doc.exists || data == null) return;
    if ((data['userId'] as String? ?? '') != userId) return;
    await doc.reference.delete().timeout(const Duration(seconds: 15));
  }

  Future<void> deleteAllNotifications(String userId) async {
    if (userId.trim().isEmpty) return;
    final docs = await FirebaseService.appNotifications
        .where('userId', isEqualTo: userId)
        .get()
        .timeout(const Duration(seconds: 15));
    if (docs.docs.isEmpty) return;
    final batch = FirebaseService.db.batch();
    for (final doc in docs.docs) {
      batch.delete(doc.reference);
    }
    await batch.commit().timeout(const Duration(seconds: 15));
  }

  Future<int> deleteNotificationsOlderThanDays({
    required String userId,
    int days = 30,
  }) async {
    if (userId.trim().isEmpty || days <= 0) return 0;
    final cutoff = DateTime.now().subtract(Duration(days: days));
    final oldDocs = await FirebaseService.appNotifications
        .where('userId', isEqualTo: userId)
        .where('createdAt', isLessThan: Timestamp.fromDate(cutoff))
        .get()
        .timeout(const Duration(seconds: 15));
    if (oldDocs.docs.isEmpty) return 0;

    var deleted = 0;
    const chunkSize = 450;
    final docs = oldDocs.docs;
    for (var i = 0; i < docs.length; i += chunkSize) {
      final end = (i + chunkSize > docs.length) ? docs.length : i + chunkSize;
      final batch = FirebaseService.db.batch();
      for (final doc in docs.sublist(i, end)) {
        batch.delete(doc.reference);
        deleted++;
      }
      await batch.commit().timeout(const Duration(seconds: 20));
    }
    return deleted;
  }
}

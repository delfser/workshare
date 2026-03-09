import '../models/work_log.dart';
import 'firebase_service.dart';

class WorkLogService {
  List<WorkLog> _sortLogs(List<WorkLog> logs) {
    logs.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return logs;
  }

  Stream<List<WorkLog>> streamWorkLogs(String projectId) {
    return FirebaseService.workLogs
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) => _sortLogs(
              snapshot.docs.map((doc) => WorkLog.fromMap(doc.id, doc.data())).toList(),
            ));
  }

  Future<List<WorkLog>> fetchWorkLogs(String projectId) async {
    final snapshot = await FirebaseService.workLogs
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    return _sortLogs(snapshot.docs.map((doc) => WorkLog.fromMap(doc.id, doc.data())).toList());
  }

  Future<void> addWorkLog({
    required String projectId,
    required double hours,
    required String worker,
    required String createdBy,
  }) async {
    final doc = FirebaseService.workLogs.doc();
    final now = FirebaseService.now();
    await doc.set({
      'id': doc.id,
      'projectId': projectId,
      'hours': hours,
      'worker': worker.trim(),
      'createdBy': createdBy,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<void> deleteWorkLog(String id) {
    return FirebaseService.workLogs.doc(id).delete();
  }
}

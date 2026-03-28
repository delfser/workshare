import '../models/project_note.dart';
import 'firebase_service.dart';

class ProjectNoteService {
  Stream<List<ProjectNote>> streamNotes(
    String projectId, {
    String? type,
  }) {
    return FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) {
      final notes = snapshot.docs
          .map((doc) => ProjectNote.fromMap(doc.id, doc.data()))
          .where((note) => type == null ? true : note.type == type)
          .toList();
      notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      return notes;
    });
  }

  Future<List<ProjectNote>> fetchNotes(
    String projectId, {
    String? type,
  }) async {
    final snapshot = await FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .get();
    final notes = snapshot.docs
        .map((doc) => ProjectNote.fromMap(doc.id, doc.data()))
        .where((note) => type == null ? true : note.type == type)
        .toList();
    notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return notes;
  }

  Future<void> addNote({
    required String projectId,
    required String text,
    required String createdBy,
    String type = 'note',
  }) async {
    final doc = FirebaseService.projectNotes.doc();
    final now = FirebaseService.now();
    await doc.set({
      'id': doc.id,
      'projectId': projectId,
      'text': text.trim(),
      'type': type,
      'createdBy': createdBy,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<void> deleteNote(String noteId) {
    return FirebaseService.projectNotes.doc(noteId).delete();
  }

  Future<void> updateNote({
    required String noteId,
    required String text,
  }) {
    return FirebaseService.projectNotes.doc(noteId).update({
      'text': text.trim(),
      'updatedAt': FirebaseService.now(),
    });
  }
}

import '../models/project_note.dart';
import 'firebase_service.dart';

class ProjectNoteService {
  Stream<List<ProjectNote>> streamNotes(String projectId) {
    return FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) {
          final notes = snapshot.docs
              .map((doc) => ProjectNote.fromMap(doc.id, doc.data()))
              .toList();
          notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
          return notes;
        });
  }

  Future<void> addNote({
    required String projectId,
    required String text,
    required String createdBy,
  }) async {
    final doc = FirebaseService.projectNotes.doc();
    final now = FirebaseService.now();
    await doc.set({
      'id': doc.id,
      'projectId': projectId,
      'text': text.trim(),
      'createdBy': createdBy,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<void> deleteNote(String noteId) {
    return FirebaseService.projectNotes.doc(noteId).delete();
  }
}

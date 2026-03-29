import '../models/project_note.dart';
import 'firebase_service.dart';

class ProjectNoteService {
  List<ProjectNote> _sort(List<ProjectNote> notes) {
    notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return notes;
  }

  List<ProjectNote> _onlyActivities(List<ProjectNote> notes) {
    return notes.where((note) => note.type == 'activity').toList();
  }

  List<ProjectNote> _onlyNotes(List<ProjectNote> notes) {
    // Keep backward compatibility with older notes that had no explicit type.
    return notes.where((note) => note.type != 'activity').toList();
  }

  Stream<List<ProjectNote>> streamActivities(String projectId) {
    return FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) => _sort(_onlyActivities(
              snapshot.docs
                  .map((doc) => ProjectNote.fromMap(doc.id, doc.data()))
                  .toList(),
            )));
  }

  Stream<List<ProjectNote>> streamRegularNotes(String projectId) {
    return FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) => _sort(_onlyNotes(
              snapshot.docs
                  .map((doc) => ProjectNote.fromMap(doc.id, doc.data()))
                  .toList(),
            )));
  }

  Future<List<ProjectNote>> fetchActivities(String projectId) async {
    final snapshot = await FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .get();
    return _sort(_onlyActivities(
      snapshot.docs
          .map((doc) => ProjectNote.fromMap(doc.id, doc.data()))
          .toList(),
    ));
  }

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
      return _sort(notes);
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
    return _sort(notes);
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

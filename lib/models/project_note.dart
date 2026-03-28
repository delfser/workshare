class ProjectNote {
  const ProjectNote({
    required this.id,
    required this.projectId,
    required this.text,
    required this.type,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String projectId;
  final String text;
  final String type;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory ProjectNote.fromMap(String id, Map<String, dynamic> map) {
    return ProjectNote(
      id: id,
      projectId: map['projectId'] as String? ?? '',
      text: map['text'] as String? ?? '',
      type: map['type'] as String? ?? 'note',
      createdBy: map['createdBy'] as String? ?? '',
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }
}

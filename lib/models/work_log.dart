class WorkLog {
  const WorkLog({
    required this.id,
    required this.projectId,
    required this.hours,
    required this.worker,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String projectId;
  final double hours;
  final String worker;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory WorkLog.fromMap(String id, Map<String, dynamic> map) {
    return WorkLog(
      id: id,
      projectId: map['projectId'] as String? ?? '',
      hours: (map['hours'] as num?)?.toDouble() ?? 0,
      worker: (map['worker'] as String?) ?? (map['note'] as String?) ?? '',
      createdBy: map['createdBy'] as String? ?? '',
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }
}

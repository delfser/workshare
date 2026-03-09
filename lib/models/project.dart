class Project {
  const Project({
    required this.id,
    required this.name,
    this.description,
    required this.ownerId,
    this.workgroupId,
    this.projectCode,
    required this.materialSortMode,
    required this.archived,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String? description;
  final String ownerId;
  final String? workgroupId;
  final String? projectCode;
  final String materialSortMode;
  final bool archived;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Project.fromMap(String id, Map<String, dynamic> map) {
    return Project(
      id: id,
      name: map['name'] as String? ?? '',
      description: map['description'] as String?,
      ownerId: map['ownerId'] as String? ?? '',
      workgroupId: map['workgroupId'] as String?,
      projectCode: map['projectCode'] as String?,
      materialSortMode: map['materialSortMode'] as String? ?? 'input',
      archived: map['archived'] as bool? ?? false,
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'ownerId': ownerId,
      'workgroupId': workgroupId,
      'projectCode': projectCode,
      'materialSortMode': materialSortMode,
      'archived': archived,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
}

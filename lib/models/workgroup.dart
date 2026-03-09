class Workgroup {
  const Workgroup({
    required this.id,
    required this.name,
    required this.ownerId,
    required this.joinCode,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String ownerId;
  final String joinCode;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Workgroup.fromMap(String id, Map<String, dynamic> map) {
    return Workgroup(
      id: id,
      name: map['name'] as String? ?? '',
      ownerId: map['ownerId'] as String? ?? '',
      joinCode: (map['joinCode'] as String? ?? '').toUpperCase(),
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }
}

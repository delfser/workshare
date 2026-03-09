class MaterialItem {
  const MaterialItem({
    required this.id,
    required this.projectId,
    required this.name,
    required this.quantity,
    required this.unit,
    this.catalogEntryId,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String projectId;
  final String name;
  final double quantity;
  final String unit;
  final String? catalogEntryId;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory MaterialItem.fromMap(String id, Map<String, dynamic> map) {
    return MaterialItem(
      id: id,
      projectId: map['projectId'] as String? ?? '',
      name: map['name'] as String? ?? '',
      quantity: (map['quantity'] as num?)?.toDouble() ?? 0,
      unit: map['unit'] as String? ?? '',
      catalogEntryId: map['catalogEntryId'] as String?,
      createdBy: map['createdBy'] as String? ?? '',
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'projectId': projectId,
      'name': name,
      'quantity': quantity,
      'unit': unit,
      'catalogEntryId': catalogEntryId,
      'createdBy': createdBy,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
}

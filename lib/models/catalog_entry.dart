class CatalogEntry {
  const CatalogEntry({
    required this.id,
    required this.name,
    required this.nameLower,
    required this.unit,
    this.category,
    required this.createdBy,
    this.workgroupId,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String nameLower;
  final String unit;
  final String? category;
  final String createdBy;
  final String? workgroupId;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory CatalogEntry.fromMap(String id, Map<String, dynamic> map) {
    return CatalogEntry(
      id: id,
      name: map['name'] as String? ?? '',
      nameLower: map['nameLower'] as String? ?? '',
      unit: map['unit'] as String? ?? '',
      category: map['category'] as String?,
      createdBy: map['createdBy'] as String? ?? '',
      workgroupId: map['workgroupId'] as String?,
      isActive: map['isActive'] as bool? ?? true,
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'nameLower': nameLower,
      'unit': unit,
      'category': category,
      'createdBy': createdBy,
      'workgroupId': workgroupId,
      'isActive': isActive,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
}

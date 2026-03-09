class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String email;
  final String displayName;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory AppUser.fromMap(String id, Map<String, dynamic> map) {
    return AppUser(
      id: id,
      email: map['email'] as String? ?? '',
      displayName: map['displayName'] as String? ?? '',
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      updatedAt: (map['updatedAt'] as dynamic).toDate() as DateTime,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'email': email,
      'displayName': displayName,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
}

import 'enums.dart';

class WorkgroupMember {
  const WorkgroupMember({
    required this.id,
    required this.workgroupId,
    required this.userId,
    required this.email,
    required this.role,
    required this.joinedAt,
  });

  final String id;
  final String workgroupId;
  final String userId;
  final String email;
  final WorkgroupRole role;
  final DateTime joinedAt;

  factory WorkgroupMember.fromMap(String id, Map<String, dynamic> map) {
    return WorkgroupMember(
      id: id,
      workgroupId: map['workgroupId'] as String? ?? '',
      userId: map['userId'] as String? ?? '',
      email: map['email'] as String? ?? '',
      role: WorkgroupRoleX.fromString(map['role'] as String? ?? 'member'),
      joinedAt: (map['joinedAt'] as dynamic).toDate() as DateTime,
    );
  }
}

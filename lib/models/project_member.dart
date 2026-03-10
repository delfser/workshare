import 'enums.dart';

class ProjectMember {
  const ProjectMember({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.email,
    required this.role,
    this.invitedBy,
    required this.joinedAt,
  });

  final String id;
  final String projectId;
  final String userId;
  final String email;
  final ProjectRole role;
  final String? invitedBy;
  final DateTime joinedAt;

  factory ProjectMember.fromMap(String id, Map<String, dynamic> map) {
    return ProjectMember(
      id: id,
      projectId: map['projectId'] as String? ?? '',
      userId: map['userId'] as String? ?? '',
      email: map['email'] as String? ?? '',
      role: ProjectRoleX.fromString(map['role'] as String? ?? 'viewer'),
      invitedBy: map['invitedBy'] as String?,
      joinedAt: (map['joinedAt'] as dynamic).toDate() as DateTime,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'projectId': projectId,
      'userId': userId,
      'email': email,
      'role': role.value,
      'invitedBy': invitedBy,
      'joinedAt': joinedAt,
    };
  }
}

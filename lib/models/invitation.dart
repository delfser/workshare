import 'enums.dart';

class Invitation {
  const Invitation({
    required this.id,
    required this.projectId,
    required this.projectName,
    required this.email,
    required this.role,
    required this.invitedBy,
    required this.status,
    required this.createdAt,
    this.acceptedAt,
  });

  final String id;
  final String projectId;
  final String projectName;
  final String email;
  final ProjectRole role;
  final String invitedBy;
  final InvitationStatus status;
  final DateTime createdAt;
  final DateTime? acceptedAt;

  factory Invitation.fromMap(String id, Map<String, dynamic> map) {
    return Invitation(
      id: id,
      projectId: map['projectId'] as String? ?? '',
      projectName: map['projectName'] as String? ?? '',
      email: map['email'] as String? ?? '',
      role: ProjectRoleX.fromString(map['role'] as String? ?? 'viewer'),
      invitedBy: map['invitedBy'] as String? ?? '',
      status: InvitationStatusX.fromString(map['status'] as String? ?? 'pending'),
      createdAt: (map['createdAt'] as dynamic).toDate() as DateTime,
      acceptedAt: (map['acceptedAt'] as dynamic?)?.toDate() as DateTime?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'projectId': projectId,
      'projectName': projectName,
      'email': email,
      'role': role.value,
      'invitedBy': invitedBy,
      'status': status.value,
      'createdAt': createdAt,
      'acceptedAt': acceptedAt,
    };
  }
}

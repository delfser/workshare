enum ProjectRole { owner, admin, worker, viewer }

enum InvitationStatus { pending, accepted, revoked }
enum WorkgroupRole { owner, admin, member }

extension ProjectRoleX on ProjectRole {
  String get value => name;

  static ProjectRole fromString(String raw) {
    final normalized = raw.trim().toLowerCase();
    return ProjectRole.values.firstWhere(
      (r) => r.name == normalized,
      orElse: () => ProjectRole.viewer,
    );
  }
}

extension InvitationStatusX on InvitationStatus {
  String get value => name;

  static InvitationStatus fromString(String raw) {
    return InvitationStatus.values.firstWhere(
      (s) => s.name == raw,
      orElse: () => InvitationStatus.pending,
    );
  }
}

extension WorkgroupRoleX on WorkgroupRole {
  String get value => name;

  static WorkgroupRole fromString(String raw) {
    final normalized = raw.trim().toLowerCase();
    return WorkgroupRole.values.firstWhere(
      (r) => r.name == normalized,
      orElse: () => WorkgroupRole.member,
    );
  }
}

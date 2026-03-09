import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/enums.dart';
import '../models/workgroup_member.dart';
import 'firebase_service.dart';

class InvitationService {
  Stream<int> streamPendingInvitationCount(String email) {
    final normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.isEmpty) {
      return const Stream<int>.empty();
    }
    return FirebaseService.invitations
        .where('email', isEqualTo: normalizedEmail)
        .where('status', isEqualTo: InvitationStatus.pending.value)
        .snapshots()
        .map((s) => s.size);
  }

  Future<void> inviteByEmail({
    required String projectId,
    required String projectName,
    required String email,
    required ProjectRole role,
    required String invitedBy,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final doc = FirebaseService.invitations.doc();

    await doc.set({
      'id': doc.id,
      'projectId': projectId,
      'projectName': projectName,
      'email': normalizedEmail,
      'role': role.value,
      'invitedBy': invitedBy,
      'status': InvitationStatus.pending.value,
      'createdAt': FirebaseService.now(),
      'acceptedAt': null,
    }).timeout(const Duration(seconds: 15));
  }

  Future<int> inviteWorkgroup({
    required String projectId,
    required String projectName,
    required String workgroupId,
    required String invitedBy,
    ProjectRole role = ProjectRole.worker,
  }) async {
    final membersSnap = await FirebaseService.workgroupMembers
        .where('workgroupId', isEqualTo: workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    final projectMembersSnap = await FirebaseService.members
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final existingEmails = projectMembersSnap.docs
        .map((d) => ((d.data()['email'] as String?) ?? '').toLowerCase())
        .where((e) => e.isNotEmpty)
        .toSet();

    final batch = FirebaseService.db.batch();
    var created = 0;
    for (final doc in membersSnap.docs) {
      final member = WorkgroupMember.fromMap(doc.id, doc.data());
      final email = member.email.trim().toLowerCase();
      if (email.isEmpty || existingEmails.contains(email)) continue;

      final invRef = FirebaseService.invitations.doc();
      batch.set(invRef, {
        'id': invRef.id,
        'projectId': projectId,
        'projectName': projectName,
        'email': email,
        'role': role.value,
        'invitedBy': invitedBy,
        'status': InvitationStatus.pending.value,
        'createdAt': FirebaseService.now(),
        'acceptedAt': null,
        'workgroupId': workgroupId,
      });
      created++;
    }

    if (created > 0) {
      await batch.commit().timeout(const Duration(seconds: 15));
    }
    return created;
  }

  Future<void> acceptPendingInvitationsForUser({
    required String userId,
    required String email,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final pending = await FirebaseService.invitations
        .where('email', isEqualTo: normalizedEmail)
        .where('status', isEqualTo: InvitationStatus.pending.value)
        .get()
        .timeout(const Duration(seconds: 12));

    for (final invitationDoc in pending.docs) {
      await _acceptInvitationForUser(invitationDoc.id, userId, normalizedEmail);
    }
  }

  Future<void> _acceptInvitationForUser(
    String invitationId,
    String userId,
    String email,
  ) async {
    final invitationRef = FirebaseService.invitations.doc(invitationId);

    await FirebaseService.db.runTransaction((tx) async {
      final invitation = await tx.get(invitationRef);
      if (!invitation.exists || invitation.data() == null) {
        return;
      }
      final data = invitation.data()!;
      if (data['status'] != InvitationStatus.pending.value) {
        return;
      }

      final projectId = data['projectId'] as String;
      final role = data['role'] as String? ?? ProjectRole.viewer.value;
      final memberId = '${projectId}_$userId';

      tx.set(
        FirebaseService.members.doc(memberId),
        {
          'id': memberId,
          'projectId': projectId,
          'userId': userId,
          'email': email,
          'role': role,
          'invitedBy': data['invitedBy'],
          'invitationId': invitationId,
          'joinedAt': FirebaseService.now(),
        },
        SetOptions(merge: true),
      );

      tx.update(invitationRef, {
        'status': InvitationStatus.accepted.value,
        'acceptedAt': FirebaseService.now(),
      });
    }).timeout(const Duration(seconds: 15));
  }
}

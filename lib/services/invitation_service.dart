import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/enums.dart';
import '../models/workgroup_member.dart';
import 'firebase_service.dart';
import 'notification_service.dart';

class InvitationService {
  final _notificationService = NotificationService();
  Stream<List<QueryDocumentSnapshot<Map<String, dynamic>>>>
      streamPendingInvitations(String email) {
    final normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.isEmpty) {
      return const Stream<
          List<QueryDocumentSnapshot<Map<String, dynamic>>>>.empty();
    }
    return FirebaseService.invitations
        .where('email', isEqualTo: normalizedEmail)
        .where('status', isEqualTo: InvitationStatus.pending.value)
        .snapshots()
        .map((s) => s.docs);
  }

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

  Future<List<String>> fetchPendingInvitationIds(String email) async {
    final normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.isEmpty) return const [];
    final snapshot = await FirebaseService.invitations
        .where('email', isEqualTo: normalizedEmail)
        .where('status', isEqualTo: InvitationStatus.pending.value)
        .get()
        .timeout(const Duration(seconds: 12));
    return snapshot.docs.map((d) => d.id).toList();
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

  Future<void> inviteWorkgroupByEmail({
    required String workgroupId,
    required String workgroupName,
    required String email,
    required String invitedBy,
    WorkgroupRole role = WorkgroupRole.member,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final doc = FirebaseService.invitations.doc();
    await doc.set({
      'id': doc.id,
      'projectId': null,
      'projectName': null,
      'workgroupId': workgroupId,
      'workgroupName': workgroupName,
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

  Future<void> acceptInvitation({
    required String invitationId,
    required String userId,
    required String email,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    final invitationRef = FirebaseService.invitations.doc(invitationId);
    final invitationDoc =
        await invitationRef.get().timeout(const Duration(seconds: 15));
    final invitationData = invitationDoc.data();
    if (invitationData == null) {
      throw StateError('Einladung nicht gefunden.');
    }
    final preWorkgroupId = (invitationData['workgroupId'] as String?) ?? '';
    if (preWorkgroupId.isNotEmpty) {
      final existingMemberships = await FirebaseService.workgroupMembers
          .where('userId', isEqualTo: userId)
          .get()
          .timeout(const Duration(seconds: 15));
      final otherMembershipExists = existingMemberships.docs.any((d) {
        final id = (d.data()['workgroupId'] as String?) ?? '';
        return id.isNotEmpty && id != preWorkgroupId;
      });
      if (otherMembershipExists) {
        throw StateError(
            'Du kannst nur in einer Workgroup sein. Bitte zuerst die bestehende Workgroup verlassen.');
      }
    }

    String? notifyUserId;
    String? notifyTitle;
    String? notifyMessage;
    String? notifyType;
    String? notifyProjectId;
    String? notifyWorkgroupId;

    await FirebaseService.db.runTransaction((tx) async {
      final invitation = await tx.get(invitationRef);
      if (!invitation.exists || invitation.data() == null) {
        throw StateError('Einladung nicht gefunden.');
      }
      final data = invitation.data()!;
      if (data['status'] != InvitationStatus.pending.value) {
        return;
      }

      final targetEmail = (data['email'] as String? ?? '').toLowerCase();
      if (targetEmail != normalizedEmail) {
        throw StateError('Einladung gehoert nicht zu diesem Benutzer.');
      }

      final projectId = (data['projectId'] as String?) ?? '';
      final workgroupId = (data['workgroupId'] as String?) ?? '';
      final rawRole = ((data['role'] as String?) ?? '').trim().toLowerCase();

      if (projectId.isNotEmpty) {
        final role = _normalizeProjectRole(rawRole);
        final memberId = '${projectId}_$userId';
        tx.set(
          FirebaseService.members.doc(memberId),
          {
            'id': memberId,
            'projectId': projectId,
            'userId': userId,
            'email': normalizedEmail,
            'role': role,
            'invitedBy': data['invitedBy'],
            'invitationId': invitationId,
            'joinedAt': FirebaseService.now(),
          },
          SetOptions(merge: true),
        );
        final invitedBy = (data['invitedBy'] as String?) ?? '';
        if (invitedBy.isNotEmpty && invitedBy != userId) {
          notifyUserId = invitedBy;
          notifyTitle = 'Projektbeitritt bestaetigt';
          notifyMessage =
              '$normalizedEmail hat die Projekteinladung angenommen.';
          notifyType = 'project_joined';
          notifyProjectId = projectId;
          notifyWorkgroupId = null;
        }
      } else if (workgroupId.isNotEmpty) {
        final role = _normalizeWorkgroupRole(rawRole);
        final memberId = '${workgroupId}_$userId';
        tx.set(
          FirebaseService.workgroupMembers.doc(memberId),
          {
            'id': memberId,
            'workgroupId': workgroupId,
            'userId': userId,
            'email': normalizedEmail,
            'role': role,
            'invitedBy': data['invitedBy'],
            'invitationId': invitationId,
            'joinedAt': FirebaseService.now(),
          },
          SetOptions(merge: true),
        );
        final invitedBy = (data['invitedBy'] as String?) ?? '';
        if (invitedBy.isNotEmpty && invitedBy != userId) {
          notifyUserId = invitedBy;
          notifyTitle = 'Workgroup-Beitritt bestaetigt';
          notifyMessage =
              '$normalizedEmail hat die Workgroup-Einladung angenommen.';
          notifyType = 'workgroup_joined';
          notifyProjectId = null;
          notifyWorkgroupId = workgroupId;
        }
      } else {
        throw StateError('Einladung ist fehlerhaft.');
      }

      tx.update(invitationRef, {
        'status': InvitationStatus.accepted.value,
        'acceptedAt': FirebaseService.now(),
      });
    }).timeout(const Duration(seconds: 15));

    if (notifyUserId != null &&
        notifyTitle != null &&
        notifyMessage != null &&
        notifyType != null) {
      try {
        await _notificationService.createNotification(
          userId: notifyUserId!,
          title: notifyTitle!,
          message: notifyMessage!,
          type: notifyType!,
          projectId: notifyProjectId,
          workgroupId: notifyWorkgroupId,
        );
      } catch (_) {
        // Acceptance must not fail if optional notification cannot be written.
      }
    }
  }

  Future<void> declineInvitation(String invitationId) {
    return FirebaseService.invitations.doc(invitationId).update({
      'status': InvitationStatus.revoked.value,
      'acceptedAt': FirebaseService.now(),
    }).timeout(const Duration(seconds: 15));
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

  String _normalizeProjectRole(String role) {
    const allowed = {'owner', 'admin', 'worker', 'viewer'};
    return allowed.contains(role) ? role : ProjectRole.worker.value;
  }

  String _normalizeWorkgroupRole(String role) {
    const allowed = {'owner', 'admin', 'member'};
    return allowed.contains(role) ? role : WorkgroupRole.member.value;
  }
}

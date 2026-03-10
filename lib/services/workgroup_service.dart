import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../models/enums.dart';
import '../models/workgroup.dart';
import '../models/workgroup_member.dart';
import 'firebase_service.dart';
import 'notification_service.dart';

class WorkgroupService {
  static const _alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  static const _projectCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  final _random = Random.secure();
  final _notificationService = NotificationService();

  Future<void> _ensureSingleWorkgroupMembership({
    required String userId,
    String? allowWorkgroupId,
  }) async {
    final memberships = await FirebaseService.workgroupMembers
        .where('userId', isEqualTo: userId)
        .get()
        .timeout(const Duration(seconds: 15));
    final existingIds = memberships.docs
        .map((d) => (d.data()['workgroupId'] as String?) ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
    if (allowWorkgroupId != null && allowWorkgroupId.isNotEmpty) {
      existingIds.remove(allowWorkgroupId);
    }
    if (existingIds.isNotEmpty) {
      throw StateError(
          'Du kannst nur in einer Workgroup sein. Bitte zuerst die bestehende Workgroup verlassen.');
    }
  }

  String _newCode([int length = 6]) {
    return List.generate(
        length, (_) => _alphabet[_random.nextInt(_alphabet.length)]).join();
  }

  Future<String> _allocateCode() async {
    for (var i = 0; i < 20; i++) {
      final code = _newCode();
      final doc = await FirebaseService.workgroupJoinCodes.doc(code).get();
      if (!doc.exists) return code;
    }
    throw StateError('Kein freier Workgroup-Code verfügbar.');
  }

  String _newProjectCode([int length = 6]) {
    return List.generate(
        length,
        (_) => _projectCodeAlphabet[
            _random.nextInt(_projectCodeAlphabet.length)]).join();
  }

  Future<String> _allocateProjectCode() async {
    for (var i = 0; i < 20; i++) {
      final code = _newProjectCode();
      final doc = await FirebaseService.projectJoinCodes.doc(code).get();
      if (!doc.exists) return code;
    }
    throw StateError('Kein freier Projektcode verfügbar.');
  }

  Stream<List<WorkgroupMember>> streamUserMemberships(String uid) {
    return FirebaseService.workgroupMembers
        .where('userId', isEqualTo: uid)
        .snapshots()
        .map((s) => s.docs
            .map((d) => WorkgroupMember.fromMap(d.id, d.data()))
            .toList());
  }

  Stream<WorkgroupMember?> streamMembershipForWorkgroup({
    required String workgroupId,
    required String uid,
  }) {
    final id = '${workgroupId}_$uid';
    return FirebaseService.workgroupMembers.doc(id).snapshots().map((doc) {
      if (!doc.exists || doc.data() == null) return null;
      return WorkgroupMember.fromMap(doc.id, doc.data()!);
    });
  }

  Stream<List<WorkgroupMember>> streamMembers(String workgroupId) {
    return FirebaseService.workgroupMembers
        .where('workgroupId', isEqualTo: workgroupId)
        .snapshots()
        .map((s) {
      final members =
          s.docs.map((d) => WorkgroupMember.fromMap(d.id, d.data())).toList();
      members.sort(
          (a, b) => a.email.toLowerCase().compareTo(b.email.toLowerCase()));
      return members;
    });
  }

  Stream<List<Workgroup>> streamUserWorkgroups(String uid) {
    return streamUserMemberships(uid).switchMap((memberships) {
      final ids = memberships.map((m) => m.workgroupId).toSet().toList();
      return streamWorkgroupsByIds(ids);
    });
  }

  Stream<List<Workgroup>> streamUserManageableWorkgroups(String uid) {
    return streamUserMemberships(uid).switchMap((memberships) {
      final manageable = memberships
          .where((m) =>
              m.role == WorkgroupRole.owner || m.role == WorkgroupRole.admin)
          .map((m) => m.workgroupId)
          .toSet()
          .toList();
      return streamWorkgroupsByIds(manageable);
    });
  }

  Stream<List<Workgroup>> streamWorkgroupsByIds(List<String> workgroupIds) {
    final ids = workgroupIds.toSet().toList();
    if (ids.isEmpty) {
      return Stream.value(const <Workgroup>[]);
    }

    final streams = <Stream<List<Workgroup>>>[];
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30);
      streams.add(
        FirebaseService.workgroups
            .where(FieldPath.documentId, whereIn: chunk)
            .snapshots()
            .handleError((_, __) {})
            .map((snapshot) {
          final groups = <Workgroup>[];
          for (final doc in snapshot.docs) {
            try {
              groups.add(Workgroup.fromMap(doc.id, doc.data()));
            } catch (_) {}
          }
          return groups;
        }),
      );
    }

    return CombineLatestStream.list(streams).map((chunks) {
      final all = chunks.expand((e) => e).toList();
      all.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      return all;
    });
  }

  Future<void> createWorkgroup({
    required String ownerId,
    required String ownerEmail,
    required String name,
  }) async {
    await _ensureSingleWorkgroupMembership(userId: ownerId);
    final groupRef = FirebaseService.workgroups.doc();
    final code = await _allocateCode();
    final now = FirebaseService.now();
    final batch = FirebaseService.db.batch();

    batch.set(groupRef, {
      'id': groupRef.id,
      'name': name.trim(),
      'nameLower': name.trim().toLowerCase(),
      'ownerId': ownerId,
      'joinCode': code,
      'createdAt': now,
      'updatedAt': now,
    });

    final memberId = '${groupRef.id}_$ownerId';
    batch.set(FirebaseService.workgroupMembers.doc(memberId), {
      'id': memberId,
      'workgroupId': groupRef.id,
      'userId': ownerId,
      'email': ownerEmail.toLowerCase(),
      'role': WorkgroupRole.owner.value,
      'joinedAt': now,
    });

    batch.set(FirebaseService.workgroupJoinCodes.doc(code), {
      'code': code,
      'workgroupId': groupRef.id,
      'ownerId': ownerId,
      'isActive': true,
      'createdAt': now,
      'updatedAt': now,
    });

    await batch.commit();
  }

  Future<void> deleteWorkgroup(String workgroupId) async {
    final currentUid = FirebaseService.auth.currentUser?.uid;
    final workgroupDoc = await FirebaseService.workgroups
        .doc(workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    final workgroupName =
        (workgroupDoc.data()?['name'] as String?) ?? 'Workgroup';

    final members = await FirebaseService.workgroupMembers
        .where('workgroupId', isEqualTo: workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    for (final m in members.docs) {
      final data = m.data();
      final userId = (data['userId'] as String?) ?? '';
      final email = ((data['email'] as String?) ?? '').toLowerCase();
      if (userId.isEmpty || email.isEmpty) continue;
      await _detachProjectsForUser(
        workgroupId: workgroupId,
        userId: userId,
        email: email,
      );
      if (currentUid != null && userId != currentUid) {
        try {
          await _notificationService.createNotification(
            userId: userId,
            title: 'Workgroup gelöscht',
            message: 'Die Workgroup "$workgroupName" wurde vom Owner gelöscht.',
            type: 'workgroup_deleted',
            workgroupId: workgroupId,
          );
        } catch (_) {
          // Deletion must continue even if notification write fails.
        }
      }
    }

    final codes = await FirebaseService.workgroupJoinCodes
        .where('workgroupId', isEqualTo: workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    final invitations = await FirebaseService.invitations
        .where('workgroupId', isEqualTo: workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));

    final batch = FirebaseService.db.batch();
    batch.delete(FirebaseService.workgroups.doc(workgroupId));
    for (final doc in members.docs) {
      batch.delete(doc.reference);
    }
    for (final doc in codes.docs) {
      batch.delete(doc.reference);
    }
    for (final doc in invitations.docs) {
      batch.delete(doc.reference);
    }
    await batch.commit().timeout(const Duration(seconds: 15));
  }

  Future<void> joinByCode({
    required String code,
    required String userId,
    required String email,
  }) async {
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty) throw StateError('Bitte Workgroup-Code eingeben.');

    final codeDoc =
        await FirebaseService.workgroupJoinCodes.doc(normalized).get();
    if (!codeDoc.exists || codeDoc.data() == null) {
      throw StateError('Workgroup-Code ungültig.');
    }
    final codeData = codeDoc.data()!;
    final active = codeData['isActive'] as bool? ?? true;
    if (!active) throw StateError('Workgroup-Code ist nicht aktiv.');
    final workgroupId = codeData['workgroupId'] as String? ?? '';
    if (workgroupId.isEmpty) throw StateError('Workgroup-Code ist fehlerhaft.');

    await _ensureSingleWorkgroupMembership(
      userId: userId,
      allowWorkgroupId: workgroupId,
    );

    final memberId = '${workgroupId}_$userId';
    final memberRef = FirebaseService.workgroupMembers.doc(memberId);
    final member = await memberRef.get();
    if (member.exists) return;

    await memberRef.set({
      'id': memberId,
      'workgroupId': workgroupId,
      'userId': userId,
      'email': email.toLowerCase(),
      'role': WorkgroupRole.member.value,
      'joinCode': normalized,
      'joinedAt': FirebaseService.now(),
    });

    final ownerId = (codeData['ownerId'] as String?) ?? '';
    if (ownerId.isNotEmpty && ownerId != userId) {
      await _notificationService.createNotification(
        userId: ownerId,
        title: 'Neuer Workgroup-Beitritt',
        message: '${email.toLowerCase()} ist per Code beigetreten.',
        type: 'workgroup_joined',
        workgroupId: workgroupId,
      );
    }
  }

  Future<List<WorkgroupMember>> getMembers(String workgroupId) async {
    final snap = await FirebaseService.workgroupMembers
        .where('workgroupId', isEqualTo: workgroupId)
        .get();
    return snap.docs
        .map((d) => WorkgroupMember.fromMap(d.id, d.data()))
        .toList();
  }

  Future<void> leaveWorkgroup({
    required String workgroupId,
    required String userId,
    required String email,
  }) async {
    await _detachProjectsForUser(
      workgroupId: workgroupId,
      userId: userId,
      email: email.toLowerCase(),
    );
    final workgroupDoc = await FirebaseService.workgroups
        .doc(workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    final ownerId = (workgroupDoc.data()?['ownerId'] as String?) ?? '';
    if (ownerId.isNotEmpty && ownerId != userId) {
      await _notificationService.createNotification(
        userId: ownerId,
        title: 'Mitglied ausgetreten',
        message: '${email.toLowerCase()} hat die Workgroup verlassen.',
        type: 'workgroup_left',
        workgroupId: workgroupId,
      );
    }
    final memberId = '${workgroupId}_$userId';
    await FirebaseService.workgroupMembers
        .doc(memberId)
        .delete()
        .timeout(const Duration(seconds: 15));
  }

  Future<void> removeMember({
    required String workgroupId,
    required String userId,
  }) async {
    final actorUid = FirebaseService.auth.currentUser?.uid ?? '';
    final actorEmail =
        (FirebaseService.auth.currentUser?.email ?? '').trim().toLowerCase();
    final workgroupDoc = await FirebaseService.workgroups
        .doc(workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    final ownerId = (workgroupDoc.data()?['ownerId'] as String?) ?? '';
    final memberId = '${workgroupId}_$userId';
    final doc = await FirebaseService.workgroupMembers
        .doc(memberId)
        .get()
        .timeout(const Duration(seconds: 15));
    if (!doc.exists || doc.data() == null) return;
    final email = ((doc.data()!['email'] as String?) ?? '').toLowerCase();
    if (email.isEmpty) {
      await _notificationService.createNotification(
        userId: userId,
        title: 'Aus Workgroup entfernt',
        message: 'Du wurdest aus einer Workgroup entfernt.',
        type: 'workgroup_removed',
        workgroupId: workgroupId,
      );
      await FirebaseService.workgroupMembers
          .doc(memberId)
          .delete()
          .timeout(const Duration(seconds: 15));
      if (ownerId.isNotEmpty && ownerId != actorUid) {
        await _notificationService.createNotification(
          userId: ownerId,
          title: 'Mitglied entfernt',
          message:
              '${actorEmail.isEmpty ? 'Ein Admin' : actorEmail} hat ein Mitglied entfernt.',
          type: 'workgroup_member_removed',
          workgroupId: workgroupId,
        );
      }
      return;
    }
    await _notificationService.createNotification(
      userId: userId,
      title: 'Aus Workgroup entfernt',
      message: 'Du wurdest aus einer Workgroup entfernt.',
      type: 'workgroup_removed',
      workgroupId: workgroupId,
    );
    await _detachProjectsForUser(
      workgroupId: workgroupId,
      userId: userId,
      email: email,
    );
    await FirebaseService.workgroupMembers
        .doc(memberId)
        .delete()
        .timeout(const Duration(seconds: 15));
    if (ownerId.isNotEmpty && ownerId != actorUid) {
      await _notificationService.createNotification(
        userId: ownerId,
        title: 'Mitglied entfernt',
        message:
            '${actorEmail.isEmpty ? 'Ein Admin' : actorEmail} hat $email entfernt.',
        type: 'workgroup_member_removed',
        workgroupId: workgroupId,
      );
    }
  }

  Future<void> _detachProjectsForUser({
    required String workgroupId,
    required String userId,
    required String email,
  }) async {
    final currentUid = FirebaseService.currentUid;
    final creatingForSelf = currentUid == userId;

    final wgProjects = await FirebaseService.projects
        .where('workgroupId', isEqualTo: workgroupId)
        .get()
        .timeout(const Duration(seconds: 15));
    if (wgProjects.docs.isEmpty) return;

    for (final projectDoc in wgProjects.docs) {
      final oldProjectId = projectDoc.id;
      final oldMemberships = await FirebaseService.members
          .where('projectId', isEqualTo: oldProjectId)
          .where('userId', isEqualTo: userId)
          .get()
          .timeout(const Duration(seconds: 15));
      if (oldMemberships.docs.isEmpty) continue;

      final now = FirebaseService.now();
      final newProjectRef = FirebaseService.projects.doc();
      final newProjectId = newProjectRef.id;
      final newCode = await _allocateProjectCode();
      final oldData = projectDoc.data();

      await newProjectRef.set({
        'id': newProjectId,
        'name': oldData['name'],
        'description': oldData['description'],
        'ownerId': currentUid,
        'workgroupId': workgroupId,
        'detachedFromWorkgroupId': workgroupId,
        'projectCode': newCode,
        'materialSortMode': oldData['materialSortMode'] ?? 'input',
        'archived': oldData['archived'] ?? false,
        'createdAt': now,
        'updatedAt': now,
      }).timeout(const Duration(seconds: 15));

      final creatorMemberId = '${newProjectId}_$currentUid';
      await FirebaseService.members.doc(creatorMemberId).set({
        'id': creatorMemberId,
        'projectId': newProjectId,
        'userId': currentUid,
        'email': creatingForSelf ? email : '',
        'role': WorkgroupRole.owner.value,
        'invitedBy': currentUid,
        'joinedAt': now,
      }).timeout(const Duration(seconds: 15));

      if (!creatingForSelf) {
        final targetMemberId = '${newProjectId}_$userId';
        await FirebaseService.members.doc(targetMemberId).set({
          'id': targetMemberId,
          'projectId': newProjectId,
          'userId': userId,
          'email': email,
          'role': WorkgroupRole.owner.value,
          'invitedBy': currentUid,
          'joinedAt': now,
        }).timeout(const Duration(seconds: 15));
      }

      await FirebaseService.projectJoinCodes.doc(newCode).set({
        'code': newCode,
        'projectId': newProjectId,
        'ownerId': currentUid,
        'createdBy': currentUid,
        'createdAt': now,
        'updatedAt': now,
        'isActive': true,
      }).timeout(const Duration(seconds: 15));

      await _cloneMaterials(
          oldProjectId: oldProjectId, newProjectId: newProjectId, now: now);
      await _cloneWorkLogs(
          oldProjectId: oldProjectId, newProjectId: newProjectId, now: now);
      await _cloneNotes(
          oldProjectId: oldProjectId, newProjectId: newProjectId, now: now);

      final updateData = <String, dynamic>{
        'workgroupId': null,
        'detachedFromWorkgroupId': null,
        'updatedAt': now,
      };
      if (!creatingForSelf) {
        updateData['ownerId'] = userId;
      }
      await newProjectRef
          .update(updateData)
          .timeout(const Duration(seconds: 15));

      if (!creatingForSelf) {
        await FirebaseService.members
            .doc(creatorMemberId)
            .delete()
            .timeout(const Duration(seconds: 15));
      } else {
        await FirebaseService.members.doc(creatorMemberId).update({
          'email': email,
        }).timeout(const Duration(seconds: 15));
      }

      for (final oldMemberDoc in oldMemberships.docs) {
        await oldMemberDoc.reference
            .delete()
            .timeout(const Duration(seconds: 15));
      }
    }
  }

  Future<void> _cloneMaterials({
    required String oldProjectId,
    required String newProjectId,
    required Timestamp now,
  }) async {
    final snapshot = await FirebaseService.materials
        .where('projectId', isEqualTo: oldProjectId)
        .get()
        .timeout(const Duration(seconds: 15));
    for (final doc in snapshot.docs) {
      final data = Map<String, dynamic>.from(doc.data());
      final newDoc = FirebaseService.materials.doc();
      data['id'] = newDoc.id;
      data['projectId'] = newProjectId;
      data['createdAt'] = now;
      data['updatedAt'] = now;
      await newDoc.set(data).timeout(const Duration(seconds: 15));
    }
  }

  Future<void> _cloneWorkLogs({
    required String oldProjectId,
    required String newProjectId,
    required Timestamp now,
  }) async {
    final snapshot = await FirebaseService.workLogs
        .where('projectId', isEqualTo: oldProjectId)
        .get()
        .timeout(const Duration(seconds: 15));
    for (final doc in snapshot.docs) {
      final data = Map<String, dynamic>.from(doc.data());
      final newDoc = FirebaseService.workLogs.doc();
      data['id'] = newDoc.id;
      data['projectId'] = newProjectId;
      data['createdAt'] = now;
      data['updatedAt'] = now;
      await newDoc.set(data).timeout(const Duration(seconds: 15));
    }
  }

  Future<void> _cloneNotes({
    required String oldProjectId,
    required String newProjectId,
    required Timestamp now,
  }) async {
    final snapshot = await FirebaseService.projectNotes
        .where('projectId', isEqualTo: oldProjectId)
        .get()
        .timeout(const Duration(seconds: 15));
    for (final doc in snapshot.docs) {
      final data = Map<String, dynamic>.from(doc.data());
      final newDoc = FirebaseService.projectNotes.doc();
      data['id'] = newDoc.id;
      data['projectId'] = newProjectId;
      data['createdAt'] = now;
      data['updatedAt'] = now;
      await newDoc.set(data).timeout(const Duration(seconds: 15));
    }
  }
}

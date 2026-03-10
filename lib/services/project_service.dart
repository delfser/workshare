import 'dart:async';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../models/enums.dart';
import '../models/project.dart';
import '../models/project_member.dart';
import 'firebase_service.dart';
import 'notification_service.dart';

enum JoinByCodeResult { joined, alreadyMember }

class ProjectService {
  static const _joinAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  final _random = Random.secure();
  final _notificationService = NotificationService();

  String _generateJoinCode([int length = 6]) {
    return List.generate(
            length, (_) => _joinAlphabet[_random.nextInt(_joinAlphabet.length)])
        .join();
  }

  Future<String> _allocateUniqueJoinCode() async {
    try {
      for (var i = 0; i < 20; i++) {
        final code = _generateJoinCode();
        final exists = await FirebaseService.projectJoinCodes
            .doc(code)
            .get()
            .timeout(const Duration(milliseconds: 1200));
        if (!exists.exists) return code;
      }
    } catch (_) {
      // Offline fallback: still allow local create; collision risk is very low.
      return _generateJoinCode();
    }
    throw StateError('Kein freier Projektcode verfügbar.');
  }

  Stream<List<ProjectMember>> streamUserMemberships(String uid) {
    return FirebaseService.members
        .where('userId', isEqualTo: uid)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ProjectMember.fromMap(doc.id, doc.data()))
            .toList());
  }

  Stream<ProjectMember?> streamMembershipForProject(
      {required String projectId, required String uid}) {
    final memberId = '${projectId}_$uid';
    return FirebaseService.members.doc(memberId).snapshots().map((doc) {
      if (!doc.exists || doc.data() == null) {
        return null;
      }
      return ProjectMember.fromMap(doc.id, doc.data()!);
    });
  }

  Stream<List<Project>> streamUserProjects(String uid) {
    return streamUserMemberships(uid).switchMap((memberships) {
      final ids = memberships.map((m) => m.projectId).toSet().toList();
      return streamProjectsByIds(ids);
    });
  }

  Stream<List<Project>> streamProjectsByIds(List<String> projectIds) {
    final ids = projectIds.toSet().toList();
    if (ids.isEmpty) {
      return Stream.value(const <Project>[]);
    }

    final streams = <Stream<List<Project>>>[];
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30);
      streams.add(
        FirebaseService.projects
            .where(FieldPath.documentId, whereIn: chunk)
            .snapshots()
            .handleError((_, __) {})
            .map((snapshot) {
          final projects = <Project>[];
          for (final doc in snapshot.docs) {
            try {
              projects.add(Project.fromMap(doc.id, doc.data()));
            } catch (_) {}
          }
          return projects;
        }),
      );
    }

    return CombineLatestStream.list(streams).map((chunks) {
      final all = chunks.expand((e) => e).toList();
      all.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      return all;
    });
  }

  Future<void> createProject({
    required String ownerId,
    required String ownerEmail,
    required String name,
    String? description,
  }) async {
    final doc = FirebaseService.projects.doc();
    final code = await _allocateUniqueJoinCode();
    String? workgroupId;
    List<QueryDocumentSnapshot<Map<String, dynamic>>> workgroupMembers =
        const [];
    try {
      final ownerWorkgroupMembership = await FirebaseService.workgroupMembers
          .where('userId', isEqualTo: ownerId)
          .limit(1)
          .get()
          .timeout(const Duration(milliseconds: 1200));
      workgroupId = ownerWorkgroupMembership.docs.isNotEmpty
          ? ownerWorkgroupMembership.docs.first.data()['workgroupId'] as String?
          : null;
      if (workgroupId != null) {
        workgroupMembers = (await FirebaseService.workgroupMembers
                .where('workgroupId', isEqualTo: workgroupId)
                .get()
                .timeout(const Duration(milliseconds: 1200)))
            .docs;
      }
    } catch (_) {
      workgroupId = null;
      workgroupMembers = const [];
    }
    final now = FirebaseService.now();
    final batch = FirebaseService.db.batch();

    batch.set(doc, {
      'id': doc.id,
      'name': name.trim(),
      'description':
          description?.trim().isEmpty == true ? null : description?.trim(),
      'ownerId': ownerId,
      'workgroupId': workgroupId,
      'projectCode': code,
      'materialSortMode': 'input',
      'archived': false,
      'createdAt': now,
      'updatedAt': now,
    });

    final memberId = '${doc.id}_$ownerId';
    batch.set(FirebaseService.members.doc(memberId), {
      'id': memberId,
      'projectId': doc.id,
      'userId': ownerId,
      'email': ownerEmail.toLowerCase(),
      'role': ProjectRole.owner.value,
      'invitedBy': ownerId,
      'joinedAt': now,
    });

    for (final wgMember in workgroupMembers) {
      final data = wgMember.data();
      final userId = (data['userId'] as String?) ?? '';
      final email = ((data['email'] as String?) ?? '').toLowerCase();
      if (userId.isEmpty || userId == ownerId || email.isEmpty) continue;
      final projectMemberId = '${doc.id}_$userId';
      batch.set(
          FirebaseService.members.doc(projectMemberId),
          {
            'id': projectMemberId,
            'projectId': doc.id,
            'userId': userId,
            'email': email,
            'role': ProjectRole.owner.value,
            'invitedBy': ownerId,
            'joinedAt': now,
            'sourceWorkgroupId': workgroupId,
          },
          SetOptions(merge: true));
    }

    batch.set(FirebaseService.projectJoinCodes.doc(code), {
      'code': code,
      'projectId': doc.id,
      'ownerId': ownerId,
      'createdBy': ownerId,
      'createdAt': now,
      'updatedAt': now,
      'isActive': true,
    });

    await batch.commit();
  }

  Future<String> ensureProjectJoinCode({
    required String projectId,
    required String ownerId,
  }) async {
    final projectDoc = await FirebaseService.projects
        .doc(projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    if (!projectDoc.exists || projectDoc.data() == null) {
      throw StateError('Projekt nicht gefunden.');
    }
    final data = projectDoc.data()!;
    final existingCode = data['projectCode'] as String?;
    if (existingCode != null && existingCode.trim().isNotEmpty) {
      return existingCode.trim().toUpperCase();
    }

    final code = await _allocateUniqueJoinCode();
    final now = FirebaseService.now();
    final batch = FirebaseService.db.batch();
    batch.update(FirebaseService.projects.doc(projectId), {
      'projectCode': code,
      'updatedAt': now,
    });
    batch.set(FirebaseService.projectJoinCodes.doc(code), {
      'code': code,
      'projectId': projectId,
      'ownerId': ownerId,
      'createdBy': FirebaseService.currentUid,
      'createdAt': now,
      'updatedAt': now,
      'isActive': true,
    });
    await batch.commit().timeout(const Duration(seconds: 15));
    return code;
  }

  Future<JoinByCodeResult> joinProjectByCode({
    required String code,
    required String userId,
    required String email,
  }) async {
    final normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.isEmpty) {
      throw StateError('Bitte Projektcode eingeben.');
    }

    final codeDoc = await FirebaseService.projectJoinCodes
        .doc(normalizedCode)
        .get()
        .timeout(const Duration(seconds: 15));
    if (!codeDoc.exists || codeDoc.data() == null) {
      throw StateError('Projektcode ungültig.');
    }
    final data = codeDoc.data()!;
    final active = data['isActive'] as bool? ?? true;
    if (!active) {
      throw StateError('Projektcode ist nicht aktiv.');
    }
    final projectId = data['projectId'] as String? ?? '';
    if (projectId.isEmpty) {
      throw StateError('Projektcode ist fehlerhaft.');
    }

    final memberId = '${projectId}_$userId';
    final memberRef = FirebaseService.members.doc(memberId);
    final memberDoc =
        await memberRef.get().timeout(const Duration(seconds: 15));
    if (memberDoc.exists) {
      return JoinByCodeResult.alreadyMember;
    }

    await memberRef.set({
      'id': memberId,
      'projectId': projectId,
      'userId': userId,
      'email': email.toLowerCase(),
      'role': ProjectRole.worker.value,
      'invitedBy': null,
      'joinCode': normalizedCode,
      'joinedAt': FirebaseService.now(),
    }).timeout(const Duration(seconds: 15));

    final ownerId = (data['ownerId'] as String?) ?? '';
    if (ownerId.isNotEmpty && ownerId != userId) {
      await _notificationService.createNotification(
        userId: ownerId,
        title: 'Neuer Projektbeitritt',
        message: '${email.toLowerCase()} ist per Projektcode beigetreten.',
        type: 'project_joined',
        projectId: projectId,
      );
    }

    return JoinByCodeResult.joined;
  }

  Future<void> updateProject({
    required String projectId,
    required String name,
    String? description,
  }) async {
    await FirebaseService.projects.doc(projectId).update({
      'name': name.trim(),
      'description':
          description?.trim().isEmpty == true ? null : description?.trim(),
      'updatedAt': FirebaseService.now(),
    });
  }

  Future<void> setProjectArchived({
    required String projectId,
    required bool archived,
  }) {
    return FirebaseService.projects.doc(projectId).update({
      'archived': archived,
      'updatedAt': FirebaseService.now(),
    });
  }

  Future<void> setMaterialSortMode({
    required String projectId,
    required String sortMode,
  }) {
    return FirebaseService.projects.doc(projectId).update({
      'materialSortMode': sortMode,
      'updatedAt': FirebaseService.now(),
    });
  }

  Future<void> deleteProject(String projectId) async {
    final members = await FirebaseService.members
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final materials = await FirebaseService.materials
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final invitations = await FirebaseService.invitations
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final joinCodes = await FirebaseService.projectJoinCodes
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final notes = await FirebaseService.projectNotes
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final workLogs = await FirebaseService.workLogs
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final photos = await FirebaseService.projectPhotos
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));

    // Delete storage files first (best effort). Firestore docs are the source of truth.
    for (final doc in photos.docs) {
      final storagePath = (doc.data()['storagePath'] as String?) ?? '';
      if (storagePath.trim().isEmpty) continue;
      try {
        await FirebaseService.storage.ref().child(storagePath).delete().timeout(
              const Duration(seconds: 15),
            );
      } catch (_) {
        // If file is already missing or cannot be removed now, continue with doc cleanup.
      }
    }

    final refs = <DocumentReference<Map<String, dynamic>>>[
      FirebaseService.projects.doc(projectId),
      ...members.docs.map((d) => d.reference),
      ...materials.docs.map((d) => d.reference),
      ...invitations.docs.map((d) => d.reference),
      ...joinCodes.docs.map((d) => d.reference),
      ...notes.docs.map((d) => d.reference),
      ...workLogs.docs.map((d) => d.reference),
      ...photos.docs.map((d) => d.reference),
    ];

    await _deleteRefsInChunks(refs);
  }

  Future<void> _deleteRefsInChunks(
    List<DocumentReference<Map<String, dynamic>>> refs,
  ) async {
    if (refs.isEmpty) return;
    const chunkSize = 450; // Keep safe distance to Firestore batch limit (500).
    for (var i = 0; i < refs.length; i += chunkSize) {
      final end = (i + chunkSize > refs.length) ? refs.length : i + chunkSize;
      final batch = FirebaseService.db.batch();
      for (final ref in refs.sublist(i, end)) {
        batch.delete(ref);
      }
      await batch.commit().timeout(const Duration(seconds: 20));
    }
  }

  Stream<List<ProjectMember>> streamMembers(String projectId) {
    return FirebaseService.members
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ProjectMember.fromMap(doc.id, doc.data()))
            .toList()
          ..sort((a, b) => a.email.compareTo(b.email)));
  }

  Future<void> updateMemberRole({
    required String projectId,
    required String userId,
    required ProjectRole role,
  }) {
    final memberId = '${projectId}_$userId';
    return FirebaseService.members.doc(memberId).update({'role': role.value});
  }

  Future<void> removeMember(
      {required String projectId, required String userId}) async {
    final actorUid = FirebaseService.auth.currentUser?.uid;
    final actorEmail =
        (FirebaseService.auth.currentUser?.email ?? '').trim().toLowerCase();
    final projectDoc = await FirebaseService.projects
        .doc(projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final projectData = projectDoc.data();
    final ownerId = (projectData?['ownerId'] as String?) ?? '';

    if (actorUid == userId) {
      if (ownerId.isNotEmpty && ownerId != actorUid) {
        await _notificationService.createNotification(
          userId: ownerId,
          title: 'Mitglied hat Projekt verlassen',
          message:
              '${actorEmail.isEmpty ? 'Ein Mitglied' : actorEmail} hat das Projekt verlassen.',
          type: 'project_left',
          projectId: projectId,
        );
      }
    } else {
      await _notificationService.createNotification(
        userId: userId,
        title: 'Aus Projekt entfernt',
        message: 'Du wurdest aus einem Projekt entfernt.',
        type: 'project_removed',
        projectId: projectId,
      );
    }

    final memberId = '${projectId}_$userId';
    await FirebaseService.members.doc(memberId).delete();
  }

  Future<void> promoteSelfToOwnerForWorkgroupProjects({
    required String userId,
  }) async {
    final memberships = await FirebaseService.members
        .where('userId', isEqualTo: userId)
        .get()
        .timeout(const Duration(seconds: 15));

    for (final memberDoc in memberships.docs) {
      final data = memberDoc.data();
      final role = (data['role'] as String? ?? '').toLowerCase();
      if (role == ProjectRole.owner.value) continue;
      final projectId = data['projectId'] as String? ?? '';
      if (projectId.isEmpty) continue;

      final project = await FirebaseService.projects
          .doc(projectId)
          .get()
          .timeout(const Duration(seconds: 15));
      final projectData = project.data();
      final workgroupId = projectData?['workgroupId'] as String?;
      if (workgroupId == null || workgroupId.isEmpty) continue;

      final wgMemberId = '${workgroupId}_$userId';
      final wgMembership =
          await FirebaseService.workgroupMembers.doc(wgMemberId).get().timeout(
                const Duration(seconds: 15),
              );
      if (!wgMembership.exists) continue;

      await memberDoc.reference
          .update({'role': ProjectRole.owner.value}).timeout(
              const Duration(seconds: 15));
    }
  }
}

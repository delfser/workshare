import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../data/sample_catalog_entries.dart';
import '../models/catalog_entry.dart';
import 'firebase_service.dart';

class SampleCatalogImportResult {
  const SampleCatalogImportResult({
    required this.inserted,
    required this.skipped,
  });

  final int inserted;
  final int skipped;
}

class SampleCatalogUnloadResult {
  const SampleCatalogUnloadResult({
    required this.removed,
  });

  final int removed;
}

class CatalogService {
  bool _isPermissionDenied(Object error) {
    return error is FirebaseException && error.code == 'permission-denied';
  }

  Stream<List<CatalogEntry>> streamCatalogForUser(String userId) {
    final personalStream = FirebaseService.catalog
        .where('isActive', isEqualTo: true)
        .where('createdBy', isEqualTo: userId)
        .where('workgroupId', isEqualTo: null)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => CatalogEntry.fromMap(doc.id, doc.data())).toList());

    final workgroupIdsStream = FirebaseService.workgroupMembers
        .where('userId', isEqualTo: userId)
        .snapshots()
        .map(
          (s) => s.docs
              .map((d) => (d.data()['workgroupId'] as String?) ?? '')
              .where((id) => id.isNotEmpty)
              .toSet()
              .toList(),
        );

    return CombineLatestStream.combine2<List<CatalogEntry>, List<String>, ({List<CatalogEntry> personal, List<String> workgroupIds})>(
      personalStream,
      workgroupIdsStream,
      (personal, workgroupIds) => (personal: personal, workgroupIds: workgroupIds),
    ).switchMap((data) {
      if (data.workgroupIds.isEmpty) {
        final sorted = [...data.personal]..sort((a, b) => a.nameLower.compareTo(b.nameLower));
        return Stream.value(sorted);
      }

      final streams = <Stream<List<CatalogEntry>>>[];
      for (var i = 0; i < data.workgroupIds.length; i += 10) {
        final chunk = data.workgroupIds.sublist(
          i,
          i + 10 > data.workgroupIds.length ? data.workgroupIds.length : i + 10,
        );
        streams.add(
          FirebaseService.catalog
              .where('isActive', isEqualTo: true)
              .where('workgroupId', whereIn: chunk)
              .snapshots()
              .map((snapshot) =>
                  snapshot.docs.map((doc) => CatalogEntry.fromMap(doc.id, doc.data())).toList()),
        );
      }

      return CombineLatestStream.list(streams).map((chunks) {
        final merged = <String, CatalogEntry>{};
        for (final entry in data.personal) {
          merged[entry.id] = entry;
        }
        for (final list in chunks) {
          for (final entry in list) {
            merged[entry.id] = entry;
          }
        }
        final all = merged.values.toList()..sort((a, b) => a.nameLower.compareTo(b.nameLower));
        return all;
      });
    });
  }

  Future<List<CatalogEntry>> searchByPrefixForProject({
    required String prefix,
    required String userId,
    String? projectWorkgroupId,
  }) async {
    final normalized = prefix.trim().toLowerCase();
    if (normalized.isEmpty) {
      return <CatalogEntry>[];
    }

    final personalSnapshot = await FirebaseService.catalog
        .where('isActive', isEqualTo: true)
        .where('createdBy', isEqualTo: userId)
        .where('workgroupId', isEqualTo: null)
        .limit(100)
        .get()
        .timeout(const Duration(seconds: 12));

    final merged = <String, CatalogEntry>{
      for (final doc in personalSnapshot.docs) doc.id: CatalogEntry.fromMap(doc.id, doc.data()),
    };

    if (projectWorkgroupId != null && projectWorkgroupId.isNotEmpty) {
      try {
        final workgroupSnapshot = await FirebaseService.catalog
            .where('isActive', isEqualTo: true)
            .where('workgroupId', isEqualTo: projectWorkgroupId)
            .limit(150)
            .get()
            .timeout(const Duration(seconds: 12));
        for (final doc in workgroupSnapshot.docs) {
          merged[doc.id] = CatalogEntry.fromMap(doc.id, doc.data());
        }
      } catch (e) {
        if (!_isPermissionDenied(e)) rethrow;
      }
    }

    final filtered = merged.values.where((e) {
      final key = (e.nameLower.isNotEmpty ? e.nameLower : e.name.trim().toLowerCase());
      return key.startsWith(normalized);
    }).toList()
      ..sort((a, b) {
        final aKey = (a.nameLower.isNotEmpty ? a.nameLower : a.name.trim().toLowerCase());
        final bKey = (b.nameLower.isNotEmpty ? b.nameLower : b.name.trim().toLowerCase());
        return aKey.compareTo(bKey);
      });

    return filtered.take(10).toList();
  }

  Future<String?> getDefaultWorkgroupIdForUser(String userId) async {
    final membership = await FirebaseService.workgroupMembers
        .where('userId', isEqualTo: userId)
        .limit(1)
        .get()
        .timeout(const Duration(seconds: 12));
    if (membership.docs.isEmpty) return null;
    return membership.docs.first.data()['workgroupId'] as String?;
  }

  Future<void> createEntry({
    required String name,
    required String unit,
    String? category,
    required String createdBy,
    String? workgroupId,
  }) async {
    final doc = FirebaseService.catalog.doc();
    final now = FirebaseService.now();
    await doc.set({
      'id': doc.id,
      'name': name.trim(),
      'nameLower': name.trim().toLowerCase(),
      'unit': unit.trim(),
      'category': category?.trim().isEmpty == true ? null : category?.trim(),
      'createdBy': createdBy,
      'workgroupId': (workgroupId == null || workgroupId.trim().isEmpty) ? null : workgroupId.trim(),
      'isActive': true,
      'source': 'user',
      'createdAt': now,
      'updatedAt': now,
    });
  }

  Future<void> updateEntry({
    required String entryId,
    required String name,
    required String unit,
    String? category,
    required bool isActive,
  }) {
    return FirebaseService.catalog.doc(entryId).update({
      'name': name.trim(),
      'nameLower': name.trim().toLowerCase(),
      'unit': unit.trim(),
      'category': category?.trim().isEmpty == true ? null : category?.trim(),
      'isActive': isActive,
      'updatedAt': FirebaseService.now(),
    });
  }

  Future<void> deleteEntry(String entryId) {
    return FirebaseService.catalog.doc(entryId).delete();
  }

  Future<SampleCatalogImportResult> importFixedSampleCatalog({
    required String userId,
  }) async {
    final existingSnapshot = await FirebaseService.catalog
        .where('createdBy', isEqualTo: userId)
        .where('workgroupId', isEqualTo: null)
        .get()
        .timeout(const Duration(seconds: 15));

    final existingKeys = <String>{
      for (final doc in existingSnapshot.docs)
        '${((doc.data()['nameLower'] as String?) ?? '').trim()}|${((doc.data()['unit'] as String?) ?? '').trim().toLowerCase()}',
    };

    var inserted = 0;
    var skipped = 0;
    final now = FirebaseService.now();
    WriteBatch batch = FirebaseService.db.batch();
    var pendingInBatch = 0;

    for (final entry in sampleCatalogEntries) {
      final name = entry.name.trim();
      final nameLower = name.toLowerCase();
      final unit = entry.unit.trim().toLowerCase();
      final key = '$nameLower|$unit';

      if (name.isEmpty || unit.isEmpty || existingKeys.contains(key)) {
        skipped++;
        continue;
      }

      final doc = FirebaseService.catalog.doc();
      batch.set(doc, {
        'id': doc.id,
        'name': name,
        'nameLower': nameLower,
        'unit': unit,
        'category': entry.category?.trim().isEmpty == true ? null : entry.category?.trim(),
        'createdBy': userId,
        'workgroupId': null,
        'isActive': true,
        'source': 'sample',
        'createdAt': now,
        'updatedAt': now,
      });
      existingKeys.add(key);
      inserted++;
      pendingInBatch++;

      if (pendingInBatch >= 450) {
        await batch.commit().timeout(const Duration(seconds: 15));
        batch = FirebaseService.db.batch();
        pendingInBatch = 0;
      }
    }

    if (pendingInBatch > 0) {
      await batch.commit().timeout(const Duration(seconds: 15));
    }

    return SampleCatalogImportResult(inserted: inserted, skipped: skipped);
  }

  Future<SampleCatalogUnloadResult> unloadFixedSampleCatalog({
    required String userId,
  }) async {
    final snapshot = await FirebaseService.catalog
        .where('createdBy', isEqualTo: userId)
        .where('workgroupId', isEqualTo: null)
        .where('source', isEqualTo: 'sample')
        .get()
        .timeout(const Duration(seconds: 15));

    if (snapshot.docs.isEmpty) {
      return const SampleCatalogUnloadResult(removed: 0);
    }

    WriteBatch batch = FirebaseService.db.batch();
    var pending = 0;
    var removed = 0;

    for (final doc in snapshot.docs) {
      batch.delete(doc.reference);
      pending++;
      removed++;
      if (pending >= 450) {
        await batch.commit().timeout(const Duration(seconds: 15));
        batch = FirebaseService.db.batch();
        pending = 0;
      }
    }

    if (pending > 0) {
      await batch.commit().timeout(const Duration(seconds: 15));
    }

    return SampleCatalogUnloadResult(removed: removed);
  }
}

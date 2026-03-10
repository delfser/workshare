import 'dart:async';

import '../models/material_item.dart';
import 'firebase_service.dart';

class MaterialService {
  bool _isSameMaterial({
    required Map<String, dynamic> existingData,
    required String normalizedNameLower,
    String? catalogEntryId,
  }) {
    final existingNameLower =
        ((existingData['name'] as String?) ?? '').trim().toLowerCase();
    final existingCatalogId = existingData['catalogEntryId'] as String?;

    final sameCatalog =
        catalogEntryId != null && existingCatalogId == catalogEntryId;
    final sameName = existingNameLower == normalizedNameLower;

    return sameCatalog || sameName;
  }

  List<MaterialItem> _sortItems(List<MaterialItem> items, String sortMode) {
    if (sortMode == 'alpha') {
      items
          .sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    } else {
      items.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    }
    return items;
  }

  Stream<List<MaterialItem>> streamMaterials(
    String projectId, {
    String sortMode = 'input',
  }) {
    return FirebaseService.materials
        .where('projectId', isEqualTo: projectId)
        .snapshots()
        .map((snapshot) => _sortItems(
              snapshot.docs
                  .map((doc) => MaterialItem.fromMap(doc.id, doc.data()))
                  .toList(),
              sortMode,
            ));
  }

  Future<List<MaterialItem>> fetchMaterials(
    String projectId, {
    String sortMode = 'input',
  }) async {
    final snapshot = await FirebaseService.materials
        .where('projectId', isEqualTo: projectId)
        .get()
        .timeout(const Duration(seconds: 15));
    final items = snapshot.docs
        .map((doc) => MaterialItem.fromMap(doc.id, doc.data()))
        .toList();
    return _sortItems(items, sortMode);
  }

  Future<bool> addMaterial({
    required String projectId,
    required String name,
    required double quantity,
    required String unit,
    String? catalogEntryId,
    required String createdBy,
  }) async {
    final normalizedName = name.trim();
    final normalizedNameLower = normalizedName.toLowerCase();
    final normalizedUnit = unit.trim();
    final now = FirebaseService.now();

    try {
      final existingSnapshot = await FirebaseService.materials
          .where('projectId', isEqualTo: projectId)
          .get()
          .timeout(const Duration(milliseconds: 1200));

      for (final existingDoc in existingSnapshot.docs) {
        final data = existingDoc.data();
        if (!_isSameMaterial(
          existingData: data,
          normalizedNameLower: normalizedNameLower,
          catalogEntryId: catalogEntryId,
        )) {
          continue;
        }

        final oldQuantity = (data['quantity'] as num?)?.toDouble() ?? 0;
        final mergedQuantity = oldQuantity + quantity;
        final existingCatalogId = data['catalogEntryId'] as String?;

        await existingDoc.reference.update({
          'name': normalizedName,
          'nameLower': normalizedNameLower,
          'quantity': mergedQuantity,
          'catalogEntryId': existingCatalogId ?? catalogEntryId,
          'updatedAt': now,
        }).timeout(const Duration(milliseconds: 1200));

        return true;
      }
    } catch (_) {
      // Offline fallback: create a new queued write without merge pre-check.
    }

    final doc = FirebaseService.materials.doc();
    await doc.set({
      'id': doc.id,
      'projectId': projectId,
      'name': normalizedName,
      'nameLower': normalizedNameLower,
      'quantity': quantity,
      'unit': normalizedUnit,
      'catalogEntryId': catalogEntryId,
      'createdBy': createdBy,
      'createdAt': now,
      'updatedAt': now,
    });
    return false;
  }

  Future<bool> willMergeOnAdd({
    required String projectId,
    required String name,
    required String unit,
    String? catalogEntryId,
  }) async {
    final normalizedNameLower = name.trim().toLowerCase();
    if (normalizedNameLower.isEmpty) {
      return false;
    }

    try {
      final existingSnapshot = await FirebaseService.materials
          .where('projectId', isEqualTo: projectId)
          .get()
          .timeout(const Duration(seconds: 12));

      for (final existingDoc in existingSnapshot.docs) {
        if (_isSameMaterial(
          existingData: existingDoc.data(),
          normalizedNameLower: normalizedNameLower,
          catalogEntryId: catalogEntryId,
        )) {
          return true;
        }
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  Future<void> updateMaterial({
    required String materialId,
    required String name,
    required double quantity,
    required String unit,
    String? catalogEntryId,
  }) {
    return FirebaseService.materials.doc(materialId).update({
      'name': name.trim(),
      'nameLower': name.trim().toLowerCase(),
      'quantity': quantity,
      'unit': unit.trim(),
      'catalogEntryId': catalogEntryId,
      'updatedAt': FirebaseService.now(),
    });
  }

  Future<void> deleteMaterial(String materialId) {
    return FirebaseService.materials.doc(materialId).delete();
  }
}

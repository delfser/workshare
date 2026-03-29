import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import { sampleCatalogEntries } from "@/lib/sample-catalog-entries";
import type { CatalogEntry } from "@/lib/types";

const CATALOG_COLLECTION = "catalog_entries";

function normalize(value: string) {
  return value.trim();
}

function now() {
  return Timestamp.now();
}

function sampleCatalogKeys() {
  return new Set(
    sampleCatalogEntries.map((entry) => {
      const nameLower = entry.name.trim().toLowerCase();
      const unitLower = entry.unit.trim().toLowerCase();
      return `${nameLower}|${unitLower}`;
    }),
  );
}

export async function createCatalogEntry(input: {
  name: string;
  unit: string;
  category?: string;
  createdBy: string;
  workgroupId?: string | null;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const name = normalize(input.name);
  const unit = normalize(input.unit).toLowerCase();
  const category = normalize(input.category ?? "");
  const workgroupId = normalize(input.workgroupId ?? "");
  const entryRef = doc(collection(db, CATALOG_COLLECTION));
  const timestamp = now();

  await setDoc(entryRef, {
    id: entryRef.id,
    name,
    nameLower: name.toLowerCase(),
    unit,
    category: category.length > 0 ? category : null,
    createdBy: input.createdBy,
    workgroupId: workgroupId.length > 0 ? workgroupId : null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function updateCatalogEntry(input: {
  entryId: string;
  name: string;
  unit: string;
  category?: string;
  isActive: boolean;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const name = normalize(input.name);
  const unit = normalize(input.unit).toLowerCase();
  const category = normalize(input.category ?? "");

  await updateDoc(doc(collection(db, CATALOG_COLLECTION), input.entryId), {
    name,
    nameLower: name.toLowerCase(),
    unit,
    category: category.length > 0 ? category : null,
    isActive: input.isActive,
    updatedAt: now(),
  });
}

export async function deleteCatalogEntry(entryId: string) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await deleteDoc(doc(collection(db, CATALOG_COLLECTION), entryId));
}

export async function searchCatalogEntriesByPrefix(input: {
  userId: string;
  prefix: string;
  workgroupId?: string | null;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const prefix = normalize(input.prefix).toLowerCase();
  if (!prefix) {
    return [] as CatalogEntry[];
  }

  const catalogRef = collection(db, CATALOG_COLLECTION);
  const personalSnapshot = await getDocs(
    query(
      catalogRef,
      where("isActive", "==", true),
      where("createdBy", "==", input.userId),
      where("workgroupId", "==", null),
      limit(120),
    ),
  );

  const entries = new Map<string, CatalogEntry>();
  personalSnapshot.docs.forEach((entryDoc) => {
    const data = entryDoc.data() as Record<string, unknown>;
    const name = String(data.name ?? "");
    entries.set(entryDoc.id, {
      id: entryDoc.id,
      name,
      nameLower: String(data.nameLower ?? name.toLowerCase()),
      unit: String(data.unit ?? ""),
      category: typeof data.category === "string" ? data.category : null,
      createdBy: String(data.createdBy ?? ""),
      workgroupId: typeof data.workgroupId === "string" ? data.workgroupId : null,
      isActive: Boolean(data.isActive ?? true),
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    });
  });

  const workgroupId = normalize(input.workgroupId ?? "");
  if (workgroupId) {
    const workgroupSnapshot = await getDocs(
      query(
        catalogRef,
        where("isActive", "==", true),
        where("workgroupId", "==", workgroupId),
        limit(200),
      ),
    );

    workgroupSnapshot.docs.forEach((entryDoc) => {
      const data = entryDoc.data() as Record<string, unknown>;
      const name = String(data.name ?? "");
      entries.set(entryDoc.id, {
        id: entryDoc.id,
        name,
        nameLower: String(data.nameLower ?? name.toLowerCase()),
        unit: String(data.unit ?? ""),
        category: typeof data.category === "string" ? data.category : null,
        createdBy: String(data.createdBy ?? ""),
        workgroupId: typeof data.workgroupId === "string" ? data.workgroupId : null,
        isActive: Boolean(data.isActive ?? true),
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
      });
    });
  }

  return [...entries.values()]
    .filter((entry) => {
      const key = entry.nameLower || entry.name.toLowerCase();
      return key.startsWith(prefix);
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
    )
    .slice(0, 10);
}

export async function importFixedSampleCatalog(input: { userId: string }) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const existingSnapshot = await getDocs(
    query(
      collection(db, CATALOG_COLLECTION),
      where("createdBy", "==", input.userId),
      where("workgroupId", "==", null),
    ),
  );

  const existingKeys = new Set(
    existingSnapshot.docs.map((entryDoc) => {
      const data = entryDoc.data() as Record<string, unknown>;
      const nameLower = String(data.nameLower ?? "").trim();
      const unitLower = String(data.unit ?? "").trim().toLowerCase();
      return `${nameLower}|${unitLower}`;
    }),
  );

  const timestamp = now();
  let inserted = 0;
  let skipped = 0;
  let pending = 0;
  let batch = writeBatch(db);

  for (const entry of sampleCatalogEntries) {
    const name = normalize(entry.name);
    const unit = normalize(entry.unit).toLowerCase();
    const key = `${name.toLowerCase()}|${unit}`;
    if (!name || !unit || existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    const entryRef = doc(collection(db, CATALOG_COLLECTION));
    batch.set(entryRef, {
      id: entryRef.id,
      name,
      nameLower: name.toLowerCase(),
      unit,
      category: entry.category?.trim().length ? entry.category.trim() : null,
      createdBy: input.userId,
      workgroupId: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    existingKeys.add(key);
    inserted += 1;
    pending += 1;

    if (pending >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return { inserted, skipped };
}

export async function unloadFixedSampleCatalog(input: { userId: string }) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const keys = sampleCatalogKeys();
  const snapshot = await getDocs(
    query(
      collection(db, CATALOG_COLLECTION),
      where("createdBy", "==", input.userId),
      where("workgroupId", "==", null),
    ),
  );

  const docsToDelete = snapshot.docs.filter((entryDoc) => {
    const data = entryDoc.data() as Record<string, unknown>;
    const nameLower = String(data.nameLower ?? "").trim().toLowerCase();
    const unitLower = String(data.unit ?? "").trim().toLowerCase();
    return keys.has(`${nameLower}|${unitLower}`);
  });

  if (docsToDelete.length === 0) {
    return { removed: 0 };
  }

  let removed = 0;
  let pending = 0;
  let batch = writeBatch(db);

  for (const entryDoc of docsToDelete) {
    batch.delete(entryDoc.ref);
    removed += 1;
    pending += 1;

    if (pending >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return { removed };
}

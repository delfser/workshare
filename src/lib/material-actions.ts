import {
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { MaterialItem } from "@/lib/types";

function normalizeName(value: string) {
  return value.trim();
}

function normalizeNameLower(value: string) {
  return normalizeName(value).toLowerCase();
}

function normalizeUnit(value: string) {
  return value.trim();
}

function toTimestamp() {
  return Timestamp.now();
}

export async function addMaterial(input: {
  projectId: string;
  name: string;
  quantity: number;
  unit: string;
  createdBy: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const name = normalizeName(input.name);
  const nameLower = normalizeNameLower(input.name);
  const unit = normalizeUnit(input.unit);

  const existingSnapshot = await getDocs(
    query(collection(db, "materials"), where("projectId", "==", input.projectId)),
  );

  const existingMatch = existingSnapshot.docs.find((materialDoc) => {
    const data = materialDoc.data() as Record<string, unknown>;
    return String(data.nameLower ?? "").trim().toLowerCase() === nameLower;
  });

  const now = toTimestamp();

  if (existingMatch) {
    const data = existingMatch.data() as Record<string, unknown>;
    const oldQuantity = Number(data.quantity ?? 0);

    await updateDoc(existingMatch.ref, {
      name,
      nameLower,
      quantity: oldQuantity + input.quantity,
      unit,
      updatedAt: now,
    });

    return { merged: true };
  }

  const materialRef = doc(collection(db, "materials"));

  await setDoc(materialRef, {
    id: materialRef.id,
    projectId: input.projectId,
    name,
    nameLower,
    quantity: input.quantity,
    unit,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  return { merged: false };
}

export async function updateMaterial(input: {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await updateDoc(doc(collection(db, "materials"), input.materialId), {
    name: normalizeName(input.name),
    nameLower: normalizeNameLower(input.name),
    quantity: input.quantity,
    unit: normalizeUnit(input.unit),
    updatedAt: toTimestamp(),
  });
}

export async function deleteMaterial(materialId: MaterialItem["id"]) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await deleteDoc(doc(collection(db, "materials"), materialId));
}

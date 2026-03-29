import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { CatalogEntry } from "@/lib/types";

const CATALOG_COLLECTION = "catalog_entries";

function toDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function parseCatalogEntry(
  entryDoc: QueryDocumentSnapshot | { id: string; data(): DocumentData | undefined },
) {
  const data = (entryDoc.data() ?? {}) as Record<string, unknown>;

  return {
    id: entryDoc.id,
    name: String(data.name ?? ""),
    nameLower: String(data.nameLower ?? String(data.name ?? "").toLowerCase()),
    unit: String(data.unit ?? ""),
    category: typeof data.category === "string" ? data.category : null,
    createdBy: String(data.createdBy ?? ""),
    workgroupId: typeof data.workgroupId === "string" ? data.workgroupId : null,
    isActive: Boolean(data.isActive ?? true),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } satisfies CatalogEntry;
}

export function subscribeToCatalogEntries(
  userId: string,
  workgroupIds: string[],
  onData: (entries: CatalogEntry[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  const catalogRef = collection(db, CATALOG_COLLECTION);
  let personalEntries: CatalogEntry[] = [];
  const workgroupEntries = new Map<string, CatalogEntry[]>();
  const unsubs: Array<() => void> = [];

  const publish = () => {
    const merged = new Map<string, CatalogEntry>();
    personalEntries.forEach((entry) => {
      merged.set(entry.id, entry);
    });
    workgroupEntries.forEach((entries) => {
      entries.forEach((entry) => {
        merged.set(entry.id, entry);
      });
    });

    const all = [...merged.values()].sort((left, right) => {
      const leftName = left.nameLower || left.name.toLowerCase();
      const rightName = right.nameLower || right.name.toLowerCase();
      return leftName.localeCompare(rightName, "de", { sensitivity: "base" });
    });

    onData(all);
  };

  unsubs.push(
    onSnapshot(
      query(
        catalogRef,
        where("isActive", "==", true),
        where("createdBy", "==", userId),
        where("workgroupId", "==", null),
      ),
      (snapshot) => {
        personalEntries = snapshot.docs.map((entryDoc) => parseCatalogEntry(entryDoc));
        publish();
      },
      onError,
    ),
  );

  const uniqueWorkgroupIds = [...new Set(workgroupIds.filter((value) => value.length > 0))];
  for (let index = 0; index < uniqueWorkgroupIds.length; index += 10) {
    const chunk = uniqueWorkgroupIds.slice(index, index + 10);

    unsubs.push(
      onSnapshot(
        query(
          catalogRef,
          where("isActive", "==", true),
          where("workgroupId", "in", chunk),
        ),
        (snapshot) => {
          const key = chunk.join("|");
          workgroupEntries.set(
            key,
            snapshot.docs.map((entryDoc) => parseCatalogEntry(entryDoc)),
          );
          publish();
        },
        (error) => {
          if (error.code === "permission-denied") {
            const key = chunk.join("|");
            workgroupEntries.delete(key);
            publish();
            return;
          }
          onError(error);
        },
      ),
    );
  }

  if (uniqueWorkgroupIds.length === 0) {
    publish();
  }

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}

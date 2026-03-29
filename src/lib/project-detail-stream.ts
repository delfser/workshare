import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type {
  MaterialItem,
  MaterialSortMode,
  ProjectMember,
  ProjectNote,
  ProjectPhoto,
  ProjectPhotoUploadStatus,
  ProjectRecord,
  ProjectRole,
  WorkLog,
} from "@/lib/types";

function toDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function parseProjectRole(value: unknown): ProjectRole {
  const role = String(value ?? "viewer").toLowerCase();

  if (role === "owner" || role === "admin" || role === "worker") {
    return role;
  }

  return "viewer";
}

function parseSortMode(value: unknown): MaterialSortMode {
  return value === "alphabetical" ? "alphabetical" : "input";
}

function parseProjectRecord(
  projectDoc:
    | QueryDocumentSnapshot
    | DocumentSnapshot
    | { id: string; data(): DocumentData | undefined },
): ProjectRecord {
  const data = (projectDoc.data() ?? {}) as Record<string, unknown>;

  return {
    id: projectDoc.id,
    name: String(data.name ?? ""),
    description:
      typeof data.description === "string" ? data.description : null,
    ownerId: String(data.ownerId ?? ""),
    workgroupId:
      typeof data.workgroupId === "string" ? data.workgroupId : null,
    projectCode:
      typeof data.projectCode === "string" ? data.projectCode : null,
    materialSortMode: parseSortMode(data.materialSortMode),
    archived: Boolean(data.archived),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function compareByUpdatedDesc<T extends { updatedAt: Date | null }>(
  left: T,
  right: T,
) {
  return (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0);
}

export function subscribeToProjectDetail(
  projectId: string,
  onData: (project: ProjectRecord | null) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData(null);
    return () => undefined;
  }

  return onSnapshot(
    doc(collection(db, "projects"), projectId),
    (projectSnapshot) => {
      if (!projectSnapshot.exists()) {
        onData(null);
        return;
      }

      onData(parseProjectRecord(projectSnapshot));
    },
    onError,
  );
}

export function subscribeToProjectMembers(
  projectId: string,
  onData: (members: ProjectMember[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "project_members"), where("projectId", "==", projectId)),
    (snapshot) => {
      const members = snapshot.docs
        .map((memberDoc) => {
          const data = memberDoc.data() as Record<string, unknown>;

          return {
            id: memberDoc.id,
            projectId: String(data.projectId ?? ""),
            userId: String(data.userId ?? ""),
            email: String(data.email ?? ""),
            role: parseProjectRole(data.role),
            invitedBy:
              typeof data.invitedBy === "string" ? data.invitedBy : null,
            joinedAt: toDate(data.joinedAt),
          } satisfies ProjectMember;
        })
        .sort((left, right) => left.email.localeCompare(right.email, "de"));

      onData(members);
    },
    onError,
  );
}

export function subscribeToProjectMaterials(
  projectId: string,
  sortMode: MaterialSortMode,
  onData: (materials: MaterialItem[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "materials"), where("projectId", "==", projectId)),
    (snapshot) => {
      const materials = snapshot.docs
        .map((materialDoc) => {
          const data = materialDoc.data() as Record<string, unknown>;

          return {
            id: materialDoc.id,
            projectId: String(data.projectId ?? ""),
            name: String(data.name ?? ""),
            quantity: Number(data.quantity ?? 0),
            unit: String(data.unit ?? ""),
            catalogEntryId:
              typeof data.catalogEntryId === "string"
                ? data.catalogEntryId
                : null,
            createdBy: String(data.createdBy ?? ""),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          } satisfies MaterialItem;
        })
        .sort((left, right) => {
          if (sortMode === "alphabetical") {
            return left.name.localeCompare(right.name, "de", {
              sensitivity: "base",
            });
          }

          return compareByUpdatedDesc(left, right);
        });

      onData(materials);
    },
    onError,
  );
}

export function subscribeToProjectNotes(
  projectId: string,
  onData: (notes: ProjectNote[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "project_notes"), where("projectId", "==", projectId)),
    (snapshot) => {
      const notes = snapshot.docs
        .map((noteDoc) => {
          const data = noteDoc.data() as Record<string, unknown>;

          return {
            id: noteDoc.id,
            projectId: String(data.projectId ?? ""),
            text: String(data.text ?? ""),
            createdBy: String(data.createdBy ?? ""),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          } satisfies ProjectNote;
        })
        .sort(compareByUpdatedDesc);

      onData(notes);
    },
    onError,
  );
}

export function subscribeToProjectWorkLogs(
  projectId: string,
  onData: (logs: WorkLog[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "work_logs"), where("projectId", "==", projectId)),
    (snapshot) => {
      const logs = snapshot.docs
        .map((logDoc) => {
          const data = logDoc.data() as Record<string, unknown>;

          return {
            id: logDoc.id,
            projectId: String(data.projectId ?? ""),
            hours: Number(data.hours ?? 0),
            worker: String(data.worker ?? data.note ?? ""),
            createdBy: String(data.createdBy ?? ""),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          } satisfies WorkLog;
        })
        .sort(compareByUpdatedDesc);

      onData(logs);
    },
    onError,
  );
}

export function subscribeToProjectPhotos(
  projectId: string,
  onData: (photos: ProjectPhoto[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "project_photos"), where("projectId", "==", projectId)),
    (snapshot) => {
      const photos = snapshot.docs
        .map((photoDoc) => {
          const data = photoDoc.data() as Record<string, unknown>;
          const rawStatus = String(data.uploadStatus ?? "").toLowerCase();

          const uploadStatus: ProjectPhotoUploadStatus =
            rawStatus === "uploading" ||
            rawStatus === "uploaded" ||
            rawStatus === "failed"
              ? rawStatus
              : "queued";

          return {
            id: photoDoc.id,
            projectId: String(data.projectId ?? ""),
            storagePath: String(data.storagePath ?? ""),
            downloadUrl: String(data.downloadUrl ?? ""),
            localPath: String(data.localPath ?? ""),
            uploadStatus,
            uploadProgress: Number(
              data.uploadProgress ?? (uploadStatus === "uploaded" ? 1 : 0),
            ),
            errorMessage:
              typeof data.errorMessage === "string" ? data.errorMessage : null,
            createdBy: String(data.createdBy ?? ""),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          } satisfies ProjectPhoto;
        })
        .sort(compareByUpdatedDesc);

      onData(photos);
    },
    onError,
  );
}

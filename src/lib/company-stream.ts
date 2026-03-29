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
import type { ProjectSummary, WorkgroupSummary } from "@/lib/types";

function parseDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function parseCompanyWorkgroup(
  workgroupDoc:
    | QueryDocumentSnapshot
    | { id: string; data(): DocumentData | undefined },
): WorkgroupSummary {
  const data = (workgroupDoc.data() ?? {}) as Record<string, unknown>;

  return {
    id: workgroupDoc.id,
    name: String(data.name ?? ""),
    ownerId: String(data.ownerId ?? ""),
    companyId: typeof data.companyId === "string" ? data.companyId : null,
    companyName: typeof data.companyName === "string" ? data.companyName : null,
    companyCode: typeof data.companyCode === "string" ? data.companyCode : null,
    joinCode: String(data.joinCode ?? "").toUpperCase(),
    role: "member",
    memberEmail: "",
    createdAt: parseDate(data.createdAt),
    updatedAt: parseDate(data.updatedAt),
  };
}

function parseCompanyProject(
  projectDoc:
    | QueryDocumentSnapshot
    | { id: string; data(): DocumentData | undefined },
  fallbackEmail: string,
): ProjectSummary {
  const data = (projectDoc.data() ?? {}) as Record<string, unknown>;

  return {
    id: projectDoc.id,
    name: String(data.name ?? ""),
    description:
      typeof data.description === "string" ? data.description : null,
    ownerId: String(data.ownerId ?? ""),
    companyId: typeof data.companyId === "string" ? data.companyId : null,
    companyName: typeof data.companyName === "string" ? data.companyName : null,
    companyCode: typeof data.companyCode === "string" ? data.companyCode : null,
    workgroupId:
      typeof data.workgroupId === "string" ? data.workgroupId : null,
    projectCode:
      typeof data.projectCode === "string" ? data.projectCode : null,
    materialSortMode:
      data.materialSortMode === "alphabetical" ? "alphabetical" : "input",
    archived: Boolean(data.archived),
    createdAt: parseDate(data.createdAt),
    updatedAt: parseDate(data.updatedAt),
    role: "admin",
    memberEmail: fallbackEmail,
  };
}

export function subscribeToCompanyWorkgroups(
  companyId: string,
  onData: (workgroups: WorkgroupSummary[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db || !companyId) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "workgroups"), where("companyId", "==", companyId)),
    (snapshot) => {
      const workgroups = snapshot.docs
        .map((workgroupDoc) => parseCompanyWorkgroup(workgroupDoc))
        .sort((left, right) =>
          left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
        );
      onData(workgroups);
    },
    onError,
  );
}

export function subscribeToCompanyProjects(
  companyId: string,
  fallbackEmail: string,
  onData: (projects: ProjectSummary[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db || !companyId) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, "projects"), where("companyId", "==", companyId)),
    (snapshot) => {
      const projects = snapshot.docs
        .map((projectDoc) => parseCompanyProject(projectDoc, fallbackEmail))
        .sort((left, right) => {
          const leftTime = left.updatedAt?.getTime() ?? 0;
          const rightTime = right.updatedAt?.getTime() ?? 0;
          return rightTime - leftTime;
        });
      onData(projects);
    },
    onError,
  );
}


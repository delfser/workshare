import {
  Timestamp,
  collection,
  documentId,
  onSnapshot,
  query,
  where,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { ProjectRole, ProjectSummary } from "@/lib/types";

type Membership = {
  email: string;
  projectId: string;
  role: ProjectRole;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function parseProject(
  doc: QueryDocumentSnapshot,
  membership: Membership,
): ProjectSummary {
  const data = doc.data() as Record<string, unknown>;

  return {
    id: doc.id,
    name: String(data.name ?? ""),
    description:
      typeof data.description === "string" ? data.description : null,
    ownerId: String(data.ownerId ?? ""),
    workgroupId:
      typeof data.workgroupId === "string" ? data.workgroupId : null,
    projectCode:
      typeof data.projectCode === "string" ? data.projectCode : null,
    materialSortMode:
      data.materialSortMode === "alphabetical" ? "alphabetical" : "input",
    archived: Boolean(data.archived),
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    role: membership.role,
    memberEmail: membership.email,
  };
}

export function subscribeToUserProjects(
  uid: string,
  onData: (projects: ProjectSummary[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  const membershipsRef = collection(db, "project_members");
  const projectsRef = collection(db, "projects");

  let projectUnsubs: Array<() => void> = [];

  const membershipsQuery = query(membershipsRef, where("userId", "==", uid));

  const membershipsUnsub = onSnapshot(
    membershipsQuery,
    (membershipSnapshot) => {
      projectUnsubs.forEach((unsubscribe) => unsubscribe());
      projectUnsubs = [];

      const memberships = membershipSnapshot.docs
        .map((doc) => doc.data() as Record<string, unknown>)
        .map<Membership>((data) => ({
          email: String(data.email ?? ""),
          projectId: String(data.projectId ?? ""),
          role: (String(data.role ?? "viewer") as ProjectRole) ?? "viewer",
        }))
        .filter((item) => item.projectId.length > 0);

      if (memberships.length === 0) {
        onData([]);
        return;
      }

      const membershipMap = new Map(
        memberships.map((item) => [item.projectId, item] as const),
      );
      const ids = [...membershipMap.keys()];
      const aggregated = new Map<string, ProjectSummary>();

      const publish = () => {
        const projects = [...aggregated.values()].sort((left, right) => {
          const leftTime = left.updatedAt?.getTime() ?? 0;
          const rightTime = right.updatedAt?.getTime() ?? 0;

          return rightTime - leftTime;
        });

        onData(projects);
      };

      chunk(ids, 30).forEach((group) => {
        const projectsQuery = query(
          projectsRef,
          where(documentId(), "in", group),
        );

        const unsubscribe = onSnapshot(
          projectsQuery,
          (projectSnapshot) => {
            group.forEach((id) => aggregated.delete(id));

            projectSnapshot.docs.forEach((projectDoc) => {
              const membership = membershipMap.get(projectDoc.id);

              if (!membership) {
                return;
              }

              aggregated.set(projectDoc.id, parseProject(projectDoc, membership));
            });

            publish();
          },
          onError,
        );

        projectUnsubs.push(unsubscribe);
      });
    },
    onError,
  );

  return () => {
    membershipsUnsub();
    projectUnsubs.forEach((unsubscribe) => unsubscribe());
  };
}

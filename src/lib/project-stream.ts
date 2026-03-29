import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type {
  ProjectRole,
  ProjectSummary,
  WorkgroupRole,
} from "@/lib/types";

type ProjectMembership = {
  email: string;
  projectId: string;
  role: ProjectRole;
};

type WorkgroupMembership = {
  email: string;
  workgroupId: string;
  role: WorkgroupRole;
};

function workgroupRoleToProjectRole(role: WorkgroupRole): ProjectRole {
  if (role === "owner" || role === "admin") {
    return role;
  }

  return "worker";
}

function parseProject(
  projectDoc:
    | QueryDocumentSnapshot
    | { id: string; data(): DocumentData | undefined },
  membership: { email: string; role: ProjectRole },
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

  const projectMembershipsRef = collection(db, "project_members");
  const workgroupMembershipsRef = collection(db, "workgroup_members");
  const projectsRef = collection(db, "projects");

  let projectUnsubs: Array<() => void> = [];
  let directMemberships: ProjectMembership[] = [];
  let workgroupMemberships: WorkgroupMembership[] = [];

  const rebuildProjectSubscriptions = () => {
    projectUnsubs.forEach((unsubscribe) => unsubscribe());
    projectUnsubs = [];

    const aggregated = new Map<string, ProjectSummary>();

    const publish = () => {
      const projects = [...aggregated.values()].sort((left, right) => {
        const leftTime = left.updatedAt?.getTime() ?? 0;
        const rightTime = right.updatedAt?.getTime() ?? 0;
        return rightTime - leftTime;
      });

      onData(projects);
    };

    if (directMemberships.length === 0 && workgroupMemberships.length === 0) {
      onData([]);
      return;
    }

    const directMembershipMap = new Map(
      directMemberships.map((item) => [item.projectId, item] as const),
    );

    directMemberships.forEach((membership) => {
      const unsubscribe = onSnapshot(
        doc(projectsRef, membership.projectId),
        (projectSnapshot) => {
          aggregated.delete(membership.projectId);

          if (projectSnapshot.exists()) {
            aggregated.set(
              membership.projectId,
              parseProject(projectSnapshot, membership),
            );
          }

          publish();
        },
        (error) => {
          if (error.code === "permission-denied" || error.code === "not-found") {
            aggregated.delete(membership.projectId);
            publish();
            return;
          }

          onError(error);
        },
      );

      projectUnsubs.push(unsubscribe);
    });

    workgroupMemberships.forEach((membership) => {
      const unsubscribe = onSnapshot(
        query(projectsRef, where("workgroupId", "==", membership.workgroupId)),
        (projectSnapshot) => {
          const existingIds = [...aggregated.values()]
            .filter((project) => project.workgroupId === membership.workgroupId)
            .map((project) => project.id);

          existingIds.forEach((projectId) => {
            if (!directMembershipMap.has(projectId)) {
              aggregated.delete(projectId);
            }
          });

          projectSnapshot.docs.forEach((projectDoc) => {
            if (directMembershipMap.has(projectDoc.id)) {
              return;
            }

            aggregated.set(
              projectDoc.id,
              parseProject(projectDoc, {
                email: membership.email,
                role: workgroupRoleToProjectRole(membership.role),
              }),
            );
          });

          publish();
        },
        onError,
      );

      projectUnsubs.push(unsubscribe);
    });
  };

  const projectMembershipsUnsub = onSnapshot(
    query(projectMembershipsRef, where("userId", "==", uid)),
    (membershipSnapshot) => {
      directMemberships = membershipSnapshot.docs
        .map((membershipDoc) => membershipDoc.data() as Record<string, unknown>)
        .map<ProjectMembership>((data) => ({
          email: String(data.email ?? ""),
          projectId: String(data.projectId ?? ""),
          role: (String(data.role ?? "viewer") as ProjectRole) ?? "viewer",
        }))
        .filter((item) => item.projectId.length > 0);

      rebuildProjectSubscriptions();
    },
    onError,
  );

  const workgroupMembershipsUnsub = onSnapshot(
    query(workgroupMembershipsRef, where("userId", "==", uid)),
    (membershipSnapshot) => {
      workgroupMemberships = membershipSnapshot.docs
        .map((membershipDoc) => membershipDoc.data() as Record<string, unknown>)
        .map<WorkgroupMembership>((data) => ({
          email: String(data.email ?? ""),
          workgroupId: String(data.workgroupId ?? ""),
          role:
            (String(data.role ?? "member") as WorkgroupRole) ?? "member",
        }))
        .filter((item) => item.workgroupId.length > 0);

      rebuildProjectSubscriptions();
    },
    onError,
  );

  return () => {
    projectMembershipsUnsub();
    workgroupMembershipsUnsub();
    projectUnsubs.forEach((unsubscribe) => unsubscribe());
  };
}

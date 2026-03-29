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
import type { WorkgroupRole, WorkgroupSummary } from "@/lib/types";

type Membership = {
  workgroupId: string;
  role: WorkgroupRole;
  email: string;
};

function parseRole(value: unknown): WorkgroupRole {
  const role = String(value ?? "member").toLowerCase();
  if (role === "owner" || role === "admin") {
    return role;
  }
  return "member";
}

function parseWorkgroup(
  workgroupDoc:
    | QueryDocumentSnapshot
    | { id: string; data(): DocumentData | undefined },
  membership: Membership,
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
    role: membership.role,
    memberEmail: membership.email,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
  };
}

export function subscribeToUserWorkgroups(
  uid: string,
  onData: (workgroups: WorkgroupSummary[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  const membershipsRef = collection(db, "workgroup_members");
  const workgroupsRef = collection(db, "workgroups");
  let workgroupUnsubs: Array<() => void> = [];

  const membershipsUnsub = onSnapshot(
    query(membershipsRef, where("userId", "==", uid)),
    (membershipSnapshot) => {
      workgroupUnsubs.forEach((unsubscribe) => unsubscribe());
      workgroupUnsubs = [];

      const memberships = membershipSnapshot.docs
        .map((membershipDoc) => membershipDoc.data() as Record<string, unknown>)
        .map<Membership>((data) => ({
          workgroupId: String(data.workgroupId ?? ""),
          role: parseRole(data.role),
          email: String(data.email ?? ""),
        }))
        .filter((item) => item.workgroupId.length > 0);

      if (memberships.length === 0) {
        onData([]);
        return;
      }

      const membershipMap = new Map(
        memberships.map((item) => [item.workgroupId, item] as const),
      );
      const aggregated = new Map<string, WorkgroupSummary>();

      const publish = () => {
        onData(
          [...aggregated.values()].sort((left, right) =>
            left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
          ),
        );
      };

      membershipMap.forEach((membership, workgroupId) => {
        const workgroupRef = doc(workgroupsRef, workgroupId);
        const unsubscribe = onSnapshot(
          workgroupRef,
          (workgroupSnapshot) => {
            aggregated.delete(workgroupId);

            if (workgroupSnapshot.exists()) {
              aggregated.set(
                workgroupId,
                parseWorkgroup(workgroupSnapshot, membership),
              );
            }

            publish();
          },
          onError,
        );

        workgroupUnsubs.push(unsubscribe);
      });
    },
    onError,
  );

  return () => {
    membershipsUnsub();
    workgroupUnsubs.forEach((unsubscribe) => unsubscribe());
  };
}

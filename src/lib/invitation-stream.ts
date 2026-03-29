import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
  type FirestoreError,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { InvitationStatus, InvitationSummary, ProjectRole, WorkgroupRole } from "@/lib/types";

function parseProjectRole(value: unknown): ProjectRole {
  const role = String(value ?? "viewer").toLowerCase();
  if (role === "owner" || role === "admin" || role === "worker") {
    return role;
  }
  return "viewer";
}

function parseWorkgroupRole(value: unknown): WorkgroupRole {
  const role = String(value ?? "member").toLowerCase();
  if (role === "owner" || role === "admin") {
    return role;
  }
  return "member";
}

function parseStatus(value: unknown): InvitationStatus {
  const status = String(value ?? "pending").toLowerCase();
  if (status === "accepted" || status === "revoked") {
    return status;
  }
  return "pending";
}

export function subscribeToPendingInvitations(
  email: string,
  onData: (invitations: InvitationSummary[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(
      collection(db, "invitations"),
      where("email", "==", normalizedEmail),
      where("status", "==", "pending"),
    ),
    (snapshot) => {
      const invitations = snapshot.docs
        .map((docSnapshot) => {
          const data = (docSnapshot.data() ?? {}) as Record<string, unknown>;
          const hasProject = typeof data.projectId === "string" && data.projectId.length > 0;

          return {
            id: docSnapshot.id,
            email: String(data.email ?? normalizedEmail),
            status: parseStatus(data.status),
            role: hasProject ? parseProjectRole(data.role) : parseWorkgroupRole(data.role),
            projectId: typeof data.projectId === "string" ? data.projectId : null,
            projectName: typeof data.projectName === "string" ? data.projectName : null,
            workgroupId: typeof data.workgroupId === "string" ? data.workgroupId : null,
            workgroupName:
              typeof data.workgroupName === "string" ? data.workgroupName : null,
            invitedBy: typeof data.invitedBy === "string" ? data.invitedBy : null,
            createdAt:
              data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            acceptedAt:
              data.acceptedAt instanceof Timestamp ? data.acceptedAt.toDate() : null,
          } satisfies InvitationSummary;
        })
        .sort((left, right) => {
          const leftTime = left.createdAt?.getTime() ?? 0;
          const rightTime = right.createdAt?.getTime() ?? 0;
          return rightTime - leftTime;
        });

      onData(invitations);
    },
    onError,
  );
}

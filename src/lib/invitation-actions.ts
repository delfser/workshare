import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  collection,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { ProjectRole, WorkgroupRole } from "@/lib/types";

function normalizeProjectRole(role: string): ProjectRole {
  if (role === "owner" || role === "admin" || role === "worker") {
    return role;
  }
  return "viewer";
}

function normalizeWorkgroupRole(role: string): WorkgroupRole {
  if (role === "owner" || role === "admin") {
    return role;
  }
  return "member";
}

export async function acceptInvitation(input: {
  invitationId: string;
  userId: string;
  email: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const normalizedEmail = input.email.trim().toLowerCase();
  const invitationRef = doc(collection(firestore, "invitations"), input.invitationId);
  const preInvitation = await getDoc(invitationRef);
  const preWorkgroupId = String(preInvitation.data()?.workgroupId ?? "");

  if (preWorkgroupId) {
    const membershipSnapshot = await getDocs(
      query(collection(firestore, "workgroup_members"), where("userId", "==", input.userId)),
    );
    const otherMembershipExists = membershipSnapshot.docs.some((membershipDoc) => {
      const membershipWorkgroupId = String(membershipDoc.data().workgroupId ?? "");
      return membershipWorkgroupId && membershipWorkgroupId !== preWorkgroupId;
    });

    if (otherMembershipExists) {
      throw new Error(
        "Du kannst nur in einer Workgroup sein. Bitte zuerst die bestehende Workgroup verlassen.",
      );
    }
  }

  await runTransaction(firestore, async (transaction) => {
    const invitationSnapshot = await transaction.get(invitationRef);
    if (!invitationSnapshot.exists()) {
      throw new Error("Einladung nicht gefunden.");
    }

    const data = (invitationSnapshot.data() ?? {}) as Record<string, unknown>;
    if (data.status !== "pending") {
      return;
    }

    if (String(data.email ?? "").toLowerCase() !== normalizedEmail) {
      throw new Error("Einladung gehoert nicht zu diesem Benutzer.");
    }

    const projectId = String(data.projectId ?? "");
    const workgroupId = String(data.workgroupId ?? "");
    const rawRole = String(data.role ?? "").toLowerCase();

    if (workgroupId) {
      const memberId = `${workgroupId}_${input.userId}`;
      transaction.set(
        doc(collection(firestore, "workgroup_members"), memberId),
        {
          id: memberId,
          workgroupId,
          userId: input.userId,
          email: normalizedEmail,
          role: normalizeWorkgroupRole(rawRole),
          invitedBy: typeof data.invitedBy === "string" ? data.invitedBy : null,
          invitationId: input.invitationId,
          joinedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } else if (projectId) {
      const memberId = `${projectId}_${input.userId}`;
      transaction.set(
        doc(collection(firestore, "project_members"), memberId),
        {
          id: memberId,
          projectId,
          userId: input.userId,
          email: normalizedEmail,
          role: normalizeProjectRole(rawRole),
          invitedBy: typeof data.invitedBy === "string" ? data.invitedBy : null,
          invitationId: input.invitationId,
          joinedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      throw new Error("Einladung ist fehlerhaft.");
    }

    transaction.update(invitationRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
    });
  });
}

export async function declineInvitation(invitationId: string) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;

  await updateDoc(doc(collection(firestore, "invitations"), invitationId), {
    status: "revoked",
    acceptedAt: serverTimestamp(),
  });
}

export async function cleanupResolvedInvitations(input: {
  email: string;
  maxAgeMs?: number;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const maxAgeMs = input.maxAgeMs ?? 5 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  const statuses = ["accepted", "revoked"] as const;

  for (const status of statuses) {
    const snapshot = await getDocs(
      query(
        collection(firestore, "invitations"),
        where("email", "==", normalizedEmail),
        where("status", "==", status),
      ),
    );

    const deletions = snapshot.docs
      .filter((item) => {
        const rawDate = item.data().acceptedAt ?? item.data().createdAt ?? null;
        const resolvedAt =
          rawDate && typeof rawDate === "object" && "toDate" in rawDate
            ? rawDate.toDate()
            : null;

        return resolvedAt instanceof Date && resolvedAt.getTime() <= cutoff;
      })
      .map((item) => deleteDoc(item.ref));

    if (deletions.length > 0) {
      await Promise.all(deletions);
    }
  }
}

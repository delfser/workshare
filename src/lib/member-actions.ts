import { Timestamp, collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { ProjectRole } from "@/lib/types";

function now() {
  return Timestamp.now();
}

export async function updateMemberRole(input: {
  projectId: string;
  userId: string;
  role: ProjectRole;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const memberId = `${input.projectId}_${input.userId}`;
  await updateDoc(doc(collection(db, "project_members"), memberId), {
    role: input.role,
  });
}

export async function removeMember(input: {
  projectId: string;
  userId: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const memberId = `${input.projectId}_${input.userId}`;
  await deleteDoc(doc(collection(db, "project_members"), memberId));
}

export async function inviteMember(input: {
  projectId: string;
  projectName: string;
  email: string;
  role: Exclude<ProjectRole, "owner">;
  invitedBy: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const invitationRef = doc(collection(db, "invitations"));

  await setDoc(invitationRef, {
    id: invitationRef.id,
    projectId: input.projectId,
    projectName: input.projectName,
    email: normalizedEmail,
    role: input.role,
    invitedBy: input.invitedBy,
    status: "pending",
    createdAt: now(),
    acceptedAt: null,
  });
}

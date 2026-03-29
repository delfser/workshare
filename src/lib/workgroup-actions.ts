import {
  type DocumentReference,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import { deleteProject } from "@/lib/project-actions";

const WORKGROUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function buildWorkgroupCode(length = 6) {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * WORKGROUP_CODE_ALPHABET.length);
    return WORKGROUP_CODE_ALPHABET[index];
  }).join("");
}

async function allocateUniqueWorkgroupCode() {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = buildWorkgroupCode();
    const existingCode = await getDoc(doc(collection(db, "workgroup_join_codes"), code));
    if (!existingCode.exists()) {
      return code;
    }
  }

  throw new Error("Kein freier Workgroup-Code verfügbar.");
}

async function ensureSingleWorkgroupMembership(userId: string, allowWorkgroupId?: string) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const membershipsSnapshot = await getDocs(
    query(collection(firestore, "workgroup_members"), where("userId", "==", userId)),
  );

  const existingIds = new Set(
    membershipsSnapshot.docs
      .map((membershipDoc) => String(membershipDoc.data().workgroupId ?? ""))
      .filter((workgroupId) => workgroupId.length > 0),
  );

  if (allowWorkgroupId) {
    existingIds.delete(allowWorkgroupId);
  }

  if (existingIds.size > 0) {
    throw new Error(
      "Du kannst nur in einer Workgroup sein. Bitte zuerst die bestehende Workgroup verlassen.",
    );
  }
}

async function deleteRefsInChunks(refs: Array<DocumentReference>) {
  if (!db || refs.length === 0) {
    return;
  }

  const firestore = db;
  const chunkSize = 450;

  for (let start = 0; start < refs.length; start += chunkSize) {
    const batch = writeBatch(firestore);
    refs.slice(start, start + chunkSize).forEach((itemRef) => batch.delete(itemRef));
    await batch.commit();
  }
}

export async function createWorkgroup(input: {
  ownerId: string;
  ownerEmail: string;
  name: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Bitte einen Workgroup-Namen eingeben.");
  }

  await ensureSingleWorkgroupMembership(input.ownerId);

  const firestore = db;
  const code = await allocateUniqueWorkgroupCode();
  const groupRef = doc(collection(firestore, "workgroups"));
  const now = serverTimestamp();
  const batch = writeBatch(firestore);

  batch.set(groupRef, {
    id: groupRef.id,
    name,
    nameLower: name.toLowerCase(),
    ownerId: input.ownerId,
    joinCode: code,
    createdAt: now,
    updatedAt: now,
  });

  const memberId = `${groupRef.id}_${input.ownerId}`;
  batch.set(doc(collection(firestore, "workgroup_members"), memberId), {
    id: memberId,
    workgroupId: groupRef.id,
    userId: input.ownerId,
    email: input.ownerEmail.trim().toLowerCase(),
    role: "owner",
    joinedAt: now,
  });

  batch.set(doc(collection(firestore, "workgroup_join_codes"), code), {
    code,
    workgroupId: groupRef.id,
    ownerId: input.ownerId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await batch.commit();

  return {
    id: groupRef.id,
    joinCode: code,
  };
}

export async function joinWorkgroupByCode(input: {
  code: string;
  userId: string;
  email: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const normalizedCode = input.code.trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error("Bitte Workgroup-Code eingeben.");
  }

  const codeSnapshot = await getDoc(
    doc(collection(firestore, "workgroup_join_codes"), normalizedCode),
  );
  if (!codeSnapshot.exists()) {
    throw new Error("Workgroup-Code ist ungültig.");
  }

  const codeData = (codeSnapshot.data() ?? {}) as Record<string, unknown>;
  if (codeData.isActive === false) {
    throw new Error("Workgroup-Code ist nicht aktiv.");
  }

  const workgroupId = String(codeData.workgroupId ?? "");
  if (!workgroupId) {
    throw new Error("Workgroup-Code ist fehlerhaft.");
  }

  await ensureSingleWorkgroupMembership(input.userId, workgroupId);

  const memberId = `${workgroupId}_${input.userId}`;
  const memberRef = doc(collection(firestore, "workgroup_members"), memberId);
  const memberSnapshot = await getDoc(memberRef);
  if (memberSnapshot.exists()) {
    return;
  }

  await setDoc(memberRef, {
    id: memberId,
    workgroupId,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    role: "member",
    joinCode: normalizedCode,
    joinedAt: serverTimestamp(),
  });
}

export async function inviteToWorkgroup(input: {
  workgroupId: string;
  workgroupName: string;
  email: string;
  invitedBy: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Bitte eine E-Mail-Adresse eingeben.");
  }

  const invitationRef = doc(collection(firestore, "invitations"));
  await setDoc(invitationRef, {
    id: invitationRef.id,
    projectId: null,
    projectName: null,
    workgroupId: input.workgroupId,
    workgroupName: input.workgroupName,
    email: normalizedEmail,
    role: "member",
    invitedBy: input.invitedBy,
    status: "pending",
    createdAt: serverTimestamp(),
    acceptedAt: null,
  });
}

export async function leaveWorkgroup(input: {
  workgroupId: string;
  userId: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const workgroupMembershipId = `${input.workgroupId}_${input.userId}`;
  const membershipRef = doc(collection(firestore, "workgroup_members"), workgroupMembershipId);
  const membershipSnapshot = await getDoc(membershipRef);
  if (!membershipSnapshot.exists()) {
    return;
  }

  const role = String(membershipSnapshot.data()?.role ?? "member").toLowerCase();
  if (role === "owner") {
    throw new Error("Owner können die Workgroup nicht einfach verlassen.");
  }

  const projectsSnapshot = await getDocs(
    query(collection(firestore, "projects"), where("workgroupId", "==", input.workgroupId)),
  );

  const batch = writeBatch(firestore);

  for (const projectDoc of projectsSnapshot.docs) {
    const membershipsSnapshot = await getDocs(
      query(
        collection(firestore, "project_members"),
        where("projectId", "==", projectDoc.id),
        where("userId", "==", input.userId),
      ),
    );

    membershipsSnapshot.docs.forEach((projectMembershipDoc) => {
      batch.delete(projectMembershipDoc.ref);
    });
  }

  batch.delete(membershipRef);
  await batch.commit();
}

export async function deleteWorkgroup(input: {
  workgroupId: string;
  requesterId: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const workgroupId = input.workgroupId.trim();
  if (!workgroupId) {
    throw new Error("Workgroup-ID fehlt.");
  }

  const requesterMembershipRef = doc(
    collection(firestore, "workgroup_members"),
    `${workgroupId}_${input.requesterId}`,
  );
  const requesterMembershipSnapshot = await getDoc(requesterMembershipRef);
  if (!requesterMembershipSnapshot.exists()) {
    throw new Error("Nur Owner können eine Workgroup löschen.");
  }

  const requesterRole = String(requesterMembershipSnapshot.data()?.role ?? "member").toLowerCase();
  if (requesterRole !== "owner") {
    throw new Error("Nur Owner können eine Workgroup löschen.");
  }

  const projectsSnapshot = await getDocs(
    query(collection(firestore, "projects"), where("workgroupId", "==", workgroupId)),
  );

  for (const projectDoc of projectsSnapshot.docs) {
    await deleteProject(projectDoc.id);
  }

  const [membershipsSnapshot, invitationsSnapshot, joinCodesSnapshot] = await Promise.all([
    getDocs(query(collection(firestore, "workgroup_members"), where("workgroupId", "==", workgroupId))),
    getDocs(query(collection(firestore, "invitations"), where("workgroupId", "==", workgroupId))),
    getDocs(
      query(collection(firestore, "workgroup_join_codes"), where("workgroupId", "==", workgroupId)),
    ),
  ]);

  const refsToDelete = [
    doc(collection(firestore, "workgroups"), workgroupId),
    ...membershipsSnapshot.docs.map((item) => item.ref),
    ...invitationsSnapshot.docs.map((item) => item.ref),
    ...joinCodesSnapshot.docs.map((item) => item.ref),
  ];

  const uniqueRefs = Array.from(new Map(refsToDelete.map((item) => [item.path, item])).values());
  await deleteRefsInChunks(uniqueRefs);
}

export async function assignWorkgroupToCompany(input: {
  workgroupId: string;
  companyId: string;
  companyCode?: string;
  companyName: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const normalizedCompanyId = input.companyId.trim();
  const normalizedCompanyName = input.companyName.trim();

  if (!normalizedCompanyId || !normalizedCompanyName) {
    throw new Error("Firmenzuordnung ist unvollständig.");
  }

  await updateDoc(doc(collection(firestore, "workgroups"), input.workgroupId), {
    companyId: normalizedCompanyId,
    companyCode: input.companyCode?.trim().toUpperCase() ?? null,
    companyName: normalizedCompanyName,
    updatedAt: serverTimestamp(),
  });

  const projectsSnapshot = await getDocs(
    query(collection(firestore, "projects"), where("workgroupId", "==", input.workgroupId)),
  );

  if (projectsSnapshot.empty) {
    return;
  }

  const batch = writeBatch(firestore);
  projectsSnapshot.docs.forEach((projectDoc) => {
    batch.update(projectDoc.ref, {
      companyId: normalizedCompanyId,
      companyCode: input.companyCode?.trim().toUpperCase() ?? null,
      companyName: normalizedCompanyName,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function linkWorkgroupToCompanyByCode(input: {
  workgroupId: string;
  requesterId: string;
  companyCode: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const normalizedWorkgroupId = input.workgroupId.trim();
  const normalizedCompanyCode = input.companyCode.trim().toUpperCase();

  if (!normalizedWorkgroupId) {
    throw new Error("Bitte zuerst eine Partie auswählen.");
  }

  if (!normalizedCompanyCode) {
    throw new Error("Bitte Firmen-Code eingeben.");
  }

  const requesterMembershipRef = doc(
    collection(firestore, "workgroup_members"),
    `${normalizedWorkgroupId}_${input.requesterId}`,
  );
  const requesterMembership = await getDoc(requesterMembershipRef);
  if (!requesterMembership.exists()) {
    throw new Error("Nur Mitglieder der Partie können den Firmen-Code setzen.");
  }

  const requesterRole = String(requesterMembership.data()?.role ?? "member").toLowerCase();
  if (requesterRole !== "owner" && requesterRole !== "admin") {
    throw new Error("Nur Owner oder Admin können den Firmen-Code setzen.");
  }

  const companiesSnapshot = await getDocs(
    query(
      collection(firestore, "companies"),
      where("code", "==", normalizedCompanyCode),
      limit(1),
    ),
  );

  if (companiesSnapshot.empty) {
    throw new Error("Firmen-Code ist ungültig.");
  }

  const companyDoc = companiesSnapshot.docs[0];
  const companyData = companyDoc.data() as Record<string, unknown>;
  const companyName = String(companyData.name ?? "").trim();
  if (!companyName) {
    throw new Error("Firma konnte nicht geladen werden.");
  }

  await assignWorkgroupToCompany({
    workgroupId: normalizedWorkgroupId,
    companyId: companyDoc.id,
    companyCode: normalizedCompanyCode,
    companyName,
  });

  return {
    companyId: companyDoc.id,
    companyCode: normalizedCompanyCode,
    companyName,
  };
}

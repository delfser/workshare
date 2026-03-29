import {
  type DocumentReference,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";

import { db, storage } from "@/lib/firebase-client";
import type { MaterialSortMode } from "@/lib/types";

function now() {
  return Timestamp.now();
}

const PROJECT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function buildProjectCode(length = 6) {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * PROJECT_CODE_ALPHABET.length);
    return PROJECT_CODE_ALPHABET[index];
  }).join("");
}

async function allocateUniqueProjectCode() {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = buildProjectCode();
    const existingCode = await getDoc(doc(collection(db, "project_join_codes"), code));
    if (!existingCode.exists()) {
      return code;
    }
  }

  throw new Error("Kein freier Projektcode verfügbar.");
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

export async function createProject(input: {
  userId: string;
  email: string;
  name: string;
  description?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  companyCode?: string | null;
  workgroupId?: string | null;
  materialSortMode: MaterialSortMode;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Bitte einen Projektnamen eingeben.");
  }

  const trimmedEmail = input.email.trim().toLowerCase();
  if (!trimmedEmail) {
    throw new Error("Bitte zuerst eine gültige E-Mail-Adresse hinterlegen.");
  }

  const firestore = db;
  const projectRef = doc(collection(firestore, "projects"));
  const projectId = projectRef.id;
  const normalizedWorkgroupId =
    input.workgroupId?.trim().length ? input.workgroupId.trim() : null;
  let normalizedCompanyId =
    input.companyId?.trim().length ? input.companyId.trim() : null;
  let normalizedCompanyName =
    input.companyName?.trim().length ? input.companyName.trim() : null;
  let normalizedCompanyCode =
    input.companyCode?.trim().length ? input.companyCode.trim().toUpperCase() : null;

  if (normalizedWorkgroupId) {
    const workgroupSnapshot = await getDoc(
      doc(collection(firestore, "workgroups"), normalizedWorkgroupId),
    );

    if (workgroupSnapshot.exists()) {
      const workgroupData = workgroupSnapshot.data() as Record<string, unknown>;
      const linkedCompanyId = String(workgroupData.companyId ?? "").trim();
      const linkedCompanyName = String(workgroupData.companyName ?? "").trim();
      const linkedCompanyCode = String(workgroupData.companyCode ?? "")
        .trim()
        .toUpperCase();

      if (linkedCompanyId) {
        normalizedCompanyId = linkedCompanyId;
        normalizedCompanyName = linkedCompanyName || null;
        normalizedCompanyCode = linkedCompanyCode || null;
      }
    }
  }

  const projectCode = await allocateUniqueProjectCode();
  const timestamp = now();
  const batch = writeBatch(firestore);

  batch.set(projectRef, {
    id: projectId,
    name: trimmedName,
    description:
      input.description?.trim().length ? input.description.trim() : null,
    ownerId: input.userId,
    companyId: normalizedCompanyId,
    companyName: normalizedCompanyName,
    companyCode: normalizedCompanyCode,
    workgroupId: normalizedWorkgroupId,
    projectCode,
    materialSortMode:
      input.materialSortMode === "alphabetical" ? "alphabetical" : "input",
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const membershipRef = doc(
    collection(firestore, "project_members"),
    `${projectId}_${input.userId}`,
  );
  batch.set(membershipRef, {
    id: membershipRef.id,
    projectId,
    userId: input.userId,
    email: trimmedEmail,
    role: "owner",
    invitedBy: input.userId,
    joinedAt: timestamp,
  });

  if (normalizedWorkgroupId) {
    const workgroupMembersSnapshot = await getDocs(
      query(
        collection(firestore, "workgroup_members"),
        where("workgroupId", "==", normalizedWorkgroupId),
      ),
    );

    workgroupMembersSnapshot.docs.forEach((memberDoc) => {
      const data = memberDoc.data() as Record<string, unknown>;
      let memberUserId = String(data.userId ?? "").trim();
      const memberEmail = String(data.email ?? "").trim().toLowerCase();
      if (!memberUserId && normalizedWorkgroupId) {
        const prefix = `${normalizedWorkgroupId}_`;
        if (memberDoc.id.startsWith(prefix)) {
          memberUserId = memberDoc.id.slice(prefix.length).trim();
        }
      }

      if (!memberUserId || memberUserId === input.userId) {
        return;
      }

      const projectMemberRef = doc(
        collection(firestore, "project_members"),
        `${projectId}_${memberUserId}`,
      );

      batch.set(
        projectMemberRef,
        {
          id: projectMemberRef.id,
          projectId,
          userId: memberUserId,
          email: memberEmail,
          role: "owner",
          invitedBy: input.userId,
          joinedAt: timestamp,
          sourceWorkgroupId: normalizedWorkgroupId,
        },
        { merge: true },
      );
    });
  }

  batch.set(doc(collection(firestore, "project_join_codes"), projectCode), {
    code: projectCode,
    projectId,
    ownerId: input.userId,
    createdBy: input.userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    isActive: true,
  });

  await batch.commit();

  return {
    id: projectId,
    projectCode,
  };
}

export async function joinProjectByCode(input: {
  code: string;
  userId: string;
  email: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const normalizedCode = input.code.trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error("Bitte Projektcode eingeben.");
  }

  const firestore = db;
  const codeDoc = await getDoc(doc(collection(firestore, "project_join_codes"), normalizedCode));
  if (!codeDoc.exists()) {
    throw new Error("Projektcode ist ungültig.");
  }

  const codeData = codeDoc.data() as Record<string, unknown>;
  const isActive = typeof codeData.isActive === "boolean" ? codeData.isActive : true;
  if (!isActive) {
    throw new Error("Projektcode ist nicht aktiv.");
  }

  const projectId = String(codeData.projectId ?? "").trim();
  if (!projectId) {
    throw new Error("Projektcode ist fehlerhaft.");
  }

  const memberId = `${projectId}_${input.userId}`;
  const memberRef = doc(collection(firestore, "project_members"), memberId);
  const existingMember = await getDoc(memberRef);
  if (existingMember.exists()) {
    return {
      status: "already_member" as const,
      projectId,
    };
  }

  await setDoc(memberRef, {
    id: memberId,
    projectId,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    role: "worker",
    invitedBy: null,
    joinCode: normalizedCode,
    joinedAt: now(),
  });

  return {
    status: "joined" as const,
    projectId,
  };
}

export async function updateProject(input: {
  projectId: string;
  name: string;
  description?: string | null;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await updateDoc(doc(collection(db, "projects"), input.projectId), {
    name: input.name.trim(),
    description:
      input.description?.trim().length
        ? input.description.trim()
        : null,
    updatedAt: now(),
  });
}

export async function deleteProject(projectId: string) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const firestore = db;
  const [
    membersSnapshot,
    materialsSnapshot,
    invitationsSnapshot,
    joinCodesSnapshot,
    notesSnapshot,
    workLogsSnapshot,
    photosSnapshot,
  ] = await Promise.all([
    getDocs(query(collection(firestore, "project_members"), where("projectId", "==", projectId))),
    getDocs(query(collection(firestore, "materials"), where("projectId", "==", projectId))),
    getDocs(query(collection(firestore, "invitations"), where("projectId", "==", projectId))),
    getDocs(query(collection(firestore, "project_join_codes"), where("projectId", "==", projectId))),
    getDocs(query(collection(firestore, "project_notes"), where("projectId", "==", projectId))),
    getDocs(query(collection(firestore, "work_logs"), where("projectId", "==", projectId))),
    getDocs(query(collection(firestore, "project_photos"), where("projectId", "==", projectId))),
  ]);

  for (const photoDoc of photosSnapshot.docs) {
    const storagePath = String(photoDoc.data().storagePath ?? "").trim();
    if (!storagePath || !storage) {
      continue;
    }

    try {
      await deleteObject(ref(storage, storagePath));
    } catch {
      // Firestore cleanup remains the source of truth even if storage deletion fails.
    }
  }

  await deleteRefsInChunks([
    doc(collection(firestore, "projects"), projectId),
    ...membersSnapshot.docs.map((item) => item.ref),
    ...materialsSnapshot.docs.map((item) => item.ref),
    ...invitationsSnapshot.docs.map((item) => item.ref),
    ...joinCodesSnapshot.docs.map((item) => item.ref),
    ...notesSnapshot.docs.map((item) => item.ref),
    ...workLogsSnapshot.docs.map((item) => item.ref),
    ...photosSnapshot.docs.map((item) => item.ref),
  ]);
}

export async function setProjectArchived(input: {
  projectId: string;
  archived: boolean;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await updateDoc(doc(collection(db, "projects"), input.projectId), {
    archived: input.archived,
    updatedAt: now(),
  });
}

export async function setProjectMaterialSortMode(input: {
  projectId: string;
  materialSortMode: MaterialSortMode;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await updateDoc(doc(collection(db, "projects"), input.projectId), {
    materialSortMode: input.materialSortMode,
    updatedAt: now(),
  });
}

function workgroupRoleToProjectRole(value: unknown): "owner" | "worker" {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "owner" || normalized === "admin" ? "owner" : "worker";
}

function normalizeProjectRole(
  value: unknown,
  fallback: "owner" | "worker" = "worker",
): "owner" | "admin" | "worker" | "viewer" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "worker" ||
    normalized === "viewer"
  ) {
    return normalized;
  }

  return fallback;
}

function extractMemberUserId(
  workgroupId: string,
  membershipDocId: string,
  rawUserId: unknown,
) {
  const fromField = String(rawUserId ?? "").trim();
  if (fromField.length > 0) {
    return fromField;
  }

  const prefix = `${workgroupId}_`;
  if (membershipDocId.startsWith(prefix)) {
    const fromId = membershipDocId.slice(prefix.length).trim();
    if (fromId.length > 0) {
      return fromId;
    }
  }

  return "";
}

export async function repairProjectMembershipsForUser(input: {
  userId: string;
  email: string;
  managedWorkgroupIds: string[];
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfuegbar.");
  }

  const firestore = db;
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Bitte mit einer gueltigen E-Mail anmelden.");
  }

  const timestamp = now();
  let batch = writeBatch(firestore);
  let operationCount = 0;

  const commitIfNeeded = async (force = false) => {
    if (!force && operationCount < 350) {
      return;
    }
    if (operationCount === 0) {
      return;
    }
    await batch.commit();
    batch = writeBatch(firestore);
    operationCount = 0;
  };

  let membershipsChecked = 0;
  let membershipsNormalized = 0;
  let staleMembershipsRemoved = 0;
  let membershipsAddedFromWorkgroups = 0;

  const existingMemberships = await getDocs(
    query(collection(firestore, "project_members"), where("userId", "==", input.userId)),
  );

  const membershipsByProjectId = new Map<
    string,
    Array<{
      docId: string;
      ref: DocumentReference;
      data: Record<string, unknown>;
    }>
  >();

  existingMemberships.docs.forEach((membershipDoc) => {
    const data = membershipDoc.data() as Record<string, unknown>;
    const projectId = String(data.projectId ?? "").trim();
    membershipsChecked += 1;

    if (!projectId) {
      batch.delete(membershipDoc.ref);
      operationCount += 1;
      staleMembershipsRemoved += 1;
      return;
    }

    const existingEntries = membershipsByProjectId.get(projectId) ?? [];
    existingEntries.push({
      docId: membershipDoc.id,
      ref: membershipDoc.ref,
      data,
    });
    membershipsByProjectId.set(projectId, existingEntries);
  });

  await commitIfNeeded();

  const projectIds = [...membershipsByProjectId.keys()];
  const projectSnapshotEntries = await Promise.all(
    projectIds.map(async (projectId) => {
      const projectSnapshot = await getDoc(doc(collection(firestore, "projects"), projectId));
      return [projectId, projectSnapshot] as const;
    }),
  );
  const projectSnapshotMap = new Map(projectSnapshotEntries);

  const canonicalProjectIds = new Set<string>();

  for (const [projectId, entries] of membershipsByProjectId.entries()) {
    const projectSnapshot = projectSnapshotMap.get(projectId);
    if (!projectSnapshot?.exists()) {
      entries.forEach((entry) => {
        batch.delete(entry.ref);
        operationCount += 1;
        staleMembershipsRemoved += 1;
      });
      await commitIfNeeded();
      continue;
    }

    const projectData = projectSnapshot.data() as Record<string, unknown>;
    const ownerId = String(projectData.ownerId ?? "").trim();
    const fallbackRole: "owner" | "worker" = ownerId === input.userId ? "owner" : "worker";
    const firstEntry = entries[0];
    const joinedAt = firstEntry.data.joinedAt instanceof Timestamp ? firstEntry.data.joinedAt : timestamp;
    const invitedBy =
      String(firstEntry.data.invitedBy ?? "").trim() || ownerId || input.userId;
    const sourceWorkgroupId = String(firstEntry.data.sourceWorkgroupId ?? "").trim();
    const canonicalMembershipId = `${projectId}_${input.userId}`;
    const canonicalMembershipRef = doc(
      collection(firestore, "project_members"),
      canonicalMembershipId,
    );

    batch.set(
      canonicalMembershipRef,
      {
        id: canonicalMembershipId,
        projectId,
        userId: input.userId,
        email: normalizedEmail,
        role: normalizeProjectRole(firstEntry.data.role, fallbackRole),
        invitedBy,
        joinedAt,
        ...(sourceWorkgroupId ? { sourceWorkgroupId } : {}),
      },
      { merge: true },
    );
    operationCount += 1;
    membershipsNormalized += 1;

    entries.forEach((entry) => {
      if (entry.docId === canonicalMembershipId) {
        return;
      }
      batch.delete(entry.ref);
      operationCount += 1;
      staleMembershipsRemoved += 1;
    });

    canonicalProjectIds.add(projectId);
    await commitIfNeeded();
  }

  const directWorkgroupMemberships = await getDocs(
    query(collection(firestore, "workgroup_members"), where("userId", "==", input.userId)),
  );

  for (const workgroupMembershipDoc of directWorkgroupMemberships.docs) {
    const data = workgroupMembershipDoc.data() as Record<string, unknown>;
    const workgroupId = String(data.workgroupId ?? "").trim();
    if (!workgroupId) {
      continue;
    }

    const fallbackRole = workgroupRoleToProjectRole(data.role);
    const projectsSnapshot = await getDocs(
      query(collection(firestore, "projects"), where("workgroupId", "==", workgroupId)),
    );

    projectsSnapshot.docs.forEach((projectDoc) => {
      const projectId = projectDoc.id;
      if (canonicalProjectIds.has(projectId)) {
        return;
      }

      const projectData = projectDoc.data() as Record<string, unknown>;
      const ownerId = String(projectData.ownerId ?? "").trim();
      const memberRole: "owner" | "worker" = ownerId === input.userId ? "owner" : fallbackRole;
      const membershipId = `${projectId}_${input.userId}`;

      batch.set(
        doc(collection(firestore, "project_members"), membershipId),
        {
          id: membershipId,
          projectId,
          userId: input.userId,
          email: normalizedEmail,
          role: memberRole,
          invitedBy: ownerId || input.userId,
          joinedAt: timestamp,
          sourceWorkgroupId: workgroupId,
        },
        { merge: true },
      );
      operationCount += 1;
      membershipsAddedFromWorkgroups += 1;
      canonicalProjectIds.add(projectId);
    });

    await commitIfNeeded();
  }

  await commitIfNeeded(true);

  const managedWorkgroupIds = Array.from(
    new Set(
      input.managedWorkgroupIds
        .map((workgroupId) => workgroupId.trim())
        .filter((workgroupId) => workgroupId.length > 0),
    ),
  );

  let workgroupMembershipsSynced = 0;
  let workgroupProjectsProcessed = 0;
  if (managedWorkgroupIds.length > 0) {
    const workgroupSyncResult = await syncProjectMembershipsForWorkgroups({
      actorUserId: input.userId,
      workgroupIds: managedWorkgroupIds,
    });
    workgroupMembershipsSynced = workgroupSyncResult.membershipsUpserted;
    workgroupProjectsProcessed = workgroupSyncResult.projectsProcessed;
  }

  return {
    membershipsChecked,
    membershipsNormalized,
    staleMembershipsRemoved,
    membershipsAddedFromWorkgroups,
    workgroupMembershipsSynced,
    workgroupProjectsProcessed,
  };
}

export async function syncProjectMembershipsForWorkgroups(input: {
  actorUserId: string;
  workgroupIds: string[];
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfÃ¼gbar.");
  }

  const firestore = db;
  const uniqueWorkgroupIds = Array.from(
    new Set(input.workgroupIds.map((value) => value.trim()).filter((value) => value.length > 0)),
  );

  if (uniqueWorkgroupIds.length === 0) {
    return {
      workgroupsProcessed: 0,
      projectsProcessed: 0,
      membershipsUpserted: 0,
    };
  }

  let batch = writeBatch(firestore);
  let operationCount = 0;
  let projectsProcessed = 0;
  let membershipsUpserted = 0;

  const commitIfNeeded = async (force = false) => {
    if (!force && operationCount < 350) {
      return;
    }
    if (operationCount === 0) {
      return;
    }
    await batch.commit();
    batch = writeBatch(firestore);
    operationCount = 0;
  };

  for (const workgroupId of uniqueWorkgroupIds) {
    const membershipsSnapshot = await getDocs(
      query(collection(firestore, "workgroup_members"), where("workgroupId", "==", workgroupId)),
    );

    const members = membershipsSnapshot.docs
      .map((membershipDoc) => {
        const data = membershipDoc.data() as Record<string, unknown>;
        const memberUserId = extractMemberUserId(workgroupId, membershipDoc.id, data.userId);
        return {
          userId: memberUserId,
          email: String(data.email ?? "").trim().toLowerCase(),
          role: workgroupRoleToProjectRole(data.role),
        };
      })
      .filter((member) => member.userId.length > 0);

    if (members.length === 0) {
      continue;
    }

    const projectsSnapshot = await getDocs(
      query(collection(firestore, "projects"), where("workgroupId", "==", workgroupId)),
    );

    for (const projectDoc of projectsSnapshot.docs) {
      projectsProcessed += 1;
      const projectId = projectDoc.id;

      for (const member of members) {
        const projectMemberId = `${projectId}_${member.userId}`;
        batch.set(
          doc(collection(firestore, "project_members"), projectMemberId),
          {
            id: projectMemberId,
            projectId,
            userId: member.userId,
            email: member.email,
            role: member.role,
            invitedBy: input.actorUserId,
            joinedAt: now(),
          },
          { merge: true },
        );
        operationCount += 1;
        membershipsUpserted += 1;
      }

      await commitIfNeeded();
    }
  }

  await commitIfNeeded(true);

  return {
    workgroupsProcessed: uniqueWorkgroupIds.length,
    projectsProcessed,
    membershipsUpserted,
  };
}

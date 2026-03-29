import {
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";

function generateCompanyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint32Array(8));

  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

type CreateCompanyInput = {
  userId: string;
  email: string;
  displayName: string;
  companyName: string;
};

export async function createCompanyForOwner({
  userId,
  email,
  displayName,
  companyName,
}: CreateCompanyInput) {
  if (!db) {
    throw new Error("Firebase ist noch nicht für das Web eingerichtet.");
  }

  const companyRef = doc(collection(db, "companies"));
  const companyCode = generateCompanyCode();
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = companyName.trim();
  const trimmedDisplayName = displayName.trim();

  await setDoc(companyRef, {
    id: companyRef.id,
    name: trimmedName,
    code: companyCode,
    ownerId: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, "company_members", `${companyRef.id}_${userId}`), {
    id: `${companyRef.id}_${userId}`,
    companyId: companyRef.id,
    userId,
    email: normalizedEmail,
    displayName: trimmedDisplayName,
    role: "company_owner",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "users", userId),
    {
      companyId: companyRef.id,
      companyName: trimmedName,
      companyCode,
      companyRole: "company_owner",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    companyId: companyRef.id,
    companyCode,
    companyName: trimmedName,
  };
}

type JoinCompanyByCodeInput = {
  userId: string;
  email: string;
  displayName: string;
  companyCode: string;
};

async function syncManageableWorkgroupsToCompany(input: {
  userId: string;
  companyId: string;
  companyName: string;
  companyCode: string;
}) {
  if (!db) {
    return 0;
  }

  const firestore = db;

  const manageableMemberships = await getDocs(
    query(
      collection(firestore, "workgroup_members"),
      where("userId", "==", input.userId),
      where("role", "in", ["owner", "admin"]),
    ),
  );

  if (manageableMemberships.empty) {
    return 0;
  }

  const workgroupIds = Array.from(
    new Set(
      manageableMemberships.docs
        .map((membershipDoc) => String(membershipDoc.data().workgroupId ?? "").trim())
        .filter((workgroupId) => workgroupId.length > 0),
    ),
  );

  if (workgroupIds.length === 0) {
    return 0;
  }

  let linked = 0;
  let operationCount = 0;
  let batch = writeBatch(firestore);

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

  for (const workgroupId of workgroupIds) {
    batch.update(doc(firestore, "workgroups", workgroupId), {
      companyId: input.companyId,
      companyName: input.companyName,
      companyCode: input.companyCode,
      updatedAt: serverTimestamp(),
    });
    operationCount += 1;
    linked += 1;

    const projectsSnapshot = await getDocs(
      query(collection(firestore, "projects"), where("workgroupId", "==", workgroupId)),
    );

    projectsSnapshot.docs.forEach((projectDoc) => {
      batch.update(projectDoc.ref, {
        companyId: input.companyId,
        companyName: input.companyName,
        companyCode: input.companyCode,
        updatedAt: serverTimestamp(),
      });
      operationCount += 1;
    });

    await commitIfNeeded();
  }

  await commitIfNeeded(true);
  return linked;
}

export async function joinCompanyByCode({
  userId,
  email,
  displayName,
  companyCode,
}: JoinCompanyByCodeInput) {
  if (!db) {
    throw new Error("Firebase ist noch nicht fÃ¼r das Web eingerichtet.");
  }

  const normalizedCode = companyCode.trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error("Bitte Firmen-Code eingeben.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Bitte zuerst mit einer gÃ¼ltigen E-Mail anmelden.");
  }

  const companiesSnapshot = await getDocs(
    query(collection(db, "companies"), where("code", "==", normalizedCode), limit(1)),
  );

  if (companiesSnapshot.empty) {
    throw new Error("Firmen-Code ist ungÃ¼ltig.");
  }

  const companyDoc = companiesSnapshot.docs[0];
  const companyData = (companyDoc.data() ?? {}) as Record<string, unknown>;
  const companyName = String(companyData.name ?? "").trim();

  if (!companyName) {
    throw new Error("Firma konnte nicht geladen werden.");
  }

  const userRef = doc(db, "users", userId);
  const userSnapshot = await getDoc(userRef);
  const userData = (userSnapshot.data() ?? {}) as Record<string, unknown>;
  const previousCompanyId = String(userData.companyId ?? "").trim();
  const previousCompanyRole = String(userData.companyRole ?? "").trim().toLowerCase();
  const canDetachPreviousMembership =
    previousCompanyId.length > 0 &&
    previousCompanyId !== companyDoc.id &&
    previousCompanyRole !== "company_owner" &&
    previousCompanyRole !== "company_admin";

  const memberId = `${companyDoc.id}_${userId}`;
  const batch = writeBatch(db);

  if (canDetachPreviousMembership) {
    batch.delete(doc(db, "company_members", `${previousCompanyId}_${userId}`));
  }

  batch.set(
    doc(db, "company_members", memberId),
    {
      id: memberId,
      companyId: companyDoc.id,
      userId,
      email: normalizedEmail,
      displayName: displayName.trim(),
      role: "company_member",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    userRef,
    {
      companyId: companyDoc.id,
      companyName,
      companyCode: normalizedCode,
      companyRole: "company_member",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  const linkedWorkgroups = await syncManageableWorkgroupsToCompany({
    userId,
    companyId: companyDoc.id,
    companyName,
    companyCode: normalizedCode,
  }).catch(() => 0);

  return {
    companyId: companyDoc.id,
    companyCode: normalizedCode,
    companyName,
    linkedWorkgroups,
  };
}

type LeaveCompanyInput = {
  userId: string;
  companyId: string | null;
  companyRole: string | null;
};

export async function leaveCompanyMembership({
  userId,
  companyId,
  companyRole,
}: LeaveCompanyInput) {
  if (!db) {
    throw new Error("Firebase ist noch nicht fÃ¼r das Web eingerichtet.");
  }

  const normalizedCompanyId = String(companyId ?? "").trim();
  if (!normalizedCompanyId) {
    throw new Error("Keine Firma verknÃ¼pft.");
  }

  const normalizedRole = String(companyRole ?? "").trim().toLowerCase();
  if (normalizedRole === "company_owner") {
    throw new Error("Firmenchef kann die Firma hier nicht verlassen.");
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, "company_members", `${normalizedCompanyId}_${userId}`));
  batch.set(
    doc(db, "users", userId),
    {
      companyId: null,
      companyName: "",
      companyCode: "",
      companyRole: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
}

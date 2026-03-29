import { collection, doc, onSnapshot, type FirestoreError } from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { UserProfile } from "@/lib/types";

function parseGlobalRole(value: unknown): UserProfile["globalRole"] {
  return String(value ?? "").toLowerCase() === "superadmin" ? "superadmin" : "user";
}

function parseCompanyRole(value: unknown): UserProfile["companyRole"] {
  const normalized = String(value ?? "").toLowerCase();
  if (
    normalized === "company_owner" ||
    normalized === "company_admin" ||
    normalized === "company_member"
  ) {
    return normalized;
  }

  return null;
}

export function subscribeToUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db || !uid) {
    onData(null);
    return () => undefined;
  }

  return onSnapshot(
    doc(collection(db, "users"), uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }

      const data = (snapshot.data() ?? {}) as Record<string, unknown>;
      onData({
        id: snapshot.id,
        email: String(data.email ?? ""),
        displayName: String(data.displayName ?? ""),
        globalRole: parseGlobalRole(data.globalRole),
        companyId: String(data.companyId ?? "") || null,
        companyName: String(data.companyName ?? ""),
        companyCode: String(data.companyCode ?? ""),
        companyRole: parseCompanyRole(data.companyRole),
      });
    },
    onError,
  );
}

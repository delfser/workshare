import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";

const APP_NOTIFICATIONS_COLLECTION = "app_notifications";

function now() {
  return Timestamp.now();
}

export async function markAllAppNotificationsAsRead(userId: string) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const unreadSnapshot = await getDocs(
    query(
      collection(db, APP_NOTIFICATIONS_COLLECTION),
      where("userId", "==", userId),
      where("readAt", "==", null),
    ),
  );

  if (unreadSnapshot.empty) {
    return 0;
  }

  const batch = writeBatch(db);
  unreadSnapshot.docs.forEach((notificationDoc) => {
    batch.update(notificationDoc.ref, { readAt: now() });
  });
  await batch.commit();
  return unreadSnapshot.size;
}

export async function deleteAppNotification(input: { notificationId: string; userId: string }) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const notificationRef = doc(collection(db, APP_NOTIFICATIONS_COLLECTION), input.notificationId);
  const notificationSnapshot = await getDoc(notificationRef);
  if (!notificationSnapshot.exists()) {
    return;
  }

  const userId = String(notificationSnapshot.data()?.userId ?? "");
  if (userId !== input.userId) {
    throw new Error("Benachrichtigung gehoert nicht zu diesem Benutzer.");
  }

  const batch = writeBatch(db);
  batch.delete(notificationRef);
  await batch.commit();
}

export async function deleteAllAppNotifications(userId: string) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const snapshot = await getDocs(
    query(collection(db, APP_NOTIFICATIONS_COLLECTION), where("userId", "==", userId)),
  );
  if (snapshot.empty) {
    return 0;
  }

  let deleted = 0;
  const chunkSize = 450;
  for (let start = 0; start < snapshot.docs.length; start += chunkSize) {
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + chunkSize).forEach((notificationDoc) => {
      batch.delete(notificationDoc.ref);
      deleted += 1;
    });
    await batch.commit();
  }

  return deleted;
}

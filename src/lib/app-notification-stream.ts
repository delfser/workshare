import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
  type FirestoreError,
} from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { AppNotification } from "@/lib/types";

const APP_NOTIFICATIONS_COLLECTION = "app_notifications";

export function subscribeToUserAppNotifications(
  userId: string,
  onData: (notifications: AppNotification[]) => void,
  onError: (error: FirestoreError) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, APP_NOTIFICATIONS_COLLECTION), where("userId", "==", userId)),
    (snapshot) => {
      const notifications = snapshot.docs
        .map((notificationDoc) => {
          const data = notificationDoc.data() as Record<string, unknown>;
          return {
            id: notificationDoc.id,
            userId: String(data.userId ?? ""),
            title: String(data.title ?? ""),
            message: String(data.message ?? ""),
            type: String(data.type ?? "info"),
            projectId: typeof data.projectId === "string" ? data.projectId : null,
            workgroupId: typeof data.workgroupId === "string" ? data.workgroupId : null,
            createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            readAt: data.readAt instanceof Timestamp ? data.readAt.toDate() : null,
          } satisfies AppNotification;
        })
        .sort((left, right) => {
          const leftMs = left.createdAt ? left.createdAt.getTime() : 0;
          const rightMs = right.createdAt ? right.createdAt.getTime() : 0;
          return rightMs - leftMs;
        })
        .slice(0, 100);

      onData(notifications);
    },
    onError,
  );
}

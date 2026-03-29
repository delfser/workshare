import { Timestamp, collection, deleteDoc, doc, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { WorkLog } from "@/lib/types";

function now() {
  return Timestamp.now();
}

export async function addWorkLog(input: {
  projectId: string;
  hours: number;
  worker: string;
  createdBy: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const workLogRef = doc(collection(db, "work_logs"));
  const timestamp = now();

  await setDoc(workLogRef, {
    id: workLogRef.id,
    projectId: input.projectId,
    hours: input.hours,
    worker: input.worker.trim(),
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function updateWorkLog(input: {
  workLogId: string;
  hours: number;
  worker: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await setDoc(
    doc(collection(db, "work_logs"), input.workLogId),
    {
      hours: input.hours,
      worker: input.worker.trim(),
      updatedAt: now(),
    },
    { merge: true },
  );
}

export async function deleteWorkLog(workLogId: WorkLog["id"]) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await deleteDoc(doc(collection(db, "work_logs"), workLogId));
}

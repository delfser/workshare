import { Timestamp, collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase-client";
import type { ProjectNote } from "@/lib/types";

function now() {
  return Timestamp.now();
}

export async function addNote(input: {
  projectId: string;
  text: string;
  createdBy: string;
}) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  const noteRef = doc(collection(db, "project_notes"));
  const timestamp = now();

  await setDoc(noteRef, {
    id: noteRef.id,
    projectId: input.projectId,
    text: input.text.trim(),
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function deleteNote(noteId: ProjectNote["id"]) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await deleteDoc(doc(collection(db, "project_notes"), noteId));
}

export async function updateNote(input: { noteId: ProjectNote["id"]; text: string }) {
  if (!db) {
    throw new Error("Firestore ist nicht verfügbar.");
  }

  await updateDoc(doc(collection(db, "project_notes"), input.noteId), {
    text: input.text.trim(),
    updatedAt: now(),
  });
}

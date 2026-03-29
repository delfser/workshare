"use client";

import { useEffect, useState } from "react";

import { addNote, updateNote } from "@/lib/note-actions";
import type { ProjectNote } from "@/lib/types";

import styles from "./project-detail.module.css";

type NoteEditorProps = {
  projectId: string;
  userId: string;
  note?: ProjectNote | null;
  onClose: () => void;
};

export function NoteEditor({ projectId, userId, note = null, onClose }: NoteEditorProps) {
  const [text, setText] = useState(note?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(note);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedText = text.trim();
    if (!trimmedText) {
      setError("Bitte eine Notiz eingeben.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (note) {
        await updateNote({
          noteId: note.id,
          text: trimmedText,
        });
      } else {
        await addNote({
          projectId,
          text: trimmedText,
          createdBy: userId,
        });
      }
      onClose();
    } catch {
      setError(
        isEditing
          ? "Notiz konnte im Web gerade nicht aktualisiert werden."
          : "Notiz konnte im Web gerade nicht gespeichert werden.",
      );
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? "Notiz bearbeiten" : "Notiz anlegen"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Web Editor</p>
            <h3>{isEditing ? "Notiz bearbeiten" : "Notiz anlegen"}</h3>
          </div>
          <button
            type="button"
            className={styles.closeIconButton}
            onClick={onClose}
            disabled={busy}
            aria-label="Schließen"
            title="Schließen"
          >
            <svg viewBox="0 0 24 24" className={styles.inlineIcon} aria-hidden="true">
              <path
                d="M6 6l12 12M18 6l-12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <form className={styles.formGrid} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Notiz</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Projektinfo, Erinnerung oder kurzer Status..."
              className={styles.textarea}
              rows={6}
              disabled={busy}
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.modalActions}>
            <span className={styles.subtle}>Notizen erscheinen sofort live in der Projektansicht.</span>

            <div className={styles.modalActionGroup}>
              <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
                Abbrechen
              </button>
              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {busy ? "Speichert..." : isEditing ? "Aktualisieren" : "Speichern"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

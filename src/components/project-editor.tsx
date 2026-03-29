"use client";

import { useEffect, useState } from "react";

import { deleteProject, setProjectArchived, updateProject } from "@/lib/project-actions";
import type { ProjectRecord } from "@/lib/types";

import styles from "./project-detail.module.css";

type ProjectEditorProps = {
  project: ProjectRecord;
  canArchive: boolean;
  canDelete: boolean;
  onClose: () => void;
  onDeleted?: () => void;
};

export function ProjectEditor({
  project,
  canArchive,
  canDelete,
  onClose,
  onDeleted,
}: ProjectEditorProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

    if (!name.trim()) {
      setError("Bitte einen Projektnamen eingeben.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await updateProject({
        projectId: project.id,
        name,
        description,
      });
      onClose();
    } catch {
      setError("Projekt konnte im Web gerade nicht gespeichert werden.");
      setBusy(false);
    }
  }

  async function handleArchiveToggle() {
    if (!canArchive) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await setProjectArchived({
        projectId: project.id,
        archived: !project.archived,
      });
      onClose();
    } catch {
      setError("Projektstatus konnte im Web gerade nicht geaendert werden.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!canDelete) {
      return;
    }

    const confirmed = window.confirm(
      "Projekt wirklich löschen? Alle Material-, Mitglieder-, Notiz-, Foto- und Arbeitszeitdaten werden entfernt.",
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await deleteProject(project.id);
      onDeleted?.();
      onClose();
    } catch {
      setError("Projekt konnte im Web gerade nicht gelöscht werden.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Projekt bearbeiten"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Web Editor</p>
            <h3>Projekt bearbeiten</h3>
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
            <span>Projektname</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Projektname"
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span>Beschreibung</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optionale Projektbeschreibung"
              className={styles.textarea}
              rows={5}
              disabled={busy}
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.modalActions}>
            {canArchive || canDelete ? (
              <div className={styles.modalActionGroup}>
                {canArchive ? (
                  <button
                    type="button"
                    className={project.archived ? styles.ghostButton : styles.dangerButton}
                    onClick={handleArchiveToggle}
                    disabled={busy}
                  >
                    {project.archived ? "Projekt aktivieren" : "Projekt archivieren"}
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={busy}>
                    Projekt löschen
                  </button>
                ) : null}
              </div>
            ) : (
              <span className={styles.subtle}>
                Dein aktueller Zugriff erlaubt nur das Bearbeiten der Projektdaten.
              </span>
            )}

            <div className={styles.modalActionGroup}>
              <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
                Abbrechen
              </button>
              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {busy ? "Speichert..." : "Speichern"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

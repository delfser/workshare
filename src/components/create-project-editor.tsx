"use client";

import { useEffect, useState } from "react";

import { createProject } from "@/lib/project-actions";
import type { MaterialSortMode, WorkgroupSummary } from "@/lib/types";

import styles from "./project-detail.module.css";

type CreateProjectEditorProps = {
  userId: string;
  email: string;
  companyId?: string | null;
  companyName?: string | null;
  companyCode?: string | null;
  workgroups: WorkgroupSummary[];
  onClose: () => void;
  onCreated: (projectId: string) => void;
};

export function CreateProjectEditor({
  userId,
  email,
  companyId,
  companyName,
  companyCode,
  workgroups,
  onClose,
  onCreated,
}: CreateProjectEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workgroupId, setWorkgroupId] = useState(workgroups[0]?.id ?? "none");
  const [materialSortMode, setMaterialSortMode] = useState<MaterialSortMode>("input");
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

  const selectedWorkgroupId =
    workgroupId === "none"
      ? "none"
      : workgroups.some((workgroup) => workgroup.id === workgroupId)
        ? workgroupId
        : workgroups[0]?.id ?? "none";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Bitte einen Projektnamen eingeben.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await createProject({
        userId,
        email,
        name,
        description,
        companyId,
        companyName,
        companyCode,
        workgroupId: selectedWorkgroupId === "none" ? null : selectedWorkgroupId,
        materialSortMode,
      });
      onCreated(result.id);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Projekt konnte im Web gerade nicht angelegt werden.",
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
        aria-label="Projekt anlegen"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Web Editor</p>
            <h3>Projekt anlegen</h3>
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
              placeholder="Neues Projekt"
              disabled={busy}
              autoFocus
            />
          </label>

          <label className={styles.field}>
            <span>Beschreibung</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optionale Projektbeschreibung"
              className={styles.textarea}
              rows={4}
              disabled={busy}
            />
          </label>

          <div className={styles.inlineFields}>
            <label className={styles.field}>
              <span>Partie</span>
              <select
                value={selectedWorkgroupId}
                onChange={(event) => setWorkgroupId(event.target.value)}
                disabled={busy}
              >
                <option value="none">Ohne Partie</option>
                {workgroups.map((workgroup) => (
                  <option key={workgroup.id} value={workgroup.id}>
                    {workgroup.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Material-Sortierung</span>
              <select
                value={materialSortMode}
                onChange={(event) => setMaterialSortMode(event.target.value as MaterialSortMode)}
                disabled={busy}
              >
                <option value="input">Nach Eingabe</option>
                <option value="alphabetical">Alphabetisch</option>
              </select>
            </label>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.modalActions}>
            <span className={styles.subtle}>
              Nach dem Anlegen landest du direkt in der Projektdetailseite.
            </span>

            <div className={styles.modalActionGroup}>
              <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
                Abbrechen
              </button>
              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {busy ? "Projekt wird erstellt..." : "Projekt anlegen"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

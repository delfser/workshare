"use client";

import { useEffect, useState } from "react";

import { addWorkLog, updateWorkLog } from "@/lib/worklog-actions";
import type { WorkLog } from "@/lib/types";

import styles from "./project-detail.module.css";

type WorkLogEditorProps = {
  projectId: string;
  userId: string;
  workLog?: WorkLog;
  onClose: () => void;
};

export function WorkLogEditor({
  projectId,
  userId,
  workLog,
  onClose,
}: WorkLogEditorProps) {
  const [hours, setHours] = useState(workLog ? String(workLog.hours).replace(".", ",") : "");
  const [worker, setWorker] = useState(workLog?.worker ?? "");
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

    const parsedHours = Number(hours.replace(",", "."));
    const trimmedWorker = worker.trim();

    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError("Bitte gültige Stunden größer als 0 eingeben.");
      return;
    }

    if (!trimmedWorker) {
      setError("Bitte einen Arbeiter eintragen.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (workLog) {
        await updateWorkLog({
          workLogId: workLog.id,
          hours: parsedHours,
          worker: trimmedWorker,
        });
      } else {
        await addWorkLog({
          projectId,
          hours: parsedHours,
          worker: trimmedWorker,
          createdBy: userId,
        });
      }
      onClose();
    } catch {
      setError("Arbeitszeit konnte im Web gerade nicht gespeichert werden.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={workLog ? "Arbeitszeit bearbeiten" : "Arbeitszeit anlegen"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Web Editor</p>
            <h3>{workLog ? "Arbeitszeit bearbeiten" : "Arbeitszeit anlegen"}</h3>
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
          <div className={styles.inlineFields}>
            <label className={styles.field}>
              <span>Stunden</span>
              <input
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                placeholder="2,5"
                inputMode="decimal"
                disabled={busy}
              />
            </label>

            <label className={styles.field}>
              <span>Arbeiter</span>
              <input
                value={worker}
                onChange={(event) => setWorker(event.target.value)}
                placeholder="Max Mustermann"
                disabled={busy}
              />
            </label>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.modalActions}>
            <span className={styles.subtle}>Arbeitszeiten erscheinen sofort live in der Projektansicht.</span>

            <div className={styles.modalActionGroup}>
              <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
                Abbrechen
              </button>
              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {busy ? "Speichert..." : workLog ? "Aendern" : "Speichern"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

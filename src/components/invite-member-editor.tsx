"use client";

import { useEffect, useState } from "react";

import { inviteMember } from "@/lib/member-actions";
import type { ProjectRole } from "@/lib/types";

import styles from "./project-detail.module.css";

type InviteMemberEditorProps = {
  projectId: string;
  projectName: string;
  userId: string;
  onClose: () => void;
};

const roles: Array<{ value: Exclude<ProjectRole, "owner">; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "worker", label: "Worker" },
  { value: "viewer", label: "Viewer" },
];

export function InviteMemberEditor({
  projectId,
  projectName,
  userId,
  onClose,
}: InviteMemberEditorProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("worker");
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

    const trimmedEmail = email.trim();
    const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail);

    if (!validEmail) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await inviteMember({
        projectId,
        projectName,
        email: trimmedEmail,
        role,
        invitedBy: userId,
      });
      onClose();
    } catch {
      setError("Einladung konnte im Web gerade nicht gesendet werden.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Mitglied einladen"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Web Editor</p>
            <h3>Mitglied einladen</h3>
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
            <span>E-Mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@firma.at"
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span>Rolle</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Exclude<ProjectRole, "owner">)}
              disabled={busy}
            >
              {roles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.modalActions}>
            <span className={styles.subtle}>
              Die Einladung wird direkt als Firestore-Eintrag für die App angelegt.
            </span>

            <div className={styles.modalActionGroup}>
              <button type="button" className={styles.ghostButton} onClick={onClose} disabled={busy}>
                Abbrechen
              </button>
              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {busy ? "Sendet..." : "Einladung senden"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

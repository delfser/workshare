"use client";

import { useEffect, useState } from "react";

import {
  createCatalogEntry,
  deleteCatalogEntry,
  updateCatalogEntry,
} from "@/lib/catalog-actions";
import type { CatalogEntry, WorkgroupSummary } from "@/lib/types";

import styles from "./app-shell.module.css";

const units = ["stk", "m", "cm", "pkg", "set"];

type CatalogEntryEditorProps = {
  userId: string;
  workgroups: WorkgroupSummary[];
  entry: CatalogEntry | null;
  onClose: () => void;
};

export function CatalogEntryEditor({
  userId,
  workgroups,
  entry,
  onClose,
}: CatalogEntryEditorProps) {
  const [name, setName] = useState(entry?.name ?? "");
  const [unit, setUnit] = useState(entry?.unit ?? "stk");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [isActive, setIsActive] = useState(entry?.isActive ?? true);
  const [workgroupId, setWorkgroupId] = useState(entry?.workgroupId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isEdit = Boolean(entry);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte einen Namen eingeben.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (entry) {
        await updateCatalogEntry({
          entryId: entry.id,
          name: trimmedName,
          unit,
          category,
          isActive,
        });
      } else {
        await createCatalogEntry({
          name: trimmedName,
          unit,
          category,
          createdBy: userId,
          workgroupId: workgroupId || null,
        });
      }

      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Katalogeintrag konnte nicht gespeichert werden.",
      );
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!entry) {
      return;
    }

    const confirmed = window.confirm(`"${entry.name}" wirklich löschen?`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await deleteCatalogEntry(entry.id);
      onClose();
    } catch {
      setError("Katalogeintrag konnte nicht gelöscht werden.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Katalogeintrag bearbeiten" : "Katalogeintrag anlegen"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.kicker}>Katalog</p>
            <h3>{isEdit ? "Eintrag bearbeiten" : "Eintrag anlegen"}</h3>
          </div>
          <button
            type="button"
            className={styles.modalCloseIconButton}
            onClick={onClose}
            disabled={busy}
            aria-label="Schließen"
            title="Schließen"
          >
            <svg
              viewBox="0 0 24 24"
              className={styles.actionIcon}
              aria-hidden="true"
            >
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

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="z. B. Kabel 5x1.5mm2"
              disabled={busy}
            />
          </label>

          <div className={styles.inlineFields}>
            <label className={styles.field}>
              <span>Einheit</span>
              <select value={unit} onChange={(event) => setUnit(event.target.value)} disabled={busy}>
                {units.map((unitOption) => (
                  <option key={unitOption} value={unitOption}>
                    {unitOption}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Kategorie</span>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="optional"
                disabled={busy}
              />
            </label>
          </div>

          {!isEdit ? (
            <label className={styles.field}>
              <span>Partie</span>
              <select
                value={workgroupId}
                onChange={(event) => setWorkgroupId(event.target.value)}
                disabled={busy}
              >
                <option value="">Keine Partie</option>
                {workgroups.map((workgroup) => (
                  <option key={workgroup.id} value={workgroup.id}>
                    {workgroup.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isEdit ? (
            <label className={styles.fieldToggle}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                disabled={busy}
              />
              <span>Aktiv</span>
            </label>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.modalActions}>
            {isEdit ? (
              <button
                type="button"
                className={styles.cardActionDanger}
                onClick={handleDelete}
                disabled={busy}
              >
                Löschen
              </button>
            ) : (
              <span className={styles.subtle}>Einträge sind sofort im Materialformular verfügbar.</span>
            )}
            <div className={styles.modalActionGroup}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onClose}
                disabled={busy}
              >
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

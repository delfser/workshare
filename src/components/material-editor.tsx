"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";

import {
  addMaterial,
  deleteMaterial,
  updateMaterial,
} from "@/lib/material-actions";
import { searchCatalogEntriesByPrefix } from "@/lib/catalog-actions";
import type { CatalogEntry, MaterialItem } from "@/lib/types";

import styles from "./project-detail.module.css";

const units = ["stk", "m", "cm", "pkg", "set"];

type MaterialEditorProps = {
  projectId: string;
  userId: string;
  workgroupId?: string | null;
  material?: MaterialItem | null;
  onClose: () => void;
};

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toLocaleString("de-AT", {
    maximumFractionDigits: 2,
  });
}

export function MaterialEditor({
  projectId,
  userId,
  workgroupId = null,
  material,
  onClose,
}: MaterialEditorProps) {
  const [name, setName] = useState(material?.name ?? "");
  const [quantity, setQuantity] = useState(
    material ? formatNumber(material.quantity) : "",
  );
  const [unit, setUnit] = useState(material?.unit ?? "stk");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogHints, setCatalogHints] = useState<CatalogEntry[]>([]);
  const catalogListId = useId();

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, onClose]);

  useEffect(() => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || busy) {
      setCatalogHints([]);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchCatalogEntriesByPrefix({
          userId,
          prefix: trimmedName,
          workgroupId,
        });
        setCatalogHints(results);
      } catch {
        setCatalogHints([]);
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [busy, name, userId, workgroupId]);

  function handleNameChange(nextValue: string) {
    setName(nextValue);
    const normalized = nextValue.trim().toLowerCase();
    const matched = catalogHints.find(
      (item) => item.name.trim().toLowerCase() === normalized,
    );
    if (matched && matched.unit) {
      setUnit(matched.unit);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const parsedQuantity = Number(quantity.replace(",", "."));

    if (!trimmedName) {
      setError("Bitte einen Materialnamen eingeben.");
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Bitte eine gültige Menge größer als 0 eingeben.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (material) {
        await updateMaterial({
          materialId: material.id,
          name: trimmedName,
          quantity: parsedQuantity,
          unit,
        });
      } else {
        await addMaterial({
          projectId,
          name: trimmedName,
          quantity: parsedQuantity,
          unit,
          createdBy: userId,
        });
      }

      onClose();
    } catch {
      setError("Material konnte im Web gerade nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!material) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await deleteMaterial(material.id);
      onClose();
    } catch {
      setError("Material konnte im Web gerade nicht gelöscht werden.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={`${styles.modal} ${styles.materialEditorModal}`}
        role="dialog"
        aria-modal="true"
        aria-label={material ? "Material bearbeiten" : "Material anlegen"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.editorTopbar}>
          <button
            type="button"
            className={styles.mobileTopIcon}
            onClick={onClose}
            disabled={busy}
            aria-label="Zurück"
            title="Zurück"
          >
            <svg viewBox="0 0 24 24" className={styles.inlineIcon} aria-hidden="true">
              <path
                d="M15 5l-7 7l7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Image src="/workshare-logo.png" alt="WorkShare" width={28} height={28} className={styles.logo} />
          <h2 className={styles.editorTopTitle}>WorkShare</h2>
        </div>

        <form className={styles.formGrid} onSubmit={handleSubmit}>
          <section className={styles.formCard}>
            <h3>Materialinformationen</h3>
            <label className={styles.field}>
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Name"
                list={catalogListId}
                disabled={busy}
              />
              <datalist id={catalogListId}>
                {catalogHints.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </label>
          </section>

          <section className={styles.formCard}>
            <h3>Details</h3>
            <div className={styles.inlineFields}>
              <label className={styles.field}>
                <span>Menge</span>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="1"
                  inputMode="decimal"
                  disabled={busy}
                />
              </label>

              <label className={styles.field}>
                <span>Einheit</span>
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  disabled={busy}
                >
                  {units.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.editorSaveRow}>
            {material ? (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDelete}
                disabled={busy}
              >
                Löschen
              </button>
            ) : (
              <span />
            )}

            <div className={styles.modalActionGroup}>
              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {busy ? "speichert..." : "speichern"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

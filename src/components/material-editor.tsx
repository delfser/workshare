"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  addMaterial,
  deleteMaterial,
  updateMaterial,
} from "@/lib/material-actions";
import type { CatalogEntry, MaterialItem } from "@/lib/types";

import styles from "./project-detail.module.css";

const units = ["stk", "m", "cm", "pkg", "set"];

type MaterialEditorProps = {
  projectId: string;
  userId: string;
  workgroupId?: string | null;
  catalogEntries?: CatalogEntry[];
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
  catalogEntries = [],
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
  const [catalogHintsOpen, setCatalogHintsOpen] = useState(false);
  const closeHintsTimeoutRef = useRef<number | null>(null);

  function clearCloseHintsTimeout() {
    if (closeHintsTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(closeHintsTimeoutRef.current);
    closeHintsTimeoutRef.current = null;
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, onClose]);

  useEffect(
    () => () => {
      clearCloseHintsTimeout();
    },
    [],
  );

  useEffect(() => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || busy) {
      setCatalogHints([]);
      setCatalogHintsOpen(false);
      return;
    }

    const normalizedPrefix = trimmedName.toLowerCase();
    const normalizedWorkgroupId = (workgroupId ?? "").trim();
    const localMatchesRaw = catalogEntries
      .filter((entry) => {
        if (!entry.isActive) {
          return false;
        }

        const ownerMatch = entry.createdBy === userId && entry.workgroupId === null;
        const workgroupMatch =
          normalizedWorkgroupId.length > 0 && entry.workgroupId === normalizedWorkgroupId;
        if (!ownerMatch && !workgroupMatch) {
          return false;
        }

        const key = (entry.nameLower || entry.name).trim().toLowerCase();
        return key.startsWith(normalizedPrefix);
      })
      .sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));

    const deduped = new Map<string, CatalogEntry>();
    localMatchesRaw.forEach((entry) => {
      const key = `${(entry.nameLower || entry.name).trim().toLowerCase()}|${entry.unit.trim().toLowerCase()}`;
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    });

    const localMatches = [...deduped.values()].slice(0, 12);

    if (localMatches.length > 0) {
      setCatalogHints(localMatches);
      setCatalogHintsOpen(true);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setCatalogHints([]);
      setCatalogHintsOpen(false);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [busy, catalogEntries, name, userId, workgroupId]);

  function handleNameChange(nextValue: string) {
    setName(nextValue);
    const normalized = nextValue.trim().toLowerCase();
    const matched = catalogHints.find(
      (item) => item.name.trim().toLowerCase() === normalized,
    );
    if (matched && matched.unit) {
      setUnit(matched.unit);
    }

    if (normalized.length < 2) {
      setCatalogHintsOpen(false);
      return;
    }

    setCatalogHintsOpen(true);
  }

  function handleCatalogHintSelect(entry: CatalogEntry) {
    setName(entry.name);
    if (entry.unit) {
      setUnit(entry.unit);
    }
    setCatalogHintsOpen(false);
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
                onFocus={() => {
                  if (catalogHints.length > 0 && name.trim().length >= 2) {
                    clearCloseHintsTimeout();
                    setCatalogHintsOpen(true);
                  }
                }}
                onBlur={() => {
                  clearCloseHintsTimeout();
                  closeHintsTimeoutRef.current = window.setTimeout(() => {
                    setCatalogHintsOpen(false);
                  }, 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setCatalogHintsOpen(false);
                  }
                }}
                placeholder="Name"
                autoComplete="off"
                disabled={busy}
              />
            </label>
            {catalogHintsOpen && catalogHints.length > 0 ? (
              <ul className={styles.catalogHintList} role="listbox" aria-label="Katalogvorschlaege">
                {catalogHints.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={styles.catalogHintButton}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleCatalogHintSelect(item)}
                    >
                      <span>{item.name}</span>
                      <small>{item.unit}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
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

"use client";

import { useEffect } from "react";

import type { ProjectPhoto } from "@/lib/types";

import styles from "./project-detail.module.css";

type PhotoViewerProps = {
  photos: ProjectPhoto[];
  activeIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
};

function formatDate(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function PhotoViewer({
  photos,
  activeIndex,
  onClose,
  onNext,
  onPrevious,
}: PhotoViewerProps) {
  const photo = photos[activeIndex];

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowRight") {
        onNext();
      }
      if (event.key === "ArrowLeft") {
        onPrevious();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose, onNext, onPrevious]);

  if (!photo) {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.viewer}
        role="dialog"
        aria-modal="true"
        aria-label="Fotoansicht"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.viewerHeader}>
          <div>
            <p className={styles.kicker}>Fotoansicht</p>
            <h3>
              Bild {activeIndex + 1} von {photos.length}
            </h3>
            <p className={styles.subtle}>
              Status {photo.uploadStatus} · Aktualisiert {formatDate(photo.updatedAt)}
            </p>
          </div>

          <div className={styles.viewerActions}>
            {photo.downloadUrl ? (
              <a href={photo.downloadUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>
                Download
              </a>
            ) : null}
            <button
              type="button"
              className={styles.closeIconButton}
              onClick={onClose}
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
        </header>

        <div className={styles.viewerBody}>
          <button
            type="button"
            className={styles.viewerNav}
            onClick={onPrevious}
            aria-label="Vorheriges Foto"
          >
            ‹
          </button>

          <div className={styles.viewerImageFrame}>
            {photo.downloadUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.downloadUrl} alt="Projektfoto" className={styles.viewerImage} />
            ) : (
          <div className={styles.viewerFallback}>Bild noch nicht verfügbar</div>
            )}
          </div>

          <button type="button" className={styles.viewerNav} onClick={onNext} aria-label="Naechstes Foto">
            ›
          </button>
        </div>
      </section>
    </div>
  );
}

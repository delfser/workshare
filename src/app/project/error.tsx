"use client";

import Link from "next/link";
import { useEffect } from "react";

import styles from "@/components/project-detail.module.css";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project route error:", error);
  }, [error]);

  return (
    <main className={styles.shell}>
      <section className={styles.layout}>
        <section className={styles.panel}>
          <p className={styles.kicker}>WorkShare Web</p>
          <h1>Projektseite konnte nicht geladen werden</h1>
          <p className={styles.subtle}>
            Bitte Seite neu laden. Falls der Fehler bleibt, zurück zur Projektzentrale wechseln.
          </p>
          <div className={styles.headerActions}>
            <button type="button" className={styles.primaryButton} onClick={reset}>
              Neu laden
            </button>
            <Link href="/" className={styles.backButton}>
              Zur Projektzentrale
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ProjectDetail } from "./project-detail";
import styles from "./project-detail.module.css";

export function ProjectDetailEntry() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id")?.trim() ?? "";

  if (!projectId) {
    return (
      <main className={styles.shell}>
        <section className={styles.layout}>
          <section className={styles.panel}>
            <p className={styles.kicker}>WorkShare Web</p>
            <h1>Projekt nicht ausgewählt</h1>
            <p className={styles.subtle}>
              Öffne ein Projekt aus der Übersicht oder rufe diese Seite mit einer
              Projekt-ID auf.
            </p>
            <div className={styles.headerActions}>
              <Link href="/" className={styles.backButton}>
                Zur Projektzentrale
              </Link>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return <ProjectDetail projectId={projectId} />;
}

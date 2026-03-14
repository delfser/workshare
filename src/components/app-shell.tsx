"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";

import { auth } from "@/lib/firebase-client";
import { hasFirebaseConfig } from "@/lib/firebase-config";
import { subscribeToUserProjects } from "@/lib/project-stream";
import type { ProjectSummary } from "@/lib/types";

import styles from "./app-shell.module.css";

function formatProjectDate(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function translateAuthError(code: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Die Anmeldedaten sind nicht korrekt.";
    case "auth/invalid-email":
      return "Bitte eine gueltige E-Mail-Adresse eingeben.";
    case "auth/too-many-requests":
      return "Zu viele Versuche. Bitte spaeter erneut probieren.";
    default:
      return "Anmeldung aktuell nicht moeglich. Bitte Firebase-Konfiguration pruefen.";
  }
}

export function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setProjectsLoading(false);
      setProjectError("");
      return;
    }

    setProjectsLoading(true);
    setProjectError("");

    return subscribeToUserProjects(
      user.uid,
      (nextProjects) => {
        setProjects(nextProjects);
        setProjectsLoading(false);
      },
      () => {
        setProjectError("Projektdaten konnten im Web gerade nicht geladen werden.");
        setProjectsLoading(false);
      },
    );
  }, [user]);

  const visibleProjects = projects.filter((project) =>
    activeOnly ? !project.archived : project.archived,
  );

  const activeCount = projects.filter((project) => !project.archived).length;
  const archivedCount = projects.filter((project) => project.archived).length;

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      setAuthError("Firebase ist noch nicht fuer das Web eingerichtet.");
      return;
    }

    setIsSubmitting(true);
    setAuthError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      const firebaseError = error as FirebaseError;
      setAuthError(translateAuthError(firebaseError.code));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    if (!auth) {
      return;
    }

    await signOut(auth);
  }

  if (!hasFirebaseConfig) {
    return (
      <main className={styles.shell}>
        <section className={styles.setupCard}>
          <div className={styles.brandRow}>
            <Image
              src="/workshare-logo.png"
              alt="WorkShare"
              width={78}
              height={78}
              className={styles.logo}
            />
            <div>
              <p className={styles.kicker}>WorkShare Web</p>
              <h1>Webzugang vorbereiten</h1>
            </div>
          </div>
          <p className={styles.setupText}>
            Fuer das Webinterface braucht Firebase noch eine eigene Web-App.
            Danach kommen die Werte in `.env.local`.
          </p>
          <div className={styles.codeBlock}>
            <p>NEXT_PUBLIC_FIREBASE_API_KEY=...</p>
            <p>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...</p>
            <p>NEXT_PUBLIC_FIREBASE_PROJECT_ID=workshare-41953</p>
            <p>NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...</p>
            <p>NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...</p>
            <p>NEXT_PUBLIC_FIREBASE_APP_ID=...</p>
          </div>
          <p className={styles.setupHint}>
            Die mobile App bleibt dabei unveraendert. Das Webprojekt haengt sich
            nur an dieselben Daten.
          </p>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className={styles.shell}>
        <section className={styles.centerCard}>
          <p className={styles.kicker}>WorkShare Web</p>
          <h1>Authentifizierung wird vorbereitet</h1>
          <p className={styles.subtle}>Die Sitzung wird im Hintergrund geladen.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.shell}>
        <section className={styles.loginCard}>
          <div className={styles.brandRow}>
            <Image
              src="/workshare-logo.png"
              alt="WorkShare"
              width={84}
              height={84}
              className={styles.logo}
            />
            <div>
              <p className={styles.kicker}>Desktop-Zentrale</p>
              <h1>WorkShare Web</h1>
              <p className={styles.subtle}>
                Sichere Browser-Oberflaeche fuer Projekte, Teamrollen und
                Materiallisten.
              </p>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleLogin}>
            <label className={styles.field}>
              <span>E-Mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="chef@firma.at"
                autoComplete="email"
              />
            </label>

            <label className={styles.field}>
              <span>Passwort</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Passwort"
                autoComplete="current-password"
              />
            </label>

            {authError ? <p className={styles.error}>{authError}</p> : null}

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Anmeldung laeuft..." : "Einloggen"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Image
              src="/workshare-logo.png"
              alt="WorkShare"
              width={70}
              height={70}
              className={styles.logo}
            />
            <div>
              <p className={styles.kicker}>WorkShare Web</p>
              <h1>Projektzentrale</h1>
              <p className={styles.subtle}>
                Eingeloggt als {user.email ?? "unbekannter Benutzer"}
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={activeOnly ? styles.segmentActive : styles.segment}
              onClick={() => setActiveOnly(true)}
            >
              Aktiv
            </button>
            <button
              type="button"
              className={!activeOnly ? styles.segmentActive : styles.segment}
              onClick={() => setActiveOnly(false)}
            >
              Archiv
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className={styles.metrics}>
          <article className={styles.metricCard}>
            <span>Aktive Projekte</span>
            <strong>{activeCount}</strong>
          </article>
          <article className={styles.metricCard}>
            <span>Archivierte Projekte</span>
            <strong>{archivedCount}</strong>
          </article>
          <article className={styles.metricCard}>
            <span>Ansicht</span>
            <strong>{activeOnly ? "Aktiv" : "Archiv"}</strong>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>Phase 1</p>
              <h2>Projektliste mit Live-Daten</h2>
            </div>
            <p className={styles.subtle}>
              Zunaechst read-only, damit die mobile Testphase stabil bleibt.
            </p>
          </div>

          {projectError ? <p className={styles.error}>{projectError}</p> : null}

          {projectsLoading ? (
            <p className={styles.subtle}>Projekte werden geladen...</p>
          ) : visibleProjects.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Keine Projekte in dieser Ansicht</h3>
              <p>
                Sobald Projekte in der App vorhanden sind und dein Benutzer
                Mitglied ist, erscheinen sie hier automatisch.
              </p>
            </div>
          ) : (
            <div className={styles.projectGrid}>
              {visibleProjects.map((project) => (
                <article key={project.id} className={styles.projectCard}>
                  <div className={styles.projectTop}>
                    <div>
                      <h3>{project.name || "Unbenanntes Projekt"}</h3>
                      <p className={styles.subtle}>
                        Rolle {project.role} · Code{" "}
                        {project.projectCode?.trim() || "-"}
                      </p>
                    </div>
                    <span
                      className={
                        project.archived ? styles.badgeMuted : styles.badge
                      }
                    >
                      {project.archived ? "Archiviert" : "Aktiv"}
                    </span>
                  </div>

                  {project.description ? (
                    <p className={styles.description}>{project.description}</p>
                  ) : null}

                  <dl className={styles.projectMeta}>
                    <div>
                      <dt>Erstellt</dt>
                      <dd>{formatProjectDate(project.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Aktualisiert</dt>
                      <dd>{formatProjectDate(project.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Sortierung</dt>
                      <dd>
                        {project.materialSortMode === "alphabetical"
                          ? "A-Z"
                          : "Eingabe"}
                      </dd>
                    </div>
                    <div>
                      <dt>Mitglied</dt>
                      <dd>{project.memberEmail}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

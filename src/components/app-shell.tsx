"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { CatalogEntryEditor } from "@/components/catalog-entry-editor";
import {
  deleteCatalogEntry,
  importFixedSampleCatalog,
  unloadFixedSampleCatalog,
} from "@/lib/catalog-actions";
import {
  deleteAllAppNotifications,
  deleteAppNotification,
  markAllAppNotificationsAsRead,
} from "@/lib/app-notification-actions";
import { subscribeToUserAppNotifications } from "@/lib/app-notification-stream";
import { subscribeToCatalogEntries } from "@/lib/catalog-stream";
import { auth, db } from "@/lib/firebase-client";
import { hasFirebaseConfig } from "@/lib/firebase-config";
import {
  createCompanyForOwner,
  joinCompanyByCode,
  leaveCompanyMembership,
} from "@/lib/company-actions";
import {
  subscribeToCompanyProjects,
  subscribeToCompanyWorkgroups,
} from "@/lib/company-stream";
import {
  acceptInvitation,
  cleanupResolvedInvitations,
  declineInvitation,
} from "@/lib/invitation-actions";
import { subscribeToPendingInvitations } from "@/lib/invitation-stream";
import {
  deleteProject,
  joinProjectByCode,
  repairProjectMembershipsForUser,
  setProjectArchived,
} from "@/lib/project-actions";
import { canManageMembers, isSuperuser } from "@/lib/project-permissions";
import { subscribeToUserProjects } from "@/lib/project-stream";
import { subscribeToUserProfile } from "@/lib/user-profile-stream";
import {
  createWorkgroup,
  deleteWorkgroup,
  inviteToWorkgroup,
  joinWorkgroupByCode,
  leaveWorkgroup,
  linkWorkgroupToCompanyByCode,
} from "@/lib/workgroup-actions";
import { subscribeToUserWorkgroups } from "@/lib/workgroup-stream";
import type {
  CatalogEntry,
  AppNotification,
  InvitationSummary,
  ProjectSummary,
  UserProfile,
  WorkgroupSummary,
} from "@/lib/types";

import { CreateProjectEditor } from "./create-project-editor";
import { ProjectEditor } from "./project-editor";
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

function formatInvitationDate(value: Date | null) {
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

function canManageWorkgroup(role: WorkgroupSummary["role"]) {
  return role === "owner" || role === "admin";
}

function formatRoleLabel(role: string) {
  if (!role) {
    return "-";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function translateAuthError(code: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Die Anmeldedaten sind nicht korrekt.";
    case "auth/invalid-email":
      return "Bitte eine g\u00FCltige E-Mail-Adresse eingeben.";
    case "auth/email-already-in-use":
      return "Zu dieser E-Mail gibt es bereits ein Konto.";
    case "auth/weak-password":
      return "Das Passwort muss mindestens 6 Zeichen haben.";
    case "auth/too-many-requests":
      return "Zu viele Versuche. Bitte sp\u00E4ter erneut probieren.";
    default:
      return "Anmeldung aktuell nicht m\u00F6glich. Bitte Firebase-Konfiguration pr\u00FCfen.";
  }
}

function formatCompanyRole(role: UserProfile["companyRole"]) {
  switch (role) {
    case "company_owner":
      return "Firmenchef";
    case "company_admin":
      return "Firmenadmin";
    case "company_member":
      return "Firmenmitglied";
    default:
      return "";
  }
}

function canSeeCompanyScope(profile: UserProfile | null) {
  if (!profile?.companyId) {
    return false;
  }

  return profile.companyRole === "company_owner" || profile.companyRole === "company_admin";
}

function mergeWorkgroupLists(
  directWorkgroups: WorkgroupSummary[],
  companyWorkgroups: WorkgroupSummary[],
) {
  const merged = new Map<string, WorkgroupSummary>();

  companyWorkgroups.forEach((workgroup) => {
    merged.set(workgroup.id, workgroup);
  });

  directWorkgroups.forEach((workgroup) => {
    merged.set(workgroup.id, workgroup);
  });

  return [...merged.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
  );
}

function mergeProjectLists(directProjects: ProjectSummary[], companyProjects: ProjectSummary[]) {
  const merged = new Map<string, ProjectSummary>();

  companyProjects.forEach((project) => {
    merged.set(project.id, project);
  });

  directProjects.forEach((project) => {
    merged.set(project.id, project);
  });

  return [...merged.values()].sort((left, right) => {
    const leftTime = left.updatedAt?.getTime() ?? 0;
    const rightTime = right.updatedAt?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

type AppSection = "projects" | "notifications" | "workgroups" | "catalog" | "settings";
type AuthMode = "login" | "register" | "company-register" | "reset";

type ProjectListItemProps = {
  project: ProjectSummary;
  workgroupName: string;
  canManageProject: boolean;
  canDeleteProject: boolean;
  onEdit: (project: ProjectSummary) => void;
  onArchiveToggle: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
};

const ProjectListItem = memo(
  function ProjectListItem({
    project,
    workgroupName,
    canManageProject,
    canDeleteProject,
    onEdit,
    onArchiveToggle,
    onDelete,
  }: ProjectListItemProps) {
    return (
      <article className={styles.projectCard}>
          <div className={styles.projectRow}>
            <Link
              href={`/project/?id=${encodeURIComponent(project.id)}`}
              className={styles.projectLink}
            >
              <div className={styles.projectMain}>
                <h3>{project.name || "Unbenanntes Projekt"}</h3>
                <p className={styles.projectInfoLine}>Rolle: {formatRoleLabel(project.role)}</p>
                <p className={styles.projectInfoLine}>Code: {project.projectCode?.trim() || "-"}</p>
                <p className={styles.projectGroup}>Partie {workgroupName}</p>
              </div>
            </Link>

            <div className={styles.projectTimeline}>
              <span>Erstellt {formatProjectDate(project.createdAt)}</span>
              <span>Aktualisiert {formatProjectDate(project.updatedAt)}</span>
            </div>

            <aside className={styles.projectControls}>
              {canManageProject ? (
                <div className={styles.projectActions}>
                  <button
                    type="button"
                    className={styles.projectOverflowButton}
                    aria-label="Projekt bearbeiten"
                    title="Projekt bearbeiten"
                    onClick={() => onEdit(project)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                      <path
                        d="M12 5.5a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 0 1 0-3.4zm0 5.6a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 0 1 0-3.4zm0 5.6a1.7 1.7 0 1 1 0 3.4a1.7 1.7 0 0 1 0-3.4z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <div className={styles.desktopProjectActions}>
                  <button
                    type="button"
                    className={styles.cardActionIcon}
                    aria-label="Projekt bearbeiten"
                    title="Projekt bearbeiten"
                    onClick={() => onEdit(project)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                      <path
                        d="M4 20h4l10-10-4-4L4 16v4z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 6l4 4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.cardActionIcon}
                    aria-label={project.archived ? "Projekt aktivieren" : "Projekt archivieren"}
                    title={project.archived ? "Projekt aktivieren" : "Projekt archivieren"}
                    onClick={() => onArchiveToggle(project)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                      <path
                        d="M4 7h16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M6 7h12v11H6z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M10 11h4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  {canDeleteProject ? (
                    <button
                      type="button"
                      className={styles.cardActionIconDanger}
                      aria-label="Projekt löschen"
                      title="Projekt löschen"
                      onClick={() => onDelete(project)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                        <path
                          d="M5 7h14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9 7V5h6v2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M7 7l1 12h8l1-12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                  </div>
                </div>
              ) : null}

              <span className={project.archived ? styles.badgeMuted : styles.badge}>
                {project.archived ? "Archiviert" : "Aktiv"}
              </span>
            </aside>
          </div>
      </article>
    );
  },
  (prevProps, nextProps) =>
    prevProps.project === nextProps.project &&
    prevProps.workgroupName === nextProps.workgroupName &&
    prevProps.canManageProject === nextProps.canManageProject &&
    prevProps.canDeleteProject === nextProps.canDeleteProject,
);

export function AppShell() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [companyProjects, setCompanyProjects] = useState<ProjectSummary[]>([]);
  const [workgroups, setWorkgroups] = useState<WorkgroupSummary[]>([]);
  const [companyWorkgroups, setCompanyWorkgroups] = useState<WorkgroupSummary[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<InvitationSummary[]>([]);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationsInfo, setNotificationsInfo] = useState("");
  const [isMarkingNotificationsRead, setIsMarkingNotificationsRead] = useState(false);
  const [isDeletingNotifications, setIsDeletingNotifications] = useState(false);
  const [isLoadingSampleCatalog, setIsLoadingSampleCatalog] = useState(false);
  const [isUnloadingSampleCatalog, setIsUnloadingSampleCatalog] = useState(false);
  const [sampleCatalogInfo, setSampleCatalogInfo] = useState("");
  const [sampleCatalogError, setSampleCatalogError] = useState("");
  const [newWorkgroupName, setNewWorkgroupName] = useState("");
  const [workgroupCreateError, setWorkgroupCreateError] = useState("");
  const [workgroupCreateInfo, setWorkgroupCreateInfo] = useState("");
  const [isCreatingWorkgroup, setIsCreatingWorkgroup] = useState(false);
  const [editingCatalogEntry, setEditingCatalogEntry] = useState<CatalogEntry | null>(null);
  const [isCreatingCatalogEntry, setIsCreatingCatalogEntry] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [projectSearch, setProjectSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedWorkgroupId, setSelectedWorkgroupId] = useState("all");
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [projectError, setProjectError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectActionError, setProjectActionError] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [invitationInfo, setInvitationInfo] = useState("");
  const [activeSection, setActiveSection] = useState<AppSection>("projects");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinInfo, setJoinInfo] = useState("");
  const [isJoiningWorkgroup, setIsJoiningWorkgroup] = useState(false);
  const [workgroupInviteEmail, setWorkgroupInviteEmail] = useState("");
  const [selectedInviteWorkgroupId, setSelectedInviteWorkgroupId] = useState("");
  const [workgroupInviteError, setWorkgroupInviteError] = useState("");
  const [workgroupInviteInfo, setWorkgroupInviteInfo] = useState("");
  const [isSendingWorkgroupInvite, setIsSendingWorkgroupInvite] = useState(false);
  const [companyLinkCode, setCompanyLinkCode] = useState("");
  const [selectedCompanyLinkWorkgroupId, setSelectedCompanyLinkWorkgroupId] = useState("");
  const [companyLinkError, setCompanyLinkError] = useState("");
  const [companyLinkInfo, setCompanyLinkInfo] = useState("");
  const [isLinkingWorkgroupToCompany, setIsLinkingWorkgroupToCompany] = useState(false);
  const [companyCodeFallback, setCompanyCodeFallback] = useState("");
  const [profileCompanyCode, setProfileCompanyCode] = useState("");
  const [profileCompanyCodeError, setProfileCompanyCodeError] = useState("");
  const [profileCompanyCodeInfo, setProfileCompanyCodeInfo] = useState("");
  const [isSavingProfileCompanyCode, setIsSavingProfileCompanyCode] = useState(false);
  const [isLeavingCompany, setIsLeavingCompany] = useState(false);
  const [companyScopeError, setCompanyScopeError] = useState("");
  const [isLeavingWorkgroupId, setIsLeavingWorkgroupId] = useState("");
  const [isDeletingWorkgroupId, setIsDeletingWorkgroupId] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isProjectJoinOpen, setIsProjectJoinOpen] = useState(false);
  const [projectJoinCode, setProjectJoinCode] = useState("");
  const [projectJoinError, setProjectJoinError] = useState("");
  const [projectJoinInfo, setProjectJoinInfo] = useState("");
  const [isJoiningProject, setIsJoiningProject] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [isRepairingProjectMemberships, setIsRepairingProjectMemberships] = useState(false);
  const [projectMembershipRepairError, setProjectMembershipRepairError] = useState("");
  const [projectMembershipRepairInfo, setProjectMembershipRepairInfo] = useState("");

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
      setCompanyProjects([]);
      setWorkgroups([]);
      setCompanyWorkgroups([]);
      setPendingInvitations([]);
      setAppNotifications([]);
      setCatalogEntries([]);
      setCatalogLoading(false);
      setCatalogError("");
      setNotificationsError("");
      setNotificationsInfo("");
      setSampleCatalogError("");
      setSampleCatalogInfo("");
      setWorkgroupCreateError("");
      setWorkgroupCreateInfo("");
      setCompanyLinkError("");
      setCompanyLinkInfo("");
      setCompanyCodeFallback("");
      setProfileCompanyCode("");
      setProfileCompanyCodeError("");
      setProfileCompanyCodeInfo("");
      setIsSavingProfileCompanyCode(false);
      setIsLeavingCompany(false);
      setCompanyScopeError("");
      setUserProfile(null);
      setProjectsLoading(false);
      setProjectError("");
      setIsRepairingProjectMemberships(false);
      setProjectMembershipRepairError("");
      setProjectMembershipRepairInfo("");
      return;
    }

    setProjectsLoading(true);
    setProjectError("");

    return subscribeToUserProjects(
      user.uid,
      (nextProjects) => {
        setProjects(nextProjects);
        setProjectError("");
        setProjectsLoading(false);
      },
      () => {
        setProjectError("Projektdaten konnten im Web gerade nicht geladen werden.");
        setProjectsLoading(false);
      },
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    return subscribeToUserProfile(
      user.uid,
      (nextProfile) => setUserProfile(nextProfile),
      () => undefined,
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    return subscribeToUserWorkgroups(
      user.uid,
      (nextWorkgroups) => setWorkgroups(nextWorkgroups),
      () => undefined,
    );
  }, [user]);

  useEffect(() => {
    if (!user || !userProfile?.companyId || !canSeeCompanyScope(userProfile)) {
      setCompanyWorkgroups([]);
      return;
    }

    return subscribeToCompanyWorkgroups(
      userProfile.companyId,
      (nextWorkgroups) => {
        setCompanyWorkgroups(nextWorkgroups);
        setCompanyScopeError("");
      },
      () => {
        setCompanyScopeError("Firmen-Partien konnten gerade nicht geladen werden.");
      },
    );
  }, [user, userProfile?.companyId, userProfile?.companyRole]);

  useEffect(() => {
    if (!user || !userProfile?.companyId || !canSeeCompanyScope(userProfile)) {
      setCompanyProjects([]);
      return;
    }

    return subscribeToCompanyProjects(
      userProfile.companyId,
      user.email ?? "",
      (nextProjects) => {
        setCompanyProjects(nextProjects);
        setCompanyScopeError("");
      },
      () => {
        setCompanyScopeError("Firmen-Projekte konnten gerade nicht geladen werden.");
      },
    );
  }, [user, user?.email, userProfile?.companyId, userProfile?.companyRole]);

  useEffect(() => {
    if (!user?.email) {
      setPendingInvitations([]);
      setInvitationError("");
      return;
    }

    return subscribeToPendingInvitations(
      user.email,
      (nextInvitations) => {
        setPendingInvitations(nextInvitations);
        setInvitationError("");
      },
      () => {
        setInvitationError("Einladungen konnten gerade nicht geladen werden.");
      },
    );
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAppNotifications([]);
      setNotificationsError("");
      return;
    }

    return subscribeToUserAppNotifications(
      user.uid,
      (nextNotifications) => {
        setAppNotifications(nextNotifications);
        setNotificationsError("");
      },
      () => {
        setNotificationsError("Benachrichtigungen konnten gerade nicht geladen werden.");
      },
    );
  }, [user]);

  useEffect(() => {
    const userEmail = user?.email ?? "";
    if (!userEmail) {
      return;
    }

    let cancelled = false;

    async function runCleanup() {
      try {
        await cleanupResolvedInvitations({
          email: userEmail,
        });
      } catch {
        if (!cancelled) {
          // Cleanup should stay silent and never block the dashboard.
        }
      }
    }

    void runCleanup();
    const intervalId = window.setInterval(runCleanup, 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.email]);

  useEffect(() => {
    setSelectedWorkgroupId("all");
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setCatalogLoading(true);
    setCatalogError("");

    return subscribeToCatalogEntries(
      user.uid,
      workgroups.map((item) => item.id),
      (nextEntries) => {
        setCatalogEntries(nextEntries);
        setCatalogLoading(false);
        setCatalogError("");
      },
      () => {
        setCatalogLoading(false);
        setCatalogError("Katalog konnte im Web gerade nicht geladen werden.");
      },
    );
  }, [user, workgroups]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextSection = new URLSearchParams(window.location.search).get("section");
    if (
      nextSection === "projects" ||
      nextSection === "notifications" ||
      nextSection === "workgroups" ||
      nextSection === "catalog" ||
      nextSection === "settings"
    ) {
      setActiveSection(nextSection);
    }
  }, []);

  useEffect(() => {
    if (activeSection !== "projects") {
      setSearchOpen(false);
      setProjectSearch("");
      return;
    }

    setActiveOnly(true);
  }, [activeSection]);

  useEffect(() => {
    if (typeof window === "undefined" || activeSection !== "projects") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSection, selectedWorkgroupId, activeOnly, projectSearch, projects.length]);

  const hasSuperuserAccess = isSuperuser(userProfile?.globalRole);
  const hasCompanyScopeAccess = canSeeCompanyScope(userProfile);
  const canEditOwnCompanyCode =
    !hasSuperuserAccess &&
    userProfile?.companyRole !== "company_owner" &&
    userProfile?.companyRole !== "company_admin";
  const projectsForView = hasCompanyScopeAccess
    ? mergeProjectLists(projects, companyProjects)
    : projects;
  const workgroupsForView = hasCompanyScopeAccess
    ? mergeWorkgroupLists(workgroups, companyWorkgroups)
    : workgroups;

  useEffect(() => {
    const manageableWorkgroup = workgroups.find((workgroup) =>
      hasSuperuserAccess || canManageWorkgroup(workgroup.role),
    );
    setSelectedInviteWorkgroupId(manageableWorkgroup?.id ?? "");
  }, [hasSuperuserAccess, workgroups]);

  useEffect(() => {
    const manageableWorkgroup = workgroups.find((workgroup) =>
      hasSuperuserAccess || canManageWorkgroup(workgroup.role),
    );
    setSelectedCompanyLinkWorkgroupId(manageableWorkgroup?.id ?? "");
    if (userProfile?.companyCode && !companyLinkCode) {
      setCompanyLinkCode(userProfile.companyCode);
    }
  }, [companyLinkCode, hasSuperuserAccess, userProfile?.companyCode, workgroups]);

  useEffect(() => {
    setProfileCompanyCode((userProfile?.companyCode ?? "").toUpperCase());
  }, [userProfile?.companyCode]);

  useEffect(() => {
    if (!db || !userProfile?.companyId) {
      setCompanyCodeFallback("");
      return;
    }

    if ((userProfile.companyCode ?? "").trim().length > 0) {
      setCompanyCodeFallback(userProfile.companyCode.trim().toUpperCase());
      return;
    }

    let cancelled = false;

    void getDoc(doc(db, "companies", userProfile.companyId))
      .then((companySnapshot) => {
        if (cancelled || !companySnapshot.exists()) {
          return;
        }

        const nextCode = String(companySnapshot.data()?.code ?? "").trim().toUpperCase();
        if (!nextCode) {
          return;
        }

        setCompanyCodeFallback(nextCode);
        setProfileCompanyCode((previous) => (previous.trim().length > 0 ? previous : nextCode));
        setCompanyLinkCode((previous) => (previous.trim().length > 0 ? previous : nextCode));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [userProfile?.companyCode, userProfile?.companyId]);

  const workgroupMap = new Map(workgroupsForView.map((item) => [item.id, item] as const));
  const manageableWorkgroups = workgroups.filter((workgroup) =>
    hasSuperuserAccess || canManageWorkgroup(workgroup.role),
  );
  const pendingInvitationCount = pendingInvitations.length;
  const unreadAppNotificationCount = appNotifications.filter((item) => item.readAt === null).length;
  const notificationDotVisible = unreadAppNotificationCount > 0 || pendingInvitationCount > 0;
  const companyRoleLabel = formatCompanyRole(userProfile?.companyRole ?? null);
  const canLeaveCompany =
    Boolean(userProfile?.companyId) &&
    userProfile?.companyRole !== "company_owner" &&
    !hasSuperuserAccess;
  const resolvedCompanyCode = (
    profileCompanyCode ||
    userProfile?.companyCode ||
    companyCodeFallback
  )
    .trim()
    .toUpperCase();
  const normalizedProjectSearch = projectSearch.trim().toLowerCase();
  const visibleProjects = projectsForView.filter((project) => {
    const archiveMatch = activeOnly ? !project.archived : project.archived;
    const workgroupMatch =
      selectedWorkgroupId === "all"
        ? true
        : selectedWorkgroupId === "none"
          ? !project.workgroupId
          : project.workgroupId === selectedWorkgroupId;
    const searchMatch =
      normalizedProjectSearch.length === 0
        ? true
        : project.name.toLowerCase().includes(normalizedProjectSearch);

    return archiveMatch && workgroupMatch && searchMatch;
  });

  const activeCount = projectsForView.filter((project) => !project.archived).length;
  const archivedCount = projectsForView.filter((project) => project.archived).length;
  const deferredProjects = useDeferredValue(visibleProjects);
  const deferredCatalogEntries = useDeferredValue(catalogEntries);
  const deferredInvitations = useDeferredValue(pendingInvitations);
  const deferredWorkgroups = useDeferredValue(workgroupsForView);
  const projectListRefreshing = deferredProjects !== visibleProjects;

  useEffect(() => {
    if (selectedWorkgroupId === "all" || selectedWorkgroupId === "none") {
      return;
    }

    const workgroupExists = workgroupsForView.some((workgroup) => workgroup.id === selectedWorkgroupId);
    if (!workgroupExists) {
      setSelectedWorkgroupId("all");
    }
  }, [selectedWorkgroupId, workgroupsForView]);

  useEffect(() => {
    if (!user || activeSection !== "notifications" || unreadAppNotificationCount === 0) {
      return;
    }

    void markAllAppNotificationsAsRead(user.uid).catch(() => undefined);
  }, [activeSection, unreadAppNotificationCount, user]);

  function switchAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setAuthError("");
    setAuthInfo("");
    setPassword("");
    if (nextMode !== "company-register") {
      setCompanyName("");
    }
  }

  async function persistUserProfile(
    userId: string,
    nextEmail: string,
    nextDisplayName: string,
  ) {
    if (!db) {
      throw new Error("Firebase ist noch nicht f\u00FCr das Web eingerichtet.");
    }

    const firestore = db;

    await setDoc(
      doc(firestore, "users", userId),
      {
        id: userId,
        email: nextEmail.trim().toLowerCase(),
        displayName: nextDisplayName.trim(),
        globalRole: "user",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      setAuthError("Firebase ist noch nicht f\u00FCr das Web eingerichtet.");
      return;
    }

    setIsSubmitting(true);
    setAuthError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      const firebaseError = error as FirebaseError;
      setAuthError(
        firebaseError.code
          ? translateAuthError(firebaseError.code)
          : error instanceof Error
            ? error.message
            : "Firmenkonto konnte gerade nicht angelegt werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !db) {
      setAuthError("Firebase ist noch nicht f\u00FCr das Web eingerichtet.");
      return;
    }

    if (!displayName.trim()) {
      setAuthError("Bitte einen Namen f\u00FCr das Konto eingeben.");
      return;
    }

    setIsSubmitting(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

      await updateProfile(credential.user, {
        displayName: displayName.trim(),
      });

      await persistUserProfile(credential.user.uid, email, displayName);

      try {
        await sendEmailVerification(credential.user);
      } catch {
        // Verification mail is helpful, but should not block signup.
      }

      setAuthInfo(
        "Konto erstellt. Falls aktiviert, wurde eine Verifizierungs-Mail gesendet.",
      );
    } catch (error) {
      const firebaseError = error as FirebaseError;
      setAuthError(
        firebaseError.code
          ? translateAuthError(firebaseError.code)
          : error instanceof Error
            ? error.message
            : "Firmenkonto konnte gerade nicht angelegt werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompanyRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !db) {
      setAuthError("Firebase ist noch nicht f\u00FCr das Web eingerichtet.");
      return;
    }

    if (!displayName.trim()) {
      setAuthError("Bitte einen Namen f\u00FCr das Konto eingeben.");
      return;
    }

    if (!companyName.trim()) {
      setAuthError("Bitte einen Firmennamen eingeben.");
      return;
    }

    setIsSubmitting(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

      await updateProfile(credential.user, {
        displayName: displayName.trim(),
      });

      await persistUserProfile(credential.user.uid, email, displayName);

      const company = await createCompanyForOwner({
        userId: credential.user.uid,
        email,
        displayName,
        companyName,
      });

      try {
        await sendEmailVerification(credential.user);
      } catch {
        // Verification mail is helpful, but should not block signup.
      }

      setAuthInfo(
        `Firma angelegt. ${company.companyName} ist jetzt mit dem Konto verkn\u00FCpft.`,
      );
    } catch (error) {
      const firebaseError = error as FirebaseError;
      setAuthError(translateAuthError(firebaseError.code));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      setAuthError("Firebase ist noch nicht f\u00FCr das Web eingerichtet.");
      return;
    }

    setIsSubmitting(true);
    setAuthError("");
    setAuthInfo("");

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthInfo(
        "Wenn die Adresse vorhanden ist, wurde eine Mail zum Zur\u00FCcksetzen gesendet.",
      );
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

  async function handleInvitationAccept(invitation: InvitationSummary) {
    if (!user?.email) {
      return;
    }

    try {
      setInvitationError("");
      setInvitationInfo("");
      await acceptInvitation({
        invitationId: invitation.id,
        userId: user.uid,
        email: user.email,
      });
      setInvitationInfo("Einladung angenommen.");
    } catch (error) {
      setInvitationError(
        error instanceof Error ? error.message : "Einladung konnte nicht angenommen werden.",
      );
    }
  }

  async function handleInvitationDecline(invitationId: string) {
    try {
      setInvitationError("");
      setInvitationInfo("");
      await declineInvitation(invitationId);
      setInvitationInfo("Einladung abgelehnt.");
    } catch {
      setInvitationError("Einladung konnte nicht abgelehnt werden.");
    }
  }

  async function handleJoinWorkgroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.email) {
      return;
    }

    try {
      setIsJoiningWorkgroup(true);
      setJoinError("");
      setJoinInfo("");
      await joinWorkgroupByCode({
        code: joinCode,
        userId: user.uid,
        email: user.email,
      });
      setJoinCode("");
      setJoinInfo("Workgroup beigetreten.");
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "Workgroup-Beitritt fehlgeschlagen.",
      );
    } finally {
      setIsJoiningWorkgroup(false);
    }
  }

  async function handleJoinProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.email) {
      return;
    }

    try {
      setIsJoiningProject(true);
      setProjectJoinError("");
      setProjectJoinInfo("");

      const result = await joinProjectByCode({
        code: projectJoinCode,
        userId: user.uid,
        email: user.email,
      });

      if (result.status === "already_member") {
        setProjectJoinInfo("Du bist bereits Mitglied in diesem Projekt.");
      } else {
        setProjectJoinInfo("Projekt erfolgreich beigetreten.");
      }

      setProjectJoinCode("");
      setIsProjectJoinOpen(false);
      router.push(`/project/?id=${encodeURIComponent(result.projectId)}`);
    } catch (error) {
      setProjectJoinError(
        error instanceof Error ? error.message : "Projektbeitritt fehlgeschlagen.",
      );
    } finally {
      setIsJoiningProject(false);
    }
  }

  async function handleMarkAllNotificationsRead() {
    if (!user) {
      return;
    }

    try {
      setIsMarkingNotificationsRead(true);
      setNotificationsError("");
      setNotificationsInfo("");
      const changed = await markAllAppNotificationsAsRead(user.uid);
      setNotificationsInfo(changed > 0 ? "Alle Benachrichtigungen wurden gelesen." : "Keine neuen Benachrichtigungen.");
    } catch {
      setNotificationsError("Benachrichtigungen konnten nicht als gelesen markiert werden.");
    } finally {
      setIsMarkingNotificationsRead(false);
    }
  }

  async function handleDeleteNotification(notificationId: string) {
    if (!user) {
      return;
    }

    try {
      setNotificationsError("");
      setNotificationsInfo("");
      await deleteAppNotification({ notificationId, userId: user.uid });
    } catch {
      setNotificationsError("Benachrichtigung konnte nicht gelöscht werden.");
    }
  }

  async function handleDeleteAllNotifications() {
    if (!user) {
      return;
    }

    const confirmed = window.confirm("Alle Benachrichtigungen wirklich löschen?");
    if (!confirmed) {
      return;
    }

    try {
      setIsDeletingNotifications(true);
      setNotificationsError("");
      setNotificationsInfo("");
      const deleted = await deleteAllAppNotifications(user.uid);
      setNotificationsInfo(deleted > 0 ? `${deleted} Benachrichtigungen gelöscht.` : "Keine Benachrichtigungen vorhanden.");
    } catch {
      setNotificationsError("Benachrichtigungen konnten nicht gelöscht werden.");
    } finally {
      setIsDeletingNotifications(false);
    }
  }

  async function handleCreateWorkgroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.email) {
      return;
    }

    try {
      setIsCreatingWorkgroup(true);
      setWorkgroupCreateError("");
      setWorkgroupCreateInfo("");
      const result = await createWorkgroup({
        ownerId: user.uid,
        ownerEmail: user.email,
        name: newWorkgroupName,
      });
      setNewWorkgroupName("");
      setSelectedInviteWorkgroupId(result.id);
      setWorkgroupCreateInfo(`Workgroup erstellt. Code: ${result.joinCode}`);
    } catch (error) {
      setWorkgroupCreateError(
        error instanceof Error ? error.message : "Workgroup konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreatingWorkgroup(false);
    }
  }

  async function handleLoadSampleCatalog() {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      "Beispielkatalog laden? Bestehende Einträge bleiben erhalten.",
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsLoadingSampleCatalog(true);
      setSampleCatalogError("");
      setSampleCatalogInfo("");
      const result = await importFixedSampleCatalog({ userId: user.uid });
      setSampleCatalogInfo(
        `Beispielkatalog geladen: ${result.inserted} hinzugefügt, ${result.skipped} übersprungen.`,
      );
    } catch {
      setSampleCatalogError("Beispielkatalog konnte nicht geladen werden.");
    } finally {
      setIsLoadingSampleCatalog(false);
    }
  }

  async function handleUnloadSampleCatalog() {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      "Beispielkatalog entladen? Nur Beispiel-Einträge werden entfernt.",
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsUnloadingSampleCatalog(true);
      setSampleCatalogError("");
      setSampleCatalogInfo("");
      const result = await unloadFixedSampleCatalog({ userId: user.uid });
      setSampleCatalogInfo(`Beispielkatalog entladen: ${result.removed} entfernt.`);
    } catch {
      setSampleCatalogError("Beispielkatalog konnte nicht entladen werden.");
    } finally {
      setIsUnloadingSampleCatalog(false);
    }
  }

  async function handleWorkgroupInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetWorkgroup = manageableWorkgroups.find(
      (workgroup) => workgroup.id === selectedInviteWorkgroupId,
    );

    if (!targetWorkgroup || !user) {
      setWorkgroupInviteError("Bitte zuerst eine Workgroup ausw\u00E4hlen.");
      return;
    }

    try {
      setIsSendingWorkgroupInvite(true);
      setWorkgroupInviteError("");
      setWorkgroupInviteInfo("");
      await inviteToWorkgroup({
        workgroupId: targetWorkgroup.id,
        workgroupName: targetWorkgroup.name,
        email: workgroupInviteEmail,
        invitedBy: user.uid,
      });
      setWorkgroupInviteEmail("");
      setWorkgroupInviteInfo(
        "Einladung gespeichert. Sie erscheint nach dem Login im Web oder in der App unter Einladungen.",
      );
    } catch (error) {
      setWorkgroupInviteError(
        error instanceof Error ? error.message : "Workgroup-Einladung konnte nicht erstellt werden.",
      );
    } finally {
      setIsSendingWorkgroupInvite(false);
    }
  }

  async function handleLinkWorkgroupToCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    if (!selectedCompanyLinkWorkgroupId) {
      setCompanyLinkError("Bitte zuerst eine Partie auswählen.");
      return;
    }

    if (!companyLinkCode.trim()) {
      setCompanyLinkError("Bitte Firmen-Code eingeben.");
      return;
    }

    try {
      setIsLinkingWorkgroupToCompany(true);
      setCompanyLinkError("");
      setCompanyLinkInfo("");

      const result = await linkWorkgroupToCompanyByCode({
        workgroupId: selectedCompanyLinkWorkgroupId,
        requesterId: user.uid,
        companyCode: companyLinkCode,
      });

      setCompanyLinkCode(result.companyCode);
      setCompanyLinkInfo(`Partie ist jetzt mit ${result.companyName} verknüpft.`);
    } catch (error) {
      setCompanyLinkError(
        error instanceof Error
          ? error.message
          : "Partie konnte nicht mit der Firma verknüpft werden.",
      );
    } finally {
      setIsLinkingWorkgroupToCompany(false);
    }
  }

  async function handleSaveProfileCompanyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !db) {
      setProfileCompanyCodeError("Firebase ist noch nicht fuer das Web eingerichtet.");
      return;
    }

    const normalizedCompanyCode = profileCompanyCode.trim().toUpperCase();
    if (!normalizedCompanyCode) {
      setProfileCompanyCodeError("Bitte Firmen-Code eingeben.");
      return;
    }

    if (!(user.email ?? "").trim()) {
      setProfileCompanyCodeError("Bitte zuerst mit einer gültigen E-Mail anmelden.");
      return;
    }

    try {
      setIsSavingProfileCompanyCode(true);
      setProfileCompanyCodeError("");
      setProfileCompanyCodeInfo("");

      const result = await joinCompanyByCode({
        userId: user.uid,
        email: user.email ?? "",
        displayName: user.displayName || userProfile?.displayName || "",
        companyCode: normalizedCompanyCode,
      });

      setProfileCompanyCode(result.companyCode);
      setCompanyLinkCode(result.companyCode);
      setProfileCompanyCodeInfo(
        result.linkedWorkgroups > 0
          ? `Firma verbunden: ${result.companyName}. ${result.linkedWorkgroups} Partien verknuepft.`
          : `Firma verbunden: ${result.companyName}`,
      );
    } catch (error) {
      setProfileCompanyCodeError(
        error instanceof Error
          ? error.message
          : "Firma konnte nicht verbunden werden.",
      );
    } finally {
      setIsSavingProfileCompanyCode(false);
    }
  }

  async function handleLeaveCompany() {
    if (!user || !userProfile?.companyId) {
      return;
    }

    const confirmed = window.confirm("Firma wirklich verlassen?");
    if (!confirmed) {
      return;
    }

    try {
      setIsLeavingCompany(true);
      setProfileCompanyCodeError("");
      setProfileCompanyCodeInfo("");

      await leaveCompanyMembership({
        userId: user.uid,
        companyId: userProfile.companyId,
        companyRole: userProfile.companyRole ?? null,
      });

      setProfileCompanyCode("");
      setCompanyLinkCode("");
      setCompanyCodeFallback("");
      setProfileCompanyCodeInfo("Firma wurde verlassen.");
    } catch (error) {
      setProfileCompanyCodeError(
        error instanceof Error ? error.message : "Firma konnte nicht verlassen werden.",
      );
    } finally {
      setIsLeavingCompany(false);
    }
  }

  async function handleRepairProjectMemberships() {
    if (!user) {
      return;
    }

    const normalizedEmail = (user.email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      setProjectMembershipRepairError("Bitte mit einer gueltigen E-Mail anmelden.");
      return;
    }

    try {
      setIsRepairingProjectMemberships(true);
      setProjectMembershipRepairError("");
      setProjectMembershipRepairInfo("");

      const result = await repairProjectMembershipsForUser({
        userId: user.uid,
        email: normalizedEmail,
        managedWorkgroupIds: manageableWorkgroups.map((workgroup) => workgroup.id),
      });

      setProjectMembershipRepairInfo(
        `Sync abgeschlossen: ${result.membershipsChecked} geprueft, ${result.membershipsNormalized} normalisiert, ${result.staleMembershipsRemoved} entfernt, ${result.membershipsAddedFromWorkgroups} aus Partien ergaenzt, ${result.workgroupMembershipsSynced} Team-Mitgliedschaften in ${result.workgroupProjectsProcessed} Projekten aktualisiert.`,
      );
    } catch (error) {
      setProjectMembershipRepairError(
        error instanceof Error
          ? error.message
          : "Projekt-Mitgliedschaften konnten nicht repariert werden.",
      );
    } finally {
      setIsRepairingProjectMemberships(false);
    }
  }

  async function handleArchiveToggle(project: ProjectSummary) {
    try {
      setProjectActionError("");
      await setProjectArchived({
        projectId: project.id,
        archived: !project.archived,
      });
    } catch {
      setProjectActionError(
        "Projektstatus konnte in der \u00DCbersicht gerade nicht ge\u00E4ndert werden.",
      );
    }
  }

  async function handleDeleteProject(project: ProjectSummary) {
    const confirmed = window.confirm(
      `Projekt "${project.name || "Unbenanntes Projekt"}" wirklich l\u00F6schen? Alle zugeh\u00F6rigen Daten werden entfernt.`, 
    );
    if (!confirmed) {
      return;
    }

    try {
      setProjectActionError("");
      await deleteProject(project.id);
    } catch {
      setProjectActionError(
        "Projekt konnte in der \u00DCbersicht gerade nicht gel\u00F6scht werden.",
      );
    }
  }

  async function handleLeaveWorkgroup(workgroup: WorkgroupSummary) {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      `Soll "${workgroup.name}" wirklich verlassen werden? Du wirst dabei aus allen Projekten dieser Partie entfernt.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsLeavingWorkgroupId(workgroup.id);
      setWorkgroupInviteError("");
      setWorkgroupInviteInfo("");
      await leaveWorkgroup({
        workgroupId: workgroup.id,
        userId: user.uid,
      });
      setWorkgroupInviteInfo(
        "Workgroup verlassen. Der Benutzer wurde auch aus den zugeh\u00F6rigen Projekten entfernt.",
      );
      startTransition(() => {
        setSelectedWorkgroupId("all");
      });
    } catch (error) {
      setWorkgroupInviteError(
        error instanceof Error ? error.message : "Workgroup konnte nicht verlassen werden.",
      );
    } finally {
      setIsLeavingWorkgroupId("");
    }
  }

  async function handleDeleteWorkgroup(workgroup: WorkgroupSummary) {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      `Workgroup "${workgroup.name}" wirklich löschen? Alle Mitglieder und alle Projekte dieser Partie werden entfernt.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsDeletingWorkgroupId(workgroup.id);
      setWorkgroupInviteError("");
      setWorkgroupInviteInfo("");
      await deleteWorkgroup({
        workgroupId: workgroup.id,
        requesterId: user.uid,
      });
      setWorkgroupInviteInfo(
        "Workgroup gelöscht. Alle zugehörigen Projekte und Mitgliedschaften wurden entfernt.",
      );
      startTransition(() => {
        if (selectedWorkgroupId === workgroup.id) {
          setSelectedWorkgroupId("all");
        }
      });
      if (selectedInviteWorkgroupId === workgroup.id) {
        setSelectedInviteWorkgroupId("");
      }
      if (selectedCompanyLinkWorkgroupId === workgroup.id) {
        setSelectedCompanyLinkWorkgroupId("");
      }
    } catch (error) {
      setWorkgroupInviteError(
        error instanceof Error ? error.message : "Workgroup konnte nicht gelöscht werden.",
      );
    } finally {
      setIsDeletingWorkgroupId("");
    }
  }

  async function handleDeleteCatalogEntry(entry: CatalogEntry) {
    const confirmed = window.confirm(`Katalogeintrag "${entry.name}" wirklich löschen?`);
    if (!confirmed) {
      return;
    }

    try {
      setCatalogError("");
      await deleteCatalogEntry(entry.id);
    } catch {
      setCatalogError("Katalogeintrag konnte im Web gerade nicht gelöscht werden.");
    }
  }

  function handleProjectCreated(projectId: string) {
    setIsCreatingProject(false);
    startTransition(() => {
      setActiveSection("projects");
      setActiveOnly(true);
    });
    router.push(`/project/?id=${encodeURIComponent(projectId)}`);
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
            {"F\u00FCr das Webinterface braucht Firebase noch eine eigene Web-App. Danach kommen die Werte in `.env.local`."}

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
            {"Die mobile App bleibt dabei unver\u00E4ndert. Das Webprojekt h\u00E4ngt sich nur an dieselben Daten."}

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
                {"Sichere Browser-Oberfl\u00E4che f\u00FCr Projekte, Teamrollen und Materiallisten."}

              </p>
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={
              authMode === "login"
                ? handleLogin
                : authMode === "register"
                  ? handleRegister
                  : authMode === "company-register"
                    ? handleCompanyRegister
                    : handlePasswordReset
            }
          >
            {authMode === "register" || authMode === "company-register" ? (
              <label className={styles.field}>
                <span>Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Max Mustermann"
                  autoComplete="name"
                />
              </label>
            ) : null}

            {authMode === "company-register" ? (
              <label className={styles.field}>
                <span>Firma</span>
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Musterfirma GmbH"
                  autoComplete="organization"
                />
              </label>
            ) : null}

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

            {authMode !== "reset" ? (
              <label className={styles.field}>
                <span>Passwort</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Passwort"
                  autoComplete={
                    authMode === "register" || authMode === "company-register"
                      ? "new-password"
                      : "current-password"
                  }
                />
              </label>
            ) : null}

            {authError ? <p className={styles.error}>{authError}</p> : null}
            {authInfo ? <p className={styles.info}>{authInfo}</p> : null}

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? authMode === "login"
                  ? "Anmeldung l\u00E4uft..."
                  : authMode === "register"
                    ? "Konto wird erstellt..."
                    : authMode === "company-register"
                      ? "Firma wird angelegt..."
                      : "Mail wird gesendet..."
                : authMode === "login"
                  ? "Einloggen"
                  : authMode === "register"
                    ? "Konto erstellen"
                    : authMode === "company-register"
                      ? "Firma anlegen"
                      : "Reset-Mail senden"}
            </button>

            <div className={styles.authFooter}>
              {authMode !== "login" ? (
                <button
                  type="button"
                  className={styles.authLink}
                  onClick={() => switchAuthMode("login")}
                >
                  {"Zur\u00FCck zum Login"}
                </button>
              ) : null}

              {authMode === "login" ? (
                <>
                  <button
                    type="button"
                    className={styles.authLink}
                    onClick={() => switchAuthMode("register")}
                  >
                    Neues Konto anlegen
                  </button>
                  <button
                    type="button"
                    className={styles.authLink}
                    onClick={() => switchAuthMode("company-register")}
                  >
                    Als Firmenchef registrieren
                  </button>
                  <button
                    type="button"
                    className={styles.authLink}
                    onClick={() => switchAuthMode("reset")}
                  >
                    Passwort vergessen?
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.desktopApp}>
        <header className={styles.desktopToolbar}>
          <div className={styles.desktopBrand}>
            <Image
              src="/workshare-logo.png"
              alt="WorkShare"
              width={42}
              height={42}
              className={styles.logo}
            />
            <div>
              <p className={styles.kicker}>WorkShare Web</p>
              <h1 className={styles.desktopTitle}>WorkShare</h1>
            </div>
          </div>

          <div className={styles.desktopToolbarSpacer} />

          <div className={styles.desktopToolbarActions}>
            <div className={styles.toolbarUserMeta}>
              <span>{user.email ?? "unbekannter Benutzer"}</span>
              {userProfile?.companyName ? (
                <small>
                  {userProfile.companyName}
                  {companyRoleLabel ? ` - ${companyRoleLabel}` : ""}
                </small>
              ) : null}
              {resolvedCompanyCode ? <small>Code {resolvedCompanyCode}</small> : null}
            </div>
            <div className={styles.mobileToolbarActions}>
              {activeSection === "projects" ? (
                <>
                  <button
                    type="button"
                    className={styles.mobileTopIcon}
                    aria-label="Benachrichtigungen"
                    title="Benachrichtigungen"
                    onClick={() =>
                      startTransition(() => {
                        setActiveSection("notifications");
                      })
                    }
                  >
                    <svg viewBox="0 0 24 24" className={styles.bellIcon} aria-hidden="true">
                      <path
                        d="M15 17H9a2 2 0 0 1-2-2v-3a5 5 0 0 1 10 0v3a2 2 0 0 1-2 2z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M10 19a2 2 0 0 0 4 0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                    {notificationDotVisible ? (
                      <span className={styles.notificationDot} />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={styles.mobileTopIcon}
                    aria-label="Projekt beitreten"
                    title="Projekt beitreten"
                    onClick={() => {
                      setProjectJoinError("");
                      setProjectJoinInfo("");
                      setProjectJoinCode("");
                      setIsProjectJoinOpen(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" className={styles.bellIcon} aria-hidden="true">
                      <path
                        d="M7 14a4 4 0 0 1 0-8h6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="15.5" cy="10" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="15.5" cy="10" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.mobileTopIcon}
                    aria-label="Suche"
                    title="Suche"
                    onClick={() =>
                      setSearchOpen((current) => {
                        const next = !current;
                        if (!next) {
                          setProjectSearch("");
                        }
                        return next;
                      })
                    }
                  >
                    <svg viewBox="0 0 24 24" className={styles.bellIcon} aria-hidden="true">
                      <path
                        d="M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M16.5 16.5L20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </>
              ) : null}
            </div>
            <button
              type="button"
              className={`${activeSection === "notifications" ? styles.iconButtonActive : styles.iconButton} ${styles.desktopOnlyAction}`}
              aria-label="Benachrichtigungen"
              title="Benachrichtigungen"
              onClick={() => {
                startTransition(() => {
                  setActiveSection("notifications");
                });
              }}
            >
              <svg viewBox="0 0 24 24" className={styles.bellIcon} aria-hidden="true">
                <path
                  d="M15 17H9a2 2 0 0 1-2-2v-3a5 5 0 0 1 10 0v3a2 2 0 0 1-2 2z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 19a2 2 0 0 0 4 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {notificationDotVisible ? (
                <span className={styles.notificationDot} />
              ) : null}
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.desktopOnlyAction}`}
              aria-label="Projekt beitreten"
              title="Projekt beitreten"
              onClick={() => {
                setProjectJoinError("");
                setProjectJoinInfo("");
                setProjectJoinCode("");
                setIsProjectJoinOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" className={styles.bellIcon} aria-hidden="true">
                <path
                  d="M7 14a4 4 0 0 1 0-8h6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="15.5" cy="10" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="15.5" cy="10" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.desktopOnlyAction}`}
              aria-label="Logout"
              title="Logout"
              onClick={handleLogout}
            >
              <svg viewBox="0 0 24 24" className={styles.bellIcon} aria-hidden="true">
                <path
                  d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12h11M16 8l4 4l-4 4"
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

        <section className={styles.desktopBody}>
          <aside className={styles.desktopSidebar}>
            <div className={styles.sidebarBlock}>
              <p className={styles.sidebarLabel}>Navigation</p>
              <button
                type="button"
                className={
                  activeSection === "projects"
                    ? styles.sidebarNavActive
                    : styles.sidebarNavButton
                }
                onClick={() =>
                  startTransition(() => {
                    setActiveSection("projects");
                  })
                }
              >
                Home
              </button>
              <button
                type="button"
                className={
                  activeSection === "notifications"
                    ? styles.sidebarNavActive
                    : styles.sidebarNavButton
                }
                onClick={() =>
                  startTransition(() => {
                    setActiveSection("notifications");
                  })
                }
              >
                Benachrichtigungen
                {notificationDotVisible ? <span className={styles.sidebarNavBadge} /> : null}
              </button>
              <button
                type="button"
                className={
                  activeSection === "workgroups"
                    ? styles.sidebarNavActive
                    : styles.sidebarNavButton
                }
                onClick={() =>
                  startTransition(() => {
                    setActiveSection("workgroups");
                  })
                }
              >
                Workgroups
              </button>
              <button
                type="button"
                className={
                  activeSection === "catalog"
                    ? styles.sidebarNavActive
                    : styles.sidebarNavButton
                }
                onClick={() =>
                  startTransition(() => {
                    setActiveSection("catalog");
                  })
                }
              >
                Katalog
              </button>
              <button
                type="button"
                className={
                  activeSection === "settings"
                    ? styles.sidebarNavActive
                    : styles.sidebarNavButton
                }
                onClick={() =>
                  startTransition(() => {
                    setActiveSection("settings");
                  })
                }
              >
                Einstellungen
              </button>
            </div>

            <div className={styles.sidebarBlock}>
              {activeSection === "projects" ? (
                <>
                  <p className={styles.sidebarLabel}>Status</p>
                  <div className={styles.sidebarSegmentGroup}>
                    <button
                      type="button"
                      className={activeOnly ? styles.sidebarSegmentActive : styles.sidebarSegment}
                      onClick={() =>
                        startTransition(() => {
                          setActiveOnly(true);
                        })
                      }
                    >
                      Aktiv
                    </button>
                    <button
                      type="button"
                      className={!activeOnly ? styles.sidebarSegmentActive : styles.sidebarSegment}
                      onClick={() =>
                        startTransition(() => {
                          setActiveOnly(false);
                        })
                      }
                    >
                      Archiv
                    </button>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Aktive Projekte</span>
                    <strong>{activeCount}</strong>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Archivierte Projekte</span>
                    <strong>{archivedCount}</strong>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Partien</span>
                    <strong>{deferredWorkgroups.length}</strong>
                  </div>
                </>
              ) : null}
              {activeSection === "catalog" ? (
                <>
                  <p className={styles.sidebarLabel}>Katalog</p>
                  <div className={styles.sidebarStat}>
                  <span>Einträge</span>
                    <strong>{deferredCatalogEntries.length}</strong>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Partien mit Zugriff</span>
                    <strong>{deferredWorkgroups.length}</strong>
                  </div>
                </>
              ) : null}
              {activeSection === "notifications" ? (
                <>
                  <p className={styles.sidebarLabel}>Benachrichtigungen</p>
                  <div className={styles.sidebarStat}>
                    <span>Neu</span>
                    <strong>{unreadAppNotificationCount}</strong>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Offene Einladungen</span>
                    <strong>{pendingInvitationCount}</strong>
                  </div>
                </>
              ) : null}
              {activeSection === "workgroups" ? (
                <>
                  <p className={styles.sidebarLabel}>Workgroups</p>
                  <div className={styles.sidebarStat}>
                    <span>Partien</span>
                    <strong>{deferredWorkgroups.length}</strong>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Verwaltbar</span>
                    <strong>{manageableWorkgroups.length}</strong>
                  </div>
                </>
              ) : null}
              {activeSection === "settings" ? (
                <>
                  <p className={styles.sidebarLabel}>Einstellungen</p>
                  <div className={styles.sidebarStat}>
                  <span>Katalogeinträge</span>
                    <strong>{deferredCatalogEntries.length}</strong>
                  </div>
                  <div className={styles.sidebarStat}>
                    <span>Partien</span>
                    <strong>{deferredWorkgroups.length}</strong>
                  </div>
                </>
              ) : null}
            </div>

          </aside>

          <section className={styles.workspace}>
            <section className={styles.dashboard}>
              <section className={styles.mobileTopControls}>
                <div className={styles.mobileStatusRow}>
                  {activeSection === "projects" ? (
                    <>
                      <button
                        type="button"
                        className={activeOnly ? styles.mobileSegmentActive : styles.mobileSegment}
                        onClick={() =>
                          startTransition(() => {
                            setActiveOnly(true);
                          })
                        }
                      >
                        Aktiv
                      </button>
                      <button
                        type="button"
                        className={!activeOnly ? styles.mobileSegmentActive : styles.mobileSegment}
                        onClick={() =>
                          startTransition(() => {
                            setActiveOnly(false);
                          })
                        }
                      >
                        Archiv
                      </button>
                    </>
                  ) : null}
                  {activeSection === "catalog" ? (
                    <span className={styles.mobileSectionChip}>Materialkatalog</span>
                  ) : null}
                  {activeSection === "notifications" ? (
                    <span className={styles.mobileSectionChip}>Benachrichtigungen</span>
                  ) : null}
                  {activeSection === "workgroups" ? (
                    <span className={styles.mobileSectionChip}>Workgroups</span>
                  ) : null}
                  {activeSection === "settings" ? (
                    <span className={styles.mobileSectionChip}>Einstellungen</span>
                  ) : null}
                </div>
                <div className={styles.mobileCounts}>
                  {activeSection === "projects" ? (
                    <>
                      <span>Aktive {activeCount}</span>
                      <span>Archiv {archivedCount}</span>
                      <span>Partien {deferredWorkgroups.length}</span>
                    </>
                  ) : null}
                {activeSection === "catalog" ? <span>Einträge {deferredCatalogEntries.length}</span> : null}
                  {activeSection === "notifications" ? <span>Neu {unreadAppNotificationCount}</span> : null}
                  {activeSection === "notifications" ? <span>Einladungen {pendingInvitationCount}</span> : null}
                  {activeSection === "workgroups" ? <span>Partien {deferredWorkgroups.length}</span> : null}
                  {activeSection === "settings" ? <span>Einladungen {pendingInvitationCount}</span> : null}
                </div>
              </section>

              {activeSection === "projects" && searchOpen ? (
                <div className={styles.mobileSearchRow}>
                  <input
                    type="search"
                    className={styles.mobileSearchInput}
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="Projekt suchen..."
                    autoComplete="off"
                  />
                </div>
              ) : null}

        {false ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>Einladungen</p>
              <h2>Workgroups und offene Einladungen</h2>
            </div>
            <p className={styles.subtle}>
              Einladungen werden aktuell in WorkShare selbst gespeichert, nicht als echte E-Mail verschickt.
            </p>
          </div>

          <div className={styles.utilityGrid}>
            <article className={styles.utilityCard}>
              <h3>Workgroup beitreten</h3>
              <p className={styles.subtle}>
                Mit dem Workgroup-Code kannst du eine Partie direkt im Web verbinden.
              </p>
              <form className={styles.formCompact} onSubmit={handleJoinWorkgroup}>
                <label className={styles.field}>
                  <span>Workgroup-Code</span>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    autoComplete="off"
                  />
                </label>
                {joinError ? <p className={styles.error}>{joinError}</p> : null}
                {joinInfo ? <p className={styles.info}>{joinInfo}</p> : null}
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isJoiningWorkgroup}
                >
                  {isJoiningWorkgroup ? "Beitritt l\u00E4uft..." : "Workgroup beitreten"}
                </button>
              </form>
            </article>

            {manageableWorkgroups.length > 0 ? (
              <article className={styles.utilityCard}>
                <h3>Workgroup einladen</h3>
                <p className={styles.subtle}>
                  {"F\u00FCr den Empf\u00E4nger erscheint die Einladung nach dem Login unter Einladungen."}
                </p>
                <form className={styles.formCompact} onSubmit={handleWorkgroupInvite}>
                  <label className={styles.field}>
                    <span>Partie</span>
                    <select
                      value={selectedInviteWorkgroupId}
                      onChange={(event) => setSelectedInviteWorkgroupId(event.target.value)}
                    >
                      {manageableWorkgroups.map((workgroup) => (
                        <option key={workgroup.id} value={workgroup.id}>
                          {workgroup.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>E-Mail</span>
                    <input
                      type="email"
                      value={workgroupInviteEmail}
                      onChange={(event) => setWorkgroupInviteEmail(event.target.value)}
                      placeholder="mitarbeiter@firma.at"
                      autoComplete="email"
                    />
                  </label>
                  {workgroupInviteError ? (
                    <p className={styles.error}>{workgroupInviteError}</p>
                  ) : null}
                  {workgroupInviteInfo ? (
                    <p className={styles.info}>{workgroupInviteInfo}</p>
                  ) : null}
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={isSendingWorkgroupInvite}
                  >
                    {isSendingWorkgroupInvite
                      ? "Einladung wird gespeichert..."
                      : "Workgroup-Einladung senden"}
                  </button>
                </form>
              </article>
            ) : null}
          </div>

          {invitationError ? <p className={styles.error}>{invitationError}</p> : null}
          {invitationInfo ? <p className={styles.info}>{invitationInfo}</p> : null}

          {pendingInvitations.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Keine offenen Einladungen</h3>
              <p>
                {"Projekt- und Workgroup-Einladungen erscheinen hier, sobald sie f\u00FCr"}
                deine E-Mail-Adresse erstellt wurden.
              </p>
            </div>
          ) : (
            <div className={styles.invitationList}>
              {pendingInvitations.map((invitation) => {
                const isProjectInvitation = Boolean(invitation.projectId);

                return (
                  <article key={invitation.id} className={styles.invitationCard}>
                    <div className={styles.invitationTop}>
                      <div>
                        <h3>
                          {isProjectInvitation
                            ? invitation.projectName || "Projekteinladung"
                            : invitation.workgroupName || "Workgroup-Einladung"}
                        </h3>
                        <p className={styles.subtle}>
                          {isProjectInvitation ? "Projekt" : "Workgroup"}{" \u00B7 "}Rolle{" "}
                          {invitation.role}
                        </p>
                      </div>
                      <span className={styles.badge}>
                        {isProjectInvitation ? "Projekt" : "Workgroup"}
                      </span>
                    </div>
                    <p className={styles.subtle}>
                      Erstellt am {formatInvitationDate(invitation.createdAt)}
                    </p>
                    <div className={styles.projectActions}>
                      <button
                        type="button"
                        className={styles.cardActionPrimary}
                        onClick={() => handleInvitationAccept(invitation)}
                      >
                        Annehmen
                      </button>
                      <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => handleInvitationDecline(invitation.id)}
                      >
                        Ablehnen
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        ) : null}

        {activeSection === "notifications" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Benachrichtigungen</p>
                <h2>Inbox</h2>
              </div>
              <div className={styles.projectActions}>
                <button
                  type="button"
                  className={styles.cardActionCompact}
                  onClick={handleMarkAllNotificationsRead}
                  disabled={isMarkingNotificationsRead}
                >
                        {isMarkingNotificationsRead ? "Läuft..." : "Alle gelesen"}
                </button>
                <button
                  type="button"
                  className={styles.cardActionCompact}
                  onClick={handleDeleteAllNotifications}
                  disabled={isDeletingNotifications}
                >
                        {isDeletingNotifications ? "Läuft..." : "Alles löschen"}
                </button>
              </div>
            </div>

            {notificationsError ? <p className={styles.error}>{notificationsError}</p> : null}
            {notificationsInfo ? <p className={styles.info}>{notificationsInfo}</p> : null}
            {invitationError ? <p className={styles.error}>{invitationError}</p> : null}
            {invitationInfo ? <p className={styles.info}>{invitationInfo}</p> : null}

            <section className={styles.panelSubsection}>
              <h3>App-Benachrichtigungen</h3>
              {appNotifications.length === 0 ? (
                <div className={styles.emptyState}>
                  <h3>Keine Benachrichtigungen</h3>
                  <p>Neue Hinweise aus Projekten und Workgroups erscheinen hier automatisch.</p>
                </div>
              ) : (
                <div className={styles.notificationList}>
                  {appNotifications.map((notification) => (
                    <article
                      key={notification.id}
                      className={
                        notification.readAt
                          ? styles.notificationItem
                          : `${styles.notificationItem} ${styles.notificationItemUnread}`
                      }
                    >
                      <div className={styles.notificationItemTop}>
                        <p className={styles.notificationTitle}>{notification.title || "Benachrichtigung"}</p>
                        <button
                          type="button"
                          className={styles.cardActionIconDanger}
                              aria-label="Benachrichtigung löschen"
                              title="Benachrichtigung löschen"
                          onClick={() => handleDeleteNotification(notification.id)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                            <path
                              d="M5 7h14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                            <path
                              d="M9 7V5h6v2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M7 7l1 12h8l1-12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <p className={styles.notificationMessage}>{notification.message || "-"}</p>
                      <div className={styles.notificationMeta}>
                        <span>{notification.type || "info"}</span>
                        <span>{formatInvitationDate(notification.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.panelSubsection}>
              <h3>Einladungen</h3>
              {deferredInvitations.length === 0 ? (
                <div className={styles.emptyState}>
                  <h3>Keine offenen Einladungen</h3>
                  <p>Aktuell warten keine Projekt- oder Workgroup-Einladungen auf dich.</p>
                </div>
              ) : (
                <div className={styles.invitationList}>
                  {deferredInvitations.map((invitation) => {
                    const isProjectInvitation = Boolean(invitation.projectId);

                    return (
                      <article key={invitation.id} className={styles.invitationCard}>
                        <div className={styles.invitationTop}>
                          <div>
                            <h3>
                              {isProjectInvitation
                                ? invitation.projectName || "Projekteinladung"
                                : invitation.workgroupName || "Workgroup-Einladung"}
                            </h3>
                            <p className={styles.subtle}>
                              {isProjectInvitation ? "Projekt" : "Workgroup"}{" \u00B7 "}Rolle {invitation.role}
                            </p>
                          </div>
                          <span className={styles.badge}>{isProjectInvitation ? "Projekt" : "Workgroup"}</span>
                        </div>
                        <p className={styles.subtle}>Erstellt am {formatInvitationDate(invitation.createdAt)}</p>
                        <div className={styles.projectActions}>
                          <button
                            type="button"
                            className={styles.cardActionPrimary}
                            onClick={() => handleInvitationAccept(invitation)}
                          >
                            Annehmen
                          </button>
                          <button
                            type="button"
                            className={styles.cardAction}
                            onClick={() => handleInvitationDecline(invitation.id)}
                          >
                            Ablehnen
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        ) : null}

        {activeSection === "workgroups" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Workgroups</p>
                <h2>Beitritt und Einladungen</h2>
              </div>
              <p className={styles.subtle}>Dieser Bereich ist nur bei Bedarf sichtbar.</p>
            </div>

            <div className={styles.workgroupToolbar}>
              <article className={styles.workgroupToolCard}>
                <h3>Workgroup erstellen</h3>
                <form className={styles.formCompactInline} onSubmit={handleCreateWorkgroup}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      type="text"
                      value={newWorkgroupName}
                      onChange={(event) => setNewWorkgroupName(event.target.value)}
                      placeholder="Neue Workgroup"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="submit"
                    className={`${styles.primaryButtonCompact} ${styles.formSubmitButton}`}
                    disabled={isCreatingWorkgroup}
                  >
                      {isCreatingWorkgroup ? "Läuft..." : "Erstellen"}
                  </button>
                </form>
                {workgroupCreateError ? <p className={styles.error}>{workgroupCreateError}</p> : null}
                {workgroupCreateInfo ? <p className={styles.info}>{workgroupCreateInfo}</p> : null}
              </article>

              <article className={styles.workgroupToolCard}>
                <h3>Workgroup beitreten</h3>
                <form className={styles.formCompactInline} onSubmit={handleJoinWorkgroup}>
                  <label className={styles.field}>
                    <span>Workgroup-Code</span>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="ABC123"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="submit"
                    className={`${styles.primaryButtonCompact} ${styles.formSubmitButton}`}
                    disabled={isJoiningWorkgroup}
                  >
                    {isJoiningWorkgroup ? "L\u00E4uft..." : "Beitreten"}
                  </button>
                </form>
                {joinError ? <p className={styles.error}>{joinError}</p> : null}
                {joinInfo ? <p className={styles.info}>{joinInfo}</p> : null}
              </article>

              {manageableWorkgroups.length > 0 ? (
                <article className={styles.workgroupToolCard}>
                  <h3>Workgroup einladen</h3>
                  <form className={styles.formCompactInline} onSubmit={handleWorkgroupInvite}>
                    <label className={styles.field}>
                      <span>Partie</span>
                      <select
                        value={selectedInviteWorkgroupId}
                        onChange={(event) => setSelectedInviteWorkgroupId(event.target.value)}
                      >
                        {manageableWorkgroups.map((workgroup) => (
                          <option key={workgroup.id} value={workgroup.id}>
                            {workgroup.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>E-Mail</span>
                      <input
                        type="email"
                        value={workgroupInviteEmail}
                        onChange={(event) => setWorkgroupInviteEmail(event.target.value)}
                        placeholder="mitarbeiter@firma.at"
                        autoComplete="email"
                      />
                    </label>
                    <button
                      type="submit"
                      className={`${styles.primaryButtonCompact} ${styles.formSubmitButton}`}
                      disabled={isSendingWorkgroupInvite}
                    >
                      {isSendingWorkgroupInvite
                        ? "Läuft..."
                        : "Einladen"}
                    </button>
                  </form>
                  {workgroupInviteError ? (
                    <p className={styles.error}>{workgroupInviteError}</p>
                  ) : null}
                  {workgroupInviteInfo ? (
                    <p className={styles.info}>{workgroupInviteInfo}</p>
                  ) : null}
                </article>
              ) : null}

              {manageableWorkgroups.length > 0 ? (
                <article className={styles.workgroupToolCard}>
                  <h3>Partie mit Firma verknuepfen</h3>
                  <form className={styles.formCompact} onSubmit={handleLinkWorkgroupToCompany}>
                    <label className={styles.field}>
                      <span>Partie</span>
                      <select
                        value={selectedCompanyLinkWorkgroupId}
                        onChange={(event) => setSelectedCompanyLinkWorkgroupId(event.target.value)}
                        disabled={isLinkingWorkgroupToCompany}
                      >
                        {manageableWorkgroups.map((workgroup) => (
                          <option key={workgroup.id} value={workgroup.id}>
                            {workgroup.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Firmen-Code</span>
                      <input
                        type="text"
                        value={companyLinkCode}
                        onChange={(event) => setCompanyLinkCode(event.target.value.toUpperCase())}
                        placeholder={userProfile?.companyCode || "NNU83UVW"}
                        autoComplete="off"
                        disabled={isLinkingWorkgroupToCompany}
                      />
                    </label>
                    <button
                      type="submit"
                      className={styles.primaryButtonCompact}
                      disabled={isLinkingWorkgroupToCompany}
                    >
                      {isLinkingWorkgroupToCompany ? "Laeuft..." : "Verknuepfen"}
                    </button>
                  </form>
                  {companyLinkError ? <p className={styles.error}>{companyLinkError}</p> : null}
                  {companyLinkInfo ? <p className={styles.info}>{companyLinkInfo}</p> : null}
                </article>
              ) : null}
            </div>

            {companyScopeError ? <p className={styles.error}>{companyScopeError}</p> : null}

            {deferredWorkgroups.length > 0 ? (
              <div className={styles.workgroupListCompact}>
                {deferredWorkgroups.map((workgroup) => {
                  const hasDirectMembership = Boolean(workgroup.memberEmail);

                  return (
                  <article key={workgroup.id} className={styles.workgroupRow}>
                    <div className={styles.workgroupRowMain}>
                      <div>
                        <h3 className={styles.workgroupName}>{workgroup.name}</h3>
                        <p className={styles.workgroupMeta}>
                          {hasDirectMembership
                            ? `Rolle ${workgroup.role} \u00B7 Code ${workgroup.joinCode || "-"}`
                            : `Firma ${workgroup.companyName || "-"} \u00B7 Code ${workgroup.companyCode || "-"}`}
                        </p>
                      </div>
                      <span className={hasDirectMembership ? styles.badge : styles.badgeMuted}>
                        {hasDirectMembership ? workgroup.role : "Firma"}
                      </span>
                    </div>
                    <div className={styles.workgroupRowActions}>
                      {hasDirectMembership ? (
                        <>
                          {workgroup.role === "owner" ? (
                        <button
                          type="button"
                          className={styles.cardActionDanger}
                          onClick={() => handleDeleteWorkgroup(workgroup)}
                          disabled={isDeletingWorkgroupId === workgroup.id}
                        >
                          {isDeletingWorkgroupId === workgroup.id
                            ? "Lösche..."
                            : "Workgroup löschen"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.cardActionCompact}
                          onClick={() => handleLeaveWorkgroup(workgroup)}
                          disabled={isLeavingWorkgroupId === workgroup.id}
                        >
                          {isLeavingWorkgroupId === workgroup.id
                            ? "Verlassen..."
                            : "Workgroup verlassen"}
                        </button>
                          )}
                        </>
                      ) : (
                        <span className={styles.subtle}>Nur Uebersicht</span>
                      )}
                    </div>
                  </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeSection === "catalog" ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.sectionHeading}>
                <p className={styles.kicker}>Katalog</p>
                <h2>Materialkatalog</h2>
                <p className={styles.panelIntro}>
                    Standardmaterialien für schnelle Projekteinträge.
                </p>
              </div>
              <button
                type="button"
                className={styles.primaryButtonCompact}
                onClick={() => setIsCreatingCatalogEntry(true)}
              >
                Eintrag anlegen
              </button>
            </div>

            {catalogError ? <p className={styles.error}>{catalogError}</p> : null}

            {catalogLoading ? (
              <p className={styles.subtle}>Katalog wird geladen...</p>
            ) : deferredCatalogEntries.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>Katalog ist leer</h3>
                    <p>Lege den ersten Materialeintrag an, damit er in Projekten direkt wählbar ist.</p>
              </div>
            ) : (
              <div className={styles.catalogList}>
                {deferredCatalogEntries.map((entry) => (
                  <article key={entry.id} className={styles.catalogRow}>
                    <div className={styles.catalogMain}>
                      <h3>{entry.name}</h3>
                      <p className={styles.subtle}>
                        {entry.unit}
                        {entry.category ? ` - ${entry.category}` : ""}
                        {" · "}
                        {entry.workgroupId
                          ? workgroupMap.get(entry.workgroupId)?.name ?? "Partie"
                          : "Persönlich"}
                      </p>
                    </div>
                    <div className={styles.projectActions}>
                      <button
                        type="button"
                        className={styles.cardActionIcon}
                        aria-label="Eintrag bearbeiten"
                        title="Eintrag bearbeiten"
                        onClick={() => setEditingCatalogEntry(entry)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                          <path
                            d="M4 20h4l10-10-4-4L4 16v4z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M12 6l4 4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.cardActionIconDanger}
                        aria-label="Eintrag löschen"
                        title="Eintrag löschen"
                        onClick={() => handleDeleteCatalogEntry(entry)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
                          <path
                            d="M5 7h14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                          <path
                            d="M9 7V5h6v2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7 7l1 12h8l1-12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeSection === "settings" ? (
          <section className={`${styles.panel} ${styles.settingsPanel}`}>
            <article className={styles.settingsProfileCard}>
              <div className={styles.settingsProfileIconWrap}>
                <svg viewBox="0 0 24 24" className={styles.actionIcon} aria-hidden="true">
                  <path
                    d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 20a8 8 0 0 1 16 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h3>{user.displayName || userProfile?.displayName || "Benutzer"}</h3>
                <p>{user.email ?? "-"}</p>
              </div>
            </article>

            <h3 className={styles.settingsSectionTitle}>Team</h3>
            <article className={styles.settingsCard}>
              <h4>Workgroups</h4>
              <p className={styles.subtle}>Gemeinsame Gruppe erstellen oder beitreten</p>
              <form className={styles.formCompactInline} onSubmit={handleCreateWorkgroup}>
                <label className={styles.field}>
                  <span>Neue Workgroup</span>
                  <input
                    type="text"
                    value={newWorkgroupName}
                    onChange={(event) => setNewWorkgroupName(event.target.value)}
                    placeholder="Neue Workgroup"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="submit"
                  className={`${styles.primaryButtonCompact} ${styles.formSubmitButton}`}
                  disabled={isCreatingWorkgroup}
                >
                      {isCreatingWorkgroup ? "Läuft..." : "Erstellen"}
                </button>
              </form>
              {workgroupCreateError ? <p className={styles.error}>{workgroupCreateError}</p> : null}
              {workgroupCreateInfo ? <p className={styles.info}>{workgroupCreateInfo}</p> : null}
              <form className={styles.formCompactInline} onSubmit={handleJoinWorkgroup}>
                <label className={styles.field}>
                  <span>Code</span>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="submit"
                  className={`${styles.primaryButtonCompact} ${styles.formSubmitButton}`}
                  disabled={isJoiningWorkgroup}
                >
                  {isJoiningWorkgroup ? "Läuft..." : "Beitreten"}
                </button>
              </form>
              {joinError ? <p className={styles.error}>{joinError}</p> : null}
              {joinInfo ? <p className={styles.info}>{joinInfo}</p> : null}
            </article>

            {manageableWorkgroups.length > 0 ? (
              <article className={styles.settingsCard}>
                <h4>Einladung senden</h4>
                <form className={styles.formCompactInline} onSubmit={handleWorkgroupInvite}>
                  <label className={styles.field}>
                    <span>Partie</span>
                    <select
                      value={selectedInviteWorkgroupId}
                      onChange={(event) => setSelectedInviteWorkgroupId(event.target.value)}
                    >
                      {manageableWorkgroups.map((workgroup) => (
                        <option key={workgroup.id} value={workgroup.id}>
                          {workgroup.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>E-Mail</span>
                    <input
                      type="email"
                      value={workgroupInviteEmail}
                      onChange={(event) => setWorkgroupInviteEmail(event.target.value)}
                      placeholder="mitarbeiter@firma.at"
                      autoComplete="email"
                    />
                  </label>
                  <button
                    type="submit"
                    className={`${styles.primaryButtonCompact} ${styles.formSubmitButton}`}
                    disabled={isSendingWorkgroupInvite}
                  >
                    {isSendingWorkgroupInvite ? "Läuft..." : "Einladen"}
                  </button>
                </form>
                {workgroupInviteError ? <p className={styles.error}>{workgroupInviteError}</p> : null}
                {workgroupInviteInfo ? <p className={styles.info}>{workgroupInviteInfo}</p> : null}
              </article>
            ) : null}

            <article className={styles.settingsCard}>
              <h4>Beispielkatalog</h4>
              <p className={styles.subtle}>
                    Lade die feste Materialvorlage oder entferne sie wieder aus deinem persönlichen Katalog.
              </p>
              <div className={styles.projectActions}>
                <button
                  type="button"
                  className={styles.cardActionCompact}
                  onClick={handleLoadSampleCatalog}
                  disabled={isLoadingSampleCatalog}
                >
                        {isLoadingSampleCatalog ? "Läuft..." : "Beispielkatalog laden"}
                </button>
                <button
                  type="button"
                  className={styles.cardActionCompact}
                  onClick={handleUnloadSampleCatalog}
                  disabled={isUnloadingSampleCatalog}
                >
                        {isUnloadingSampleCatalog ? "Läuft..." : "Beispielkatalog entladen"}
                </button>
              </div>
              {sampleCatalogError ? <p className={styles.error}>{sampleCatalogError}</p> : null}
              {sampleCatalogInfo ? <p className={styles.info}>{sampleCatalogInfo}</p> : null}
            </article>

            <article className={styles.settingsCard}>
              <h4>Offene Einladungen</h4>
              {invitationError ? <p className={styles.error}>{invitationError}</p> : null}
              {invitationInfo ? <p className={styles.info}>{invitationInfo}</p> : null}
              {deferredInvitations.length === 0 ? (
                <p className={styles.subtle}>Keine offenen Einladungen.</p>
              ) : (
                <div className={styles.invitationList}>
                  {deferredInvitations.map((invitation) => {
                    const isProjectInvitation = Boolean(invitation.projectId);
                    return (
                      <article key={invitation.id} className={styles.invitationCard}>
                        <div className={styles.invitationTop}>
                          <div>
                            <h3>
                              {isProjectInvitation
                                ? invitation.projectName || "Projekteinladung"
                                : invitation.workgroupName || "Workgroup-Einladung"}
                            </h3>
                            <p className={styles.subtle}>
                              {isProjectInvitation ? "Projekt" : "Workgroup"} · Rolle {invitation.role}
                            </p>
                          </div>
                        </div>
                        <div className={styles.projectActions}>
                          <button
                            type="button"
                            className={styles.cardActionPrimary}
                            onClick={() => handleInvitationAccept(invitation)}
                          >
                            Annehmen
                          </button>
                          <button
                            type="button"
                            className={styles.cardAction}
                            onClick={() => handleInvitationDecline(invitation.id)}
                          >
                            Ablehnen
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>

            <h3 className={styles.settingsSectionTitle}>System & Cloud</h3>
            <article className={styles.settingsCard}>
              <div className={`${styles.settingsStatsGrid} ${styles.settingsCloudStats}`}>
                <div className={styles.sidebarStat}>
                  <span>Aktive Projekte</span>
                  <strong>{activeCount}</strong>
                </div>
                <div className={styles.sidebarStat}>
                  <span>Archivierte Projekte</span>
                  <strong>{archivedCount}</strong>
                </div>
                <div className={styles.sidebarStat}>
                  <span>Partien</span>
                  <strong>{deferredWorkgroups.length}</strong>
                </div>
              </div>
              {deferredWorkgroups.length > 0 ? (
                <div className={`${styles.workgroupListCompact} ${styles.settingsWorkgroupList}`}>
                  {deferredWorkgroups.map((workgroup) => {
                    const hasDirectMembership = Boolean(workgroup.memberEmail);
                    return (
                    <article
                      key={workgroup.id}
                      className={`${styles.workgroupRow} ${styles.settingsWorkgroupRow}`}
                    >
                      <div className={`${styles.workgroupRowMain} ${styles.settingsWorkgroupMain}`}>
                        <div>
                          <h3 className={styles.workgroupName}>{workgroup.name}</h3>
                          <p className={styles.workgroupMeta}>
                            Rolle {workgroup.role} · Code {workgroup.joinCode || "-"}
                          </p>
                        </div>
                        <span className={hasDirectMembership ? styles.badge : styles.badgeMuted}>
                          {hasDirectMembership ? workgroup.role : "Firma"}
                        </span>
                      </div>
                      <div
                        className={`${styles.workgroupRowActions} ${styles.settingsWorkgroupActions}`}
                      >
                        {hasDirectMembership ? (
                          <>
                            {workgroup.role === "owner" ? (
                          <button
                            type="button"
                            className={styles.cardActionDanger}
                            onClick={() => handleDeleteWorkgroup(workgroup)}
                            disabled={isDeletingWorkgroupId === workgroup.id}
                          >
                            {isDeletingWorkgroupId === workgroup.id
                              ? "Lösche..."
                              : "Workgroup löschen"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.cardActionCompact}
                            onClick={() => handleLeaveWorkgroup(workgroup)}
                            disabled={isLeavingWorkgroupId === workgroup.id}
                          >
                            {isLeavingWorkgroupId === workgroup.id
                              ? "Verlassen..."
                              : "Workgroup verlassen"}
                          </button>
                            )}
                          </>
                        ) : (
                          <span className={styles.subtle}>Nur Uebersicht</span>
                        )}
                      </div>
                    </article>
                    );
                  })}
                </div>
              ) : null}
              <div className={styles.settingsLogoutRow}>
                <button type="button" className={styles.cardActionCompact} onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "projects" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>Dashboard</p>
              <h2>{activeOnly ? "Aktive Projekte" : "Archivierte Projekte"}</h2>
              <p className={styles.panelIntro}>
                {"Klare Projekt\u00FCbersicht mit Status, Partie und direkten Aktionen."}
              </p>
            </div>
            <div className={styles.projectHeaderActions}>
              <button
                type="button"
                className={styles.primaryButtonCompact}
                onClick={() => setIsCreatingProject(true)}
              >
                Projekt anlegen
              </button>
            </div>
            <p className={styles.subtle}>
              {"Die wichtigsten Web-Aktionen sind jetzt direkt in der \u00DCbersicht erreichbar."}

            </p>
          </div>

          {deferredWorkgroups.length > 0 ? (
            <div className={styles.projectToolbar}>
              <div className={styles.filterBar}>
              <button
                type="button"
                className={
                  selectedWorkgroupId === "all" ? styles.filterActive : styles.filterButton
                }
                onClick={() =>
                  startTransition(() => {
                    setSelectedWorkgroupId("all");
                  })
                }
              >
                Alle Partien
              </button>
              {deferredWorkgroups.map((workgroup) => (
                <button
                  key={workgroup.id}
                  type="button"
                  className={
                    selectedWorkgroupId === workgroup.id
                      ? styles.filterActive
                      : styles.filterButton
                  }
                  onClick={() =>
                    startTransition(() => {
                      setSelectedWorkgroupId(workgroup.id);
                    })
                  }
                >
                  {workgroup.name}
                </button>
              ))}
              <button
                type="button"
                className={
                  selectedWorkgroupId === "none" ? styles.filterActive : styles.filterButton
                }
                onClick={() =>
                  startTransition(() => {
                    setSelectedWorkgroupId("none");
                  })
                }
              >
                Ohne Partie
              </button>
              </div>
            </div>
          ) : null}

          {projectError ? <p className={styles.error}>{projectError}</p> : null}
          {projectActionError ? (
            <p className={styles.error}>{projectActionError}</p>
          ) : null}
          {companyScopeError ? <p className={styles.error}>{companyScopeError}</p> : null}

          {projectsLoading ? (
            <p className={styles.subtle}>Projekte werden geladen...</p>
          ) : deferredProjects.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Keine Projekte in dieser Ansicht</h3>
              <p>
                Sobald Projekte vorhanden sind und dein Benutzer Mitglied ist,
                erscheinen sie hier automatisch. Du kannst jetzt auch direkt im Web
                ein neues Projekt anlegen.
              </p>
            </div>
          ) : (
            <div
              className={
                projectListRefreshing
                  ? `${styles.projectGrid} ${styles.projectGridRefreshing}`
                  : styles.projectGrid
              }
            >
              {deferredProjects.map((project) => {
                const isOwner =
                  hasSuperuserAccess ||
                  project.ownerId === user.uid ||
                  project.role === "owner";
                const canManageProject =
                  hasSuperuserAccess || canManageMembers(project.role, hasSuperuserAccess);
                const workgroupName = project.workgroupId
                  ? workgroupMap.get(project.workgroupId)?.name ?? project.workgroupId
                  : "ohne Workgroup";

                return (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    workgroupName={workgroupName}
                    canManageProject={canManageProject}
                    canDeleteProject={isOwner}
                    onEdit={setEditingProject}
                    onArchiveToggle={handleArchiveToggle}
                    onDelete={handleDeleteProject}
                  />
                );
                /*
                return (
                <article key={project.id} className={styles.projectCard}>
                  {canManageProject ? (
                    <div className={styles.projectActions}>
                      <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => setEditingProject(project)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => handleArchiveToggle(project)}
                      >
                        {project.archived ? "Aktivieren" : "Archivieren"}
                      </button>
                      {isOwner ? (
                        <button
                          type="button"
                          className={styles.cardAction}
                          onClick={() => handleDeleteProject(project)}
                        >
                          {"L\u00F6schen"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <Link
                    href={`/project?id=${encodeURIComponent(project.id)}`}
                    className={styles.projectLink}
                  >
                    <div className={styles.projectRow}>
                      <div className={styles.projectMain}>
                        <div className={styles.projectTop}>
                      <div>
                        <h3>{project.name || "Unbenanntes Projekt"}</h3>
                        <p className={styles.subtle}>
                          Rolle {project.role}{" \u00B7 "}Code{" "}
                          {project.projectCode?.trim() || "-"}
                        </p>
                        <p className={styles.projectGroup}>
                          Partie{" "}
                          {project.workgroupId
                            ? workgroupMap.get(project.workgroupId)?.name ?? project.workgroupId
                            : "ohne Workgroup"}
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

                    <p className={styles.projectInlineMeta}>
                      Sortierung{" "}
                      {project.materialSortMode === "alphabetical"
                        ? "A-Z"
                        : "Eingabe"}
                      {" \u00B7 "}Mitglied {project.memberEmail}
                    </p>

                      </div>

                      <aside className={styles.projectSide}>
                        <dl className={styles.projectDates}>
                          <div>
                            <dt>Erstellt</dt>
                            <dd>{formatProjectDate(project.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>Aktualisiert</dt>
                            <dd>{formatProjectDate(project.updatedAt)}</dd>
                          </div>
                        </dl>
                      </aside>
                    </div>
                  </Link>
                </article>
                );
                */
              })}
            </div>
          )}
        </section>
        ) : null}
            </section>
            </section>
          </section>
        </section>

      {activeSection === "projects" || activeSection === "catalog" ? (
        <button
          type="button"
          className={
            activeSection === "catalog"
              ? `${styles.mobileFab} ${styles.mobileFabCatalog}`
              : styles.mobileFab
          }
          onClick={() => {
            if (activeSection === "projects") {
              setIsCreatingProject(true);
              return;
            }
            setIsCreatingCatalogEntry(true);
          }}
          aria-label={activeSection === "projects" ? "Projekt anlegen" : "Katalogeintrag anlegen"}
          title={activeSection === "projects" ? "Projekt anlegen" : "Katalogeintrag anlegen"}
        >
          <svg viewBox="0 0 24 24" className={styles.actionIcon} aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {activeSection === "catalog" ? "Eintrag" : null}
        </button>
      ) : null}

      <nav className={styles.mobileBottomNav} aria-label="Mobile Navigation">
        <button
          type="button"
          className={activeSection === "projects" ? styles.mobileNavActive : styles.mobileNavButton}
          onClick={() =>
            startTransition(() => {
              setActiveSection("projects");
            })
          }
        >
          <svg viewBox="0 0 24 24" className={`${styles.actionIcon} ${styles.mobileNavIcon}`} aria-hidden="true">
            <path
              d="M4 10l8-6l8 6v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Home
        </button>
        <button
          type="button"
          className={activeSection === "catalog" ? styles.mobileNavActive : styles.mobileNavButton}
          onClick={() =>
            startTransition(() => {
              setActiveSection("catalog");
            })
          }
        >
          <svg viewBox="0 0 24 24" className={`${styles.actionIcon} ${styles.mobileNavIcon}`} aria-hidden="true">
            <path
              d="M4 5h16v14H4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8 10h8M8 14h5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Katalog
        </button>
        <button
          type="button"
          className={activeSection === "settings" ? styles.mobileNavActive : styles.mobileNavButton}
          onClick={() =>
            startTransition(() => {
              setActiveSection("settings");
            })
          }
        >
          <svg viewBox="0 0 24 24" className={`${styles.actionIcon} ${styles.mobileNavIcon}`} aria-hidden="true">
            <path
              d="M12 8.7a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 0 0 0-6.6zm8.2 3.3l1.6 1.2l-1.5 2.7l-1.9-.4a6.9 6.9 0 0 1-1 1l.4 1.9l-2.7 1.5l-1.2-1.6a6.9 6.9 0 0 1-1.4.1l-1.2 1.6l-2.7-1.5l.4-1.9a6.9 6.9 0 0 1-1-1l-1.9.4l-1.5-2.7L3.8 12l1.6-1.2a6.9 6.9 0 0 1 .1-1.4L3.9 8.2l1.5-2.7l1.9.4a6.9 6.9 0 0 1 1-1l-.4-1.9l2.7-1.5l1.2 1.6a6.9 6.9 0 0 1 1.4-.1l1.2-1.6l2.7 1.5l-.4 1.9a6.9 6.9 0 0 1 1 1l1.9-.4l1.5 2.7l-1.6 1.2c.1.5.1 1 .1 1.4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Einstellungen
          {notificationDotVisible ? <span className={styles.mobileNavDot} /> : null}
        </button>
      </nav>

      {isProjectJoinOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={() => !isJoiningProject && setIsProjectJoinOpen(false)}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Projekt beitreten"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.kicker}>Projektbeitritt</p>
                <h3>Mit Projektcode beitreten</h3>
              </div>
              <button
                type="button"
                className={styles.modalCloseIconButton}
                onClick={() => setIsProjectJoinOpen(false)}
                disabled={isJoiningProject}
                    aria-label="Schließen"
                    title="Schließen"
              >
                <svg viewBox="0 0 24 24" className={styles.actionIcon} aria-hidden="true">
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

            <form className={styles.formCompact} onSubmit={handleJoinProject}>
              <label className={styles.field}>
                <span>Projektcode</span>
                <input
                  type="text"
                  value={projectJoinCode}
                  onChange={(event) => setProjectJoinCode(event.target.value.toUpperCase())}
                  placeholder="F69MEA"
                  autoComplete="off"
                  disabled={isJoiningProject}
                  autoFocus
                />
              </label>

              {projectJoinError ? <p className={styles.error}>{projectJoinError}</p> : null}
              {projectJoinInfo ? <p className={styles.info}>{projectJoinInfo}</p> : null}

              <div className={styles.modalActions}>
                    <span className={styles.subtle}>Der Beitritt erfolgt sofort bei gültigem Code.</span>
                <div className={styles.modalActionGroup}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setIsProjectJoinOpen(false)}
                    disabled={isJoiningProject}
                  >
                    Abbrechen
                  </button>
                  <button type="submit" className={styles.primaryButtonCompact} disabled={isJoiningProject}>
                      {isJoiningProject ? "Beitritt läuft..." : "Beitreten"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isCreatingProject ? (
        <CreateProjectEditor
          userId={user.uid}
          email={user.email ?? ""}
          companyId={userProfile?.companyId ?? null}
          companyName={userProfile?.companyName ?? null}
          companyCode={userProfile?.companyCode ?? null}
          workgroups={workgroups}
          onClose={() => setIsCreatingProject(false)}
          onCreated={handleProjectCreated}
        />
      ) : null}

      {isCreatingCatalogEntry ? (
        <CatalogEntryEditor
          userId={user.uid}
          workgroups={workgroups}
          entry={null}
          onClose={() => setIsCreatingCatalogEntry(false)}
        />
      ) : null}

      {editingCatalogEntry ? (
        <CatalogEntryEditor
          userId={user.uid}
          workgroups={workgroups}
          entry={editingCatalogEntry}
          onClose={() => setEditingCatalogEntry(null)}
        />
      ) : null}

      {editingProject ? (
        <ProjectEditor
          project={editingProject}
          canArchive={canManageMembers(editingProject.role, hasSuperuserAccess)}
          canDelete={hasSuperuserAccess || editingProject.role === "owner"}
          onClose={() => setEditingProject(null)}
          onDeleted={() => setEditingProject(null)}
        />
      ) : null}
    </main>
  );
}

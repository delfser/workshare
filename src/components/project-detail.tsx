"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";

import { auth, db } from "@/lib/firebase-client";
import { deleteMaterial } from "@/lib/material-actions";
import { removeMember } from "@/lib/member-actions";
import { deleteNote } from "@/lib/note-actions";
import { setProjectArchived, setProjectMaterialSortMode } from "@/lib/project-actions";
import {
  subscribeToProjectDetail,
  subscribeToProjectMaterials,
  subscribeToProjectMembers,
  subscribeToProjectNotes,
  subscribeToProjectPhotos,
  subscribeToProjectWorkLogs,
} from "@/lib/project-detail-stream";
import {
  canManageMembers,
  canWriteMaterials,
  isSuperuser,
  workgroupRoleToProjectRole,
} from "@/lib/project-permissions";
import { subscribeToUserProfile } from "@/lib/user-profile-stream";
import { deleteWorkLog } from "@/lib/worklog-actions";
import type {
  MaterialItem,
  ProjectMember,
  ProjectNote,
  ProjectPhoto,
  ProjectRecord,
  UserProfile,
  WorkgroupRole,
  WorkLog,
} from "@/lib/types";

import { MaterialEditor } from "./material-editor";
import { InviteMemberEditor } from "./invite-member-editor";
import { NoteEditor } from "./note-editor";
import { PhotoViewer } from "./photo-viewer";
import { ProjectEditor } from "./project-editor";
import styles from "./project-detail.module.css";
import { WorkLogEditor } from "./worklog-editor";

type DetailTab = "materials" | "notes" | "worklogs" | "photos";

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: "photos", label: "Fotos" },
  { id: "worklogs", label: "Arbeitszeit" },
  { id: "materials", label: "Materialien" },
  { id: "notes", label: "Tätigkeiten" },
];

const displayTabs = tabs.map((tab) =>
  tab.id === "notes" ? { ...tab, label: "Tätigkeiten" } : tab,
);

function formatDate(value: Date | null, withTime = false) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(value);
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toLocaleString("de-AT", {
    maximumFractionDigits: 2,
  });
}

function formatExportNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(/0+$/u, "")
    .replace(/\.$/u, "");
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 80);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
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

function EditIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
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
  );
}

function ArchiveIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4 7h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 7h12v11H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 11h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DeleteIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9 7V5h6v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PdfIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M7 3h10v6H7zM6 13h12v8H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 17h8M8 20h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(auth));
  const [hasProjectResponse, setHasProjectResponse] = useState(false);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [projectError, setProjectError] = useState("");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [tab, setTab] = useState<DetailTab>("materials");
  const [editingMaterial, setEditingMaterial] = useState<MaterialItem | null>(null);
  const [isCreatingMaterial, setIsCreatingMaterial] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [isCreatingWorkLog, setIsCreatingWorkLog] = useState(false);
  const [editingWorkLog, setEditingWorkLog] = useState<WorkLog | null>(null);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [noteActionError, setNoteActionError] = useState("");
  const [workLogActionError, setWorkLogActionError] = useState("");
  const [projectActionError, setProjectActionError] = useState("");
  const [memberActionBusyId, setMemberActionBusyId] = useState("");
  const [inferredWorkgroupRole, setInferredWorkgroupRole] = useState<WorkgroupRole | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) setUserProfile(null);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserProfile(user.uid, (nextProfile) => setUserProfile(nextProfile), () => undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const unsubProject = subscribeToProjectDetail(
      projectId,
      (nextProject) => {
        setHasProjectResponse(true);
        setProject(nextProject);
        setProjectError("");
      },
      () => {
        setHasProjectResponse(true);
        setProject(null);
        setProjectError("Projekt konnte im Web gerade nicht geladen werden.");
      },
    );

    const unsubMembers = subscribeToProjectMembers(projectId, (nextMembers) => setMembers(nextMembers), () => undefined);
    const unsubNotes = subscribeToProjectNotes(projectId, (nextNotes) => setNotes(nextNotes), () => undefined);
    const unsubWorkLogs = subscribeToProjectWorkLogs(projectId, (nextLogs) => setWorkLogs(nextLogs), () => undefined);
    const unsubPhotos = subscribeToProjectPhotos(projectId, (nextPhotos) => setPhotos(nextPhotos), () => undefined);

    return () => {
      unsubProject();
      unsubMembers();
      unsubNotes();
      unsubWorkLogs();
      unsubPhotos();
    };
  }, [projectId, user]);

  useEffect(() => {
    if (!project) return;
    return subscribeToProjectMaterials(
      projectId,
      project.materialSortMode,
      (nextMaterials) => setMaterials(nextMaterials),
      () => undefined,
    );
  }, [project, projectId]);

  useEffect(() => {
    const workgroupId = project?.workgroupId ?? null;
    const userId = user?.uid ?? null;
    if (!db || !userId || !workgroupId) return;

    return onSnapshot(
      doc(collection(db, "workgroup_members"), `${workgroupId}_${userId}`),
      (membershipSnapshot) => {
        if (!membershipSnapshot.exists()) {
          setInferredWorkgroupRole(null);
          return;
        }
        const rawRole = String(membershipSnapshot.data()?.role ?? "member").toLowerCase();
        if (rawRole === "owner" || rawRole === "admin") {
          setInferredWorkgroupRole(rawRole);
          return;
        }
        setInferredWorkgroupRole("member");
      },
      () => setInferredWorkgroupRole(null),
    );
  }, [project?.workgroupId, user?.uid]);

  const ownMembership = members.find((member) => member.userId === user?.uid) ?? null;
  const hasSuperuserAccess = isSuperuser(userProfile?.globalRole);
  const fallbackRole =
    project?.workgroupId && user?.uid && inferredWorkgroupRole
      ? workgroupRoleToProjectRole(inferredWorkgroupRole)
      : null;
  const effectiveRole = hasSuperuserAccess ? "owner" : ownMembership?.role ?? fallbackRole;
  const materialWriteAllowed = effectiveRole ? canWriteMaterials(effectiveRole, hasSuperuserAccess) : false;
  const memberManagementAllowed = effectiveRole ? canManageMembers(effectiveRole, hasSuperuserAccess) : false;
  const projectManageAllowed = memberManagementAllowed;
  const canLeaveProject = Boolean(ownMembership && ownMembership.role !== "owner");
  const deferredTab = useDeferredValue(tab);
  const tabContentRefreshing = deferredTab !== tab;
  const projectLoading = user !== null && !hasProjectResponse;
  const showMobileCreateAction =
    materialWriteAllowed && (tab === "materials" || tab === "notes" || tab === "worklogs");
  const memberRoleOrder: Record<ProjectMember["role"], number> = {
    owner: 0,
    admin: 1,
    worker: 2,
    viewer: 3,
  };
  const sortedMembers = [...members].sort((first, second) => {
    const roleDifference = memberRoleOrder[first.role] - memberRoleOrder[second.role];
    if (roleDifference !== 0) {
      return roleDifference;
    }
    return first.email.localeCompare(second.email, "de-AT");
  });

  function handleCreateForTab() {
    if (tab === "materials") {
      setIsCreatingMaterial(true);
      return;
    }
    if (tab === "notes") {
      setIsCreatingNote(true);
      return;
    }
    if (tab === "worklogs") {
      setIsCreatingWorkLog(true);
    }
  }

  async function handleLogout() {
    if (!auth) return;
    await signOut(auth);
  }

  async function handleDeleteNote(noteId: string) {
    try {
      setNoteActionError("");
      await deleteNote(noteId);
    } catch {
      setNoteActionError("Notiz konnte im Web gerade nicht gelöscht werden.");
    }
  }

  async function handleDeleteWorkLog(workLogId: string) {
    try {
      setWorkLogActionError("");
      await deleteWorkLog(workLogId);
    } catch {
      setWorkLogActionError("Arbeitszeit konnte im Web gerade nicht gelöscht werden.");
    }
  }

  async function handleArchiveToggle() {
    if (!project || !memberManagementAllowed) return;
    try {
      setProjectActionError("");
      await setProjectArchived({ projectId: project.id, archived: !project.archived });
    } catch {
      setProjectActionError("Projektstatus konnte im Web gerade nicht geändert werden.");
    }
  }

  async function handleLeaveProject() {
    if (!project || !user || !ownMembership || ownMembership.role === "owner") {
      return;
    }

    const confirmed = window.confirm(
      `Projekt "${project.name || "Unbenanntes Projekt"}" wirklich verlassen?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setMemberActionBusyId("self-leave");
      setProjectActionError("");
      await removeMember({
        projectId: project.id,
        userId: user.uid,
      });
      router.push("/?section=projects");
    } catch (error) {
      setProjectActionError(
        error instanceof Error ? error.message : "Projekt konnte im Web gerade nicht verlassen werden.",
      );
    } finally {
      setMemberActionBusyId("");
    }
  }

  async function handleRemoveProjectMember(member: ProjectMember) {
    if (!project || !memberManagementAllowed || !user) {
      return;
    }

    if (member.userId === user.uid) {
      await handleLeaveProject();
      return;
    }

    if (member.role === "owner") {
      setProjectActionError("Owner kann nicht aus dem Projekt entfernt werden.");
      return;
    }

    const confirmed = window.confirm(
      `Mitglied "${member.email || member.userId}" wirklich entfernen?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setMemberActionBusyId(member.id);
      setProjectActionError("");
      await removeMember({
        projectId: project.id,
        userId: member.userId,
      });
    } catch (error) {
      setProjectActionError(
        error instanceof Error ? error.message : "Mitglied konnte im Web gerade nicht entfernt werden.",
      );
    } finally {
      setMemberActionBusyId("");
    }
  }

  async function handleDeleteMaterial(materialId: string) {
    if (!materialWriteAllowed) {
      return;
    }

    const confirmed = window.confirm("Material wirklich löschen?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteMaterial(materialId);
    } catch {
      setProjectActionError("Material konnte im Web gerade nicht gelöscht werden.");
    }
  }

  async function handleSortModeChange(nextSortMode: "input" | "alphabetical") {
    if (!project || project.materialSortMode === nextSortMode || !materialWriteAllowed) {
      return;
    }

    try {
      setProjectActionError("");
      await setProjectMaterialSortMode({
        projectId: project.id,
        materialSortMode: nextSortMode,
      });
    } catch {
      setProjectActionError("Sortierung konnte im Web gerade nicht gespeichert werden.");
    }
  }

  async function handleCopyProjectCode() {
    if (!project) {
      return;
    }

    const code = project.projectCode?.trim();
    if (!code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      setProjectActionError("Projekt-Code konnte nicht kopiert werden.");
    }
  }

  async function handleExportPdf() {
    if (!project) {
      return;
    }

    try {
      setProjectActionError("");
      let usedNewExport = false;

      {
        const [{ jsPDF }, autoTableModule] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const autoTable = autoTableModule.default;
        if (typeof autoTable !== "function") {
          throw new Error("PDF helper not available");
        }

        const exportDateNew = new Intl.DateTimeFormat("de-AT", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date());
        const projectNameNew = project.name?.trim() || "Unbenanntes Projekt";
        const activitiesNew = notes.map((entry) => entry.text.trim()).filter((entry) => entry.length > 0);
        const totalHoursNew = workLogs.reduce(
          (sum, entry) => sum + (Number.isFinite(entry.hours) ? entry.hours : 0),
          0,
        );

        const doc = new jsPDF({
          orientation: "p",
          unit: "mm",
          format: "a4",
        });

        let cursorY = 16;
        const pageWidth = doc.internal.pageSize.getWidth();
        const leftX = 14;
        const rightX = pageWidth - 14;
        const contentWidth = rightX - leftX;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(19);
        doc.text("WorkShare Materialexport", leftX, cursorY);
        cursorY += 7;

        doc.setDrawColor(213, 222, 234);
        doc.line(leftX, cursorY, rightX, cursorY);
        cursorY += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(`Projekt: ${projectNameNew}`, leftX, cursorY);
        cursorY += 5;
        doc.text(`Erstellt am: ${exportDateNew}`, leftX, cursorY);
        cursorY += 7;

        if (activitiesNew.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text("Tätigkeiten", leftX, cursorY);
          cursorY += 5;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          for (const activity of activitiesNew) {
            const lines = doc.splitTextToSize(`- ${activity}`, contentWidth) as string[];
            for (const line of lines) {
              if (cursorY > 280) {
                doc.addPage();
                cursorY = 16;
              }
              doc.text(line, leftX, cursorY);
              cursorY += 4.6;
            }
          }
          cursorY += 3;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Materialien", leftX, cursorY);
        cursorY += 2;

        autoTable(doc, {
          startY: cursorY,
          head: [["Name", "Menge", "Einheit"]],
          body: materials.length
            ? materials.map((item) => [item.name, formatExportNumber(item.quantity), item.unit || "-"])
            : [["Keine Materialien vorhanden.", "", ""]],
          styles: {
            font: "helvetica",
            fontSize: 10,
            cellPadding: 2.2,
            lineColor: [213, 222, 234],
            lineWidth: 0.2,
          },
          headStyles: {
            fillColor: [239, 244, 251],
            textColor: [22, 34, 48],
            fontStyle: "bold",
          },
          bodyStyles: {
            textColor: [22, 34, 48],
          },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { cellWidth: 26, halign: "right" },
            2: { cellWidth: 28, halign: "left" },
          },
        });

        const tableState = doc as typeof doc & { lastAutoTable?: { finalY: number } };
        cursorY = (tableState.lastAutoTable?.finalY ?? cursorY + 4) + 8;

        if (workLogs.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.text("Arbeitszeiten", leftX, cursorY);
          cursorY += 2;

          autoTable(doc, {
            startY: cursorY,
            head: [["Arbeiter", "Stunden"]],
            body: workLogs.map((entry) => [entry.worker || "-", formatExportNumber(entry.hours)]),
            styles: {
              font: "helvetica",
              fontSize: 10,
              cellPadding: 2.2,
              lineColor: [213, 222, 234],
              lineWidth: 0.2,
            },
            headStyles: {
              fillColor: [239, 244, 251],
              textColor: [22, 34, 48],
              fontStyle: "bold",
            },
            bodyStyles: {
              textColor: [22, 34, 48],
            },
            columnStyles: {
              0: { cellWidth: "auto" },
              1: { cellWidth: 30, halign: "right" },
            },
          });

          const workLogTableState = doc as typeof doc & { lastAutoTable?: { finalY: number } };
          cursorY = (workLogTableState.lastAutoTable?.finalY ?? cursorY + 4) + 8;
          if (cursorY > 284) {
            doc.addPage();
            cursorY = 16;
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text("Gesamtstunden", leftX, cursorY);
          doc.text(formatExportNumber(totalHoursNew), rightX, cursorY, { align: "right" });
        }

        const fileName = `workshare_material_${sanitizeFileName(projectNameNew) || "projekt"}.pdf`;
        const pdfBlob = doc.output("blob");
        const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

        const canUseFileShare =
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [pdfFile] });

        if (canUseFileShare) {
          try {
            await navigator.share({
              files: [pdfFile],
              title: `WorkShare Materialexport - ${projectNameNew}`,
            });
            return;
          } catch (shareError) {
            if (shareError instanceof DOMException && shareError.name === "AbortError") {
              return;
            }
          }
        }

        const pdfUrl = URL.createObjectURL(pdfBlob);
        const downloadLink = document.createElement("a");
        downloadLink.href = pdfUrl;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 3000);
        usedNewExport = true;
      }

      if (usedNewExport) {
        return;
      }

      const exportDate = new Intl.DateTimeFormat("de-AT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());

      const projectName = project.name?.trim() || "Unbenanntes Projekt";
      const activities = notes
        .map((entry) => entry.text.trim())
        .filter((entry) => entry.length > 0);
      const totalHours = workLogs.reduce((sum, entry) => sum + (Number.isFinite(entry.hours) ? entry.hours : 0), 0);
      const logoUrl = `${window.location.origin}/workshare-logo.png`;

      const materialsRows = materials.length
        ? materials
            .map(
              (item) =>
                `<tr><td>${escapeHtml(item.name)}</td><td class="num">${escapeHtml(
                  formatExportNumber(item.quantity),
                )}</td><td>${escapeHtml(item.unit || "-")}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="3" class="empty">Keine Materialien vorhanden.</td></tr>`;

      const activitiesSection = activities.length
        ? `<h2>Tätigkeiten</h2><ul>${activities
            .map((activity) => `<li>${escapeHtml(activity)}</li>`)
            .join("")}</ul>`
        : "";

      const workLogsSection = workLogs.length
        ? `<h2>Arbeitszeiten</h2>
          <table>
            <thead>
              <tr><th>Arbeiter</th><th class="num">Stunden</th></tr>
            </thead>
            <tbody>
              ${workLogs
                .map(
                  (entry) =>
                    `<tr><td>${escapeHtml(entry.worker || "-")}</td><td class="num">${escapeHtml(
                      formatExportNumber(entry.hours),
                    )}</td></tr>`,
                )
                .join("")}
            </tbody>
          </table>
          <div class="totalRow"><span>Gesamtstunden</span><strong>${escapeHtml(formatExportNumber(totalHours))}</strong></div>`
        : "";

      const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>WorkShare Materialexport</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { margin: 0; font-family: Arial, sans-serif; color: #162230; font-size: 12px; line-height: 1.4; }
      .header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .logo { width: 54px; height: 54px; object-fit: contain; }
      h1 { margin: 0; font-size: 22px; }
      h2 { margin: 14px 0 6px; font-size: 14px; }
      .meta { margin: 0 0 2px; }
      hr { border: none; border-top: 1px solid #d5deea; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th, td { border: 1px solid #d5deea; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #eff4fb; font-weight: 700; }
      .num { text-align: right; white-space: nowrap; }
      ul { margin: 0; padding-left: 16px; }
      li { margin: 0 0 3px; }
      .empty { color: #6d7f98; text-align: center; }
      .totalRow { margin-top: 8px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="header">
      <img src="${escapeHtml(logoUrl)}" alt="WorkShare" class="logo" />
      <h1>WorkShare Materialexport</h1>
    </div>
    <hr />
    <p class="meta"><strong>Projekt:</strong> ${escapeHtml(projectName)}</p>
    <p class="meta"><strong>Erstellt am:</strong> ${escapeHtml(exportDate)}</p>
    ${activitiesSection}
    <h2>Materialien</h2>
    <table>
      <thead>
        <tr><th>Name</th><th class="num">Menge</th><th>Einheit</th></tr>
      </thead>
      <tbody>${materialsRows}</tbody>
    </table>
    ${workLogsSection}
  </body>
</html>`;

      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.style.opacity = "0";
      frame.style.pointerEvents = "none";
      document.body.appendChild(frame);

      const cleanup = () => {
        frame.remove();
      };

      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        cleanup();
        return;
      }

      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();

      let printStarted = false;
      const printFrame = () => {
        if (printStarted) {
          return;
        }
        printStarted = true;

        const frameWindow = frame.contentWindow;
        if (!frameWindow) {
          cleanup();
          return;
        }

        const handleAfterPrint = () => {
          frameWindow.removeEventListener("afterprint", handleAfterPrint);
          cleanup();
        };

        frameWindow.addEventListener("afterprint", handleAfterPrint);
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(cleanup, 60000);
      };

      frame.onload = () => {
        window.setTimeout(printFrame, 120);
      };
      if (frameDocument.readyState === "complete") {
        window.setTimeout(printFrame, 120);
      }
    } catch {
      setProjectActionError("PDF-Export konnte im Web gerade nicht gestartet werden.");
    }
  }

  if (authLoading) {
    return (
      <main className={styles.shell}>
        <section className={styles.layout}>
          <section className={styles.panel}>
            <p className={styles.kicker}>WorkShare Web</p>
            <h1>Projekt wird vorbereitet</h1>
            <p className={styles.subtle}>Sitzung und Detailansicht werden geladen.</p>
          </section>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.shell}>
        <section className={styles.layout}>
          <section className={styles.panel}>
            <p className={styles.kicker}>WorkShare Web</p>
            <h1>Nicht eingeloggt</h1>
            <p className={styles.subtle}>Bitte zuerst in der Projektzentrale anmelden.</p>
            <div className={styles.headerActions}>
              <Link href="/" className={styles.backButton}>
                Zur Startseite
              </Link>
            </div>
          </section>
        </section>
      </main>
    );
  }

  if (projectLoading) {
    return (
      <main className={styles.shell}>
        <section className={styles.layout}>
          <section className={styles.panel}>
            <p className={styles.kicker}>WorkShare Web</p>
            <h1>Projekt wird geladen</h1>
            <p className={styles.subtle}>Live-Daten werden verbunden.</p>
          </section>
        </section>
      </main>
    );
  }

  if (!project) {
    return (
      <main className={styles.shell}>
        <section className={styles.layout}>
          <section className={styles.panel}>
            <p className={styles.kicker}>WorkShare Web</p>
            <h1>Projekt nicht verfügbar</h1>
            <p className={projectError ? styles.error : styles.subtle}>
              {projectError || "Dieses Projekt ist nicht vorhanden oder nicht mehr freigegeben."}
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
                  {formatCompanyRole(userProfile.companyRole)
                    ? ` · ${formatCompanyRole(userProfile.companyRole)}`
                    : ""}
                </small>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="PDF exportieren"
              title="PDF exportieren"
              onClick={handleExportPdf}
            >
              <PdfIcon className={styles.inlineIcon} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Logout"
              title="Logout"
              onClick={handleLogout}
            >
              <svg viewBox="0 0 24 24" className={styles.inlineIcon} aria-hidden="true">
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
          <aside className={styles.detailSidebar}>
            <div className={styles.sidebarBlock}>
              <p className={styles.sidebarLabel}>Navigation</p>
              <Link href="/?section=projects" className={styles.sidebarLink}>
                Home
              </Link>
              <Link href="/?section=catalog" className={styles.sidebarLink}>
                Katalog
              </Link>
              <Link href="/?section=settings" className={styles.sidebarLink}>
                Einstellungen
              </Link>
            </div>

            <div className={styles.sidebarBlock}>
              <p className={styles.sidebarLabel}>Projektbereiche</p>
              {displayTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? styles.sidebarNavActive : styles.sidebarNavButton}
                  onClick={() =>
                    startTransition(() => {
                      setTab(item.id);
                    })
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className={styles.sidebarBlock}>
              <p className={styles.sidebarLabel}>Status</p>
              <div className={styles.sidebarStat}>
                <span>Status</span>
                <strong>{project.archived ? "Archiviert" : "Aktiv"}</strong>
              </div>
              <div className={styles.sidebarStat}>
                <span>Rolle</span>
                <strong>{effectiveRole ?? "-"}</strong>
              </div>
              <div className={styles.sidebarStat}>
                <span>Code</span>
                <strong>{project.projectCode?.trim() || "-"}</strong>
              </div>
            </div>
          </aside>

          <section className={styles.layout}>
            <div className={styles.mobileProjectTopbar}>
              <button
                type="button"
                className={styles.mobileTopIcon}
                onClick={() => router.push("/?section=projects")}
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
              <Image
                src="/workshare-logo.png"
                alt="WorkShare"
                width={30}
                height={30}
                className={styles.logo}
              />
              <h1 className={styles.mobileProjectTitle}>WorkShare</h1>
              <div className={styles.mobileProjectTopActions}>
                <button
                  type="button"
                  className={styles.mobileTopIcon}
                  onClick={handleExportPdf}
                  aria-label="PDF exportieren"
                  title="PDF exportieren"
                >
                  <PdfIcon className={styles.inlineIcon} />
                </button>
                {projectManageAllowed ? (
                  <button
                    type="button"
                    className={styles.mobileTopIcon}
                    onClick={() => setIsEditingProject(true)}
                    aria-label="Projekt bearbeiten"
                    title="Projekt bearbeiten"
                  >
                    <EditIcon className={styles.inlineIcon} />
                  </button>
                ) : null}
              </div>
            </div>

            <section className={styles.projectHeaderCard}>
              <div className={styles.projectHero}>
                <div className={styles.projectHeaderTitle}>
                  <h2>{project.name || "Unbenanntes Projekt"}</h2>
                  <p className={styles.projectDateRow}>Erstellt: {formatDate(project.createdAt)}</p>
                  <div className={styles.projectCodeRow}>
                    <strong>Code: {project.projectCode?.trim() || "-"}</strong>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={handleCopyProjectCode}
                      aria-label="Projekt-Code kopieren"
                      title="Projekt-Code kopieren"
                    >
                      <svg viewBox="0 0 24 24" className={styles.inlineIcon} aria-hidden="true">
                        <path
                          d="M9 9h10v12H9zM5 3h10v12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className={styles.projectHeroActions}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => setShowMembersPanel((current) => !current)}
                    aria-expanded={showMembersPanel}
                    aria-controls="project-members-panel"
                  >
                    Mitglieder ({members.length})
                  </button>
                  {memberManagementAllowed ? (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setIsInvitingMember(true)}
                    >
                      Einladen
                    </button>
                  ) : null}
                  {canLeaveProject ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={handleLeaveProject}
                      disabled={memberActionBusyId === "self-leave"}
                    >
                      {memberActionBusyId === "self-leave" ? "Verlasse..." : "Projekt verlassen"}
                    </button>
                  ) : null}
                  {projectManageAllowed ? (
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={handleArchiveToggle}
                      aria-label={project.archived ? "Projekt aktivieren" : "Projekt archivieren"}
                      title={project.archived ? "Projekt aktivieren" : "Projekt archivieren"}
                    >
                      <ArchiveIcon className={styles.inlineIcon} />
                    </button>
                  ) : null}
                  <span className={project.archived ? styles.badgeMuted : styles.badge}>
                    {project.archived ? "Archiviert" : "Aktiv"}
                  </span>
                  {effectiveRole ? <span className={styles.roleBadge}>{effectiveRole}</span> : null}
                </div>
              </div>

              {showMembersPanel ? (
                <section id="project-members-panel" className={styles.membersPanel}>
                  {sortedMembers.length === 0 ? (
                    <p className={styles.subtle}>Noch keine Mitglieder vorhanden.</p>
                  ) : (
                    <ul className={styles.memberList}>
                      {sortedMembers.map((member) => (
                        <li key={member.id} className={styles.memberRow}>
                          <div className={styles.memberMeta}>
                            <strong>{member.email || "-"}</strong>
                            <span>Beigetreten {formatDate(member.joinedAt, true)}</span>
                          </div>
                          <div className={styles.memberRowRight}>
                            <span className={styles.roleBadge}>{member.role}</span>
                            {memberManagementAllowed &&
                            member.userId !== user?.uid &&
                            member.role !== "owner" ? (
                              <button
                                type="button"
                                className={styles.memberRemoveButton}
                                onClick={() => handleRemoveProjectMember(member)}
                                disabled={memberActionBusyId === member.id}
                              >
                                {memberActionBusyId === member.id ? "Entferne..." : "Entfernen"}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              {projectActionError ? <p className={styles.error}>{projectActionError}</p> : null}
            </section>

            <section className={styles.projectContentCard}>
              <div className={styles.contentHead}>
                <h3>Projektinhalt</h3>
                <div className={styles.tabBar}>
                  {displayTabs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={tab === item.id ? styles.tabActive : styles.tab}
                      onClick={() =>
                        startTransition(() => {
                          setTab(item.id);
                        })
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "materials" ? (
                <div className={styles.sortBar}>
                  <span>Sortierung:</span>
                  <div className={styles.sortSwitch}>
                    <button
                      type="button"
                      className={
                        project.materialSortMode === "input"
                          ? styles.sortButtonActive
                          : styles.sortButton
                      }
                      onClick={() => handleSortModeChange("input")}
                    >
                      Eingabe
                    </button>
                    <button
                      type="button"
                      className={
                        project.materialSortMode === "alphabetical"
                          ? styles.sortButtonActive
                          : styles.sortButton
                      }
                      onClick={() => handleSortModeChange("alphabetical")}
                    >
                      A-Z
                    </button>
                  </div>
                </div>
              ) : null}

              <div
                className={
                  tabContentRefreshing
                    ? `${styles.tabContent} ${styles.tabContentRefreshing}`
                    : styles.tabContent
                }
              >
                {deferredTab === "materials" ? (
                  <>
                    <div className={styles.sectionActions}>
                      {materialWriteAllowed ? (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => setIsCreatingMaterial(true)}
                        >
                          Neues Material
                        </button>
                      ) : null}
                    </div>

                    {materials.length === 0 ? (
                      <div className={styles.emptyState}>
                        <h3>Keine Materialien vorhanden</h3>
                        <p>Dieses Projekt hat aktuell noch keine Materialeinträge.</p>
                      </div>
                    ) : (
                      <div className={styles.grid}>
                        {materials.map((item) => (
                          <article key={item.id} className={styles.listItem}>
                            <div className={styles.listItemTop}>
                              {materialWriteAllowed ? (
                                <button
                                  type="button"
                                  className={styles.materialTitleButton}
                                  onClick={() => setEditingMaterial(item)}
                                  title="Material bearbeiten"
                                  aria-label={`Material ${item.name} bearbeiten`}
                                >
                                  <span className={styles.listItemTitle}>{item.name}</span>
                                </button>
                              ) : (
                                <p className={styles.listItemTitle}>{item.name}</p>
                              )}
                              <div className={styles.itemActions}>
                                {materialWriteAllowed ? (
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => setEditingMaterial(item)}
                                    aria-label="Material bearbeiten"
                                    title="Material bearbeiten"
                                  >
                                    <EditIcon className={styles.inlineIcon} />
                                  </button>
                                ) : null}
                                {materialWriteAllowed ? (
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => handleDeleteMaterial(item.id)}
                                    aria-label="Material löschen"
                                    title="Material löschen"
                                  >
                                    <DeleteIcon className={styles.inlineIcon} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <p className={styles.materialUsage}>
                              Verbraucht: {formatNumber(item.quantity)} {item.unit || "-"}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}

                {deferredTab === "notes" ? (
                  <>
                    <div className={styles.sectionActions}>
                      {materialWriteAllowed ? (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => setIsCreatingNote(true)}
                        >
                          Neue Notiz
                        </button>
                      ) : null}
                    </div>

                    {notes.length === 0 ? (
                      <div className={styles.emptyState}>
                        <h3>Keine Notizen vorhanden</h3>
                        <p>Zu diesem Projekt wurden noch keine Notizen erfasst.</p>
                      </div>
                    ) : (
                      <div className={styles.grid}>
                        {notes.map((note) => (
                          <article key={note.id} className={styles.listItem}>
                            <div className={styles.listItemTop}>
                              <p className={styles.listItemTitle}>Notiz</p>
                              <div className={styles.itemActions}>
                                {materialWriteAllowed ? (
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => setEditingNote(note)}
                                    aria-label="Notiz bearbeiten"
                                    title="Notiz bearbeiten"
                                  >
                                    <EditIcon className={styles.inlineIcon} />
                                  </button>
                                ) : null}
                                {materialWriteAllowed ? (
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => handleDeleteNote(note.id)}
                                    aria-label="Notiz löschen"
                                    title="Notiz löschen"
                                  >
                                    <DeleteIcon className={styles.inlineIcon} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {materialWriteAllowed ? (
                              <button
                                type="button"
                                className={styles.noteTextButton}
                                onClick={() => setEditingNote(note)}
                                title="Notiz bearbeiten"
                                aria-label="Notiz bearbeiten"
                              >
                                <p className={styles.description}>{note.text}</p>
                              </button>
                            ) : (
                              <p className={styles.description}>{note.text}</p>
                            )}
                            <div className={styles.metaRow}>
                              <span>Aktualisiert {formatDate(note.updatedAt, true)}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}

                    {noteActionError ? <p className={styles.error}>{noteActionError}</p> : null}
                  </>
                ) : null}

                {deferredTab === "worklogs" ? (
                  <>
                    <div className={styles.sectionActions}>
                      {materialWriteAllowed ? (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => setIsCreatingWorkLog(true)}
                        >
                          Neue Arbeitszeit
                        </button>
                      ) : null}
                    </div>

                    {workLogs.length === 0 ? (
                      <div className={styles.emptyState}>
                        <h3>Keine Arbeitszeiten vorhanden</h3>
                        <p>Zu diesem Projekt wurden noch keine Arbeitszeiten erfasst.</p>
                      </div>
                    ) : (
                      <div className={styles.grid}>
                        {workLogs.map((entry) => (
                          <article key={entry.id} className={styles.listItem}>
                            <div className={styles.listItemTop}>
                              <p className={styles.listItemTitle}>{formatNumber(entry.hours)} h</p>
                              <div className={styles.itemActions}>
                                <span className={styles.roleBadge}>{entry.worker || "-"}</span>
                                {materialWriteAllowed ? (
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => setEditingWorkLog(entry)}
                                    aria-label="Arbeitszeit bearbeiten"
                                    title="Arbeitszeit bearbeiten"
                                  >
                                    <EditIcon className={styles.inlineIcon} />
                                  </button>
                                ) : null}
                                {materialWriteAllowed ? (
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => handleDeleteWorkLog(entry.id)}
                                    aria-label="Arbeitszeit löschen"
                                    title="Arbeitszeit löschen"
                                  >
                                    <DeleteIcon className={styles.inlineIcon} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <div className={styles.metaRow}>
                              <span>Aktualisiert {formatDate(entry.updatedAt, true)}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}

                    {workLogActionError ? <p className={styles.error}>{workLogActionError}</p> : null}
                  </>
                ) : null}

                {deferredTab === "photos" ? (
                  photos.length === 0 ? (
                    <div className={styles.emptyState}>
                      <h3>Keine Fotos vorhanden</h3>
                      <p>Zu diesem Projekt wurden noch keine Fotos hochgeladen.</p>
                    </div>
                  ) : (
                    <div className={styles.gallery}>
                      {photos.map((photo, index) => (
                        <article key={photo.id} className={styles.galleryItem}>
                          <button
                            type="button"
                            className={styles.galleryButton}
                            onClick={() => setActivePhotoIndex(index)}
                          >
                            {photo.downloadUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photo.downloadUrl} alt="Projektfoto" />
                            ) : (
                              <div className={styles.galleryFallback}>Kein Vorschaubild</div>
                            )}
                          </button>
                          <div className={styles.galleryMeta}>
                            <div>{photo.uploadStatus}</div>
                            <div>{formatDate(photo.updatedAt, true)}</div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            </section>

            <nav className={styles.mobileTabDock} aria-label="Projektbereiche mobil">
              {displayTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? styles.mobileTabActive : styles.mobileTabButton}
                  onClick={() =>
                    startTransition(() => {
                      setTab(item.id);
                    })
                  }
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </section>
        </section>
      </section>

      {showMobileCreateAction ? (
        <button
          type="button"
          className={styles.mobileFab}
          onClick={handleCreateForTab}
          aria-label="Eintrag anlegen"
          title="Eintrag anlegen"
        >
          <svg viewBox="0 0 24 24" className={styles.inlineIcon} aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      {isCreatingMaterial ? (
        <MaterialEditor
          projectId={project.id}
          userId={user.uid}
          workgroupId={project.workgroupId ?? null}
          onClose={() => setIsCreatingMaterial(false)}
        />
      ) : null}

      {editingMaterial ? (
        <MaterialEditor
          projectId={project.id}
          userId={user.uid}
          workgroupId={project.workgroupId ?? null}
          material={editingMaterial}
          onClose={() => setEditingMaterial(null)}
        />
      ) : null}

      {isCreatingNote ? (
        <NoteEditor projectId={project.id} userId={user.uid} onClose={() => setIsCreatingNote(false)} />
      ) : null}

      {editingNote ? (
        <NoteEditor
          projectId={project.id}
          userId={user.uid}
          note={editingNote}
          onClose={() => setEditingNote(null)}
        />
      ) : null}

      {isCreatingWorkLog ? (
        <WorkLogEditor
          projectId={project.id}
          userId={user.uid}
          onClose={() => setIsCreatingWorkLog(false)}
        />
      ) : null}

      {editingWorkLog ? (
        <WorkLogEditor
          projectId={project.id}
          userId={user.uid}
          workLog={editingWorkLog}
          onClose={() => setEditingWorkLog(null)}
        />
      ) : null}

      {isInvitingMember ? (
        <InviteMemberEditor
          projectId={project.id}
          projectName={project.name || "Projekt"}
          userId={user.uid}
          onClose={() => setIsInvitingMember(false)}
        />
      ) : null}

      {isEditingProject ? (
        <ProjectEditor
          project={project}
          canArchive={projectManageAllowed}
          canDelete={effectiveRole === "owner"}
          onClose={() => setIsEditingProject(false)}
          onDeleted={() => router.push("/")}
        />
      ) : null}

      {activePhotoIndex !== null ? (
        <PhotoViewer
          photos={photos}
          activeIndex={activePhotoIndex}
          onClose={() => setActivePhotoIndex(null)}
          onNext={() =>
            setActivePhotoIndex((current) => (current === null ? 0 : (current + 1) % photos.length))
          }
          onPrevious={() =>
            setActivePhotoIndex((current) =>
              current === null ? 0 : (current - 1 + photos.length) % photos.length,
            )
          }
        />
      ) : null}
    </main>
  );
}

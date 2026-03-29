import type { ProjectRole, WorkgroupRole } from "@/lib/types";

export function workgroupRoleToProjectRole(role: WorkgroupRole): ProjectRole {
  if (role === "owner" || role === "admin") {
    return role;
  }

  return "worker";
}

export function isSuperuser(globalRole?: string | null) {
  return String(globalRole ?? "").toLowerCase() === "superadmin";
}

export function canManageMembers(role: ProjectRole, superuser = false) {
  if (superuser) {
    return true;
  }

  return role === "owner" || role === "admin";
}

export function canWriteMaterials(role: ProjectRole, superuser = false) {
  if (superuser) {
    return true;
  }

  return role === "owner" || role === "admin" || role === "worker";
}

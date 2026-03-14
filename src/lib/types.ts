export type ProjectRole = "owner" | "admin" | "worker" | "viewer";

export type MaterialSortMode = "input" | "alphabetical";

export type ProjectSummary = {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  workgroupId?: string | null;
  projectCode?: string | null;
  materialSortMode: MaterialSortMode;
  archived: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
  role: ProjectRole;
  memberEmail: string;
};

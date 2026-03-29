export type ProjectRole = "owner" | "admin" | "worker" | "viewer";
export type WorkgroupRole = "owner" | "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked";
export type GlobalUserRole = "superadmin" | "user";
export type CompanyRole = "company_owner" | "company_admin" | "company_member" | null;

export type MaterialSortMode = "input" | "alphabetical";

export type ProjectRecord = {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  companyId?: string | null;
  companyName?: string | null;
  companyCode?: string | null;
  workgroupId?: string | null;
  projectCode?: string | null;
  materialSortMode: MaterialSortMode;
  archived: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProjectSummary = ProjectRecord & {
  role: ProjectRole;
  memberEmail: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  role: ProjectRole;
  invitedBy?: string | null;
  joinedAt: Date | null;
};

export type MaterialItem = {
  id: string;
  projectId: string;
  name: string;
  quantity: number;
  unit: string;
  catalogEntryId?: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CatalogEntry = {
  id: string;
  name: string;
  nameLower: string;
  unit: string;
  category: string | null;
  createdBy: string;
  workgroupId: string | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProjectNote = {
  id: string;
  projectId: string;
  text: string;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type WorkLog = {
  id: string;
  projectId: string;
  hours: number;
  worker: string;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProjectPhotoUploadStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed";

export type ProjectPhoto = {
  id: string;
  projectId: string;
  storagePath: string;
  downloadUrl: string;
  localPath: string;
  uploadStatus: ProjectPhotoUploadStatus;
  uploadProgress: number;
  errorMessage?: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type WorkgroupSummary = {
  id: string;
  name: string;
  ownerId: string;
  companyId: string | null;
  companyName: string | null;
  companyCode?: string | null;
  joinCode: string;
  role: WorkgroupRole;
  memberEmail: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type InvitationSummary = {
  id: string;
  email: string;
  status: InvitationStatus;
  role: ProjectRole | WorkgroupRole;
  projectId: string | null;
  projectName: string | null;
  workgroupId: string | null;
  workgroupName: string | null;
  invitedBy: string | null;
  createdAt: Date | null;
  acceptedAt: Date | null;
};

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  projectId: string | null;
  workgroupId: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  readAt: Date | null;
};

export type CompanyRecord = {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CompanyMembership = {
  id: string;
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  role: Exclude<CompanyRole, null>;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  globalRole: GlobalUserRole;
  companyId: string | null;
  companyName: string;
  companyCode: string;
  companyRole: CompanyRole;
};

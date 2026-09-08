import type { AdminUserStatus } from '../../services/geminiService';

export const adminUserStatusLabels: Record<AdminUserStatus, string> = {
  active: "Actif",
  suspended: "Suspendu",
  deleted: "Supprime"
};

export const adminUserStatusBadgeClass: Record<AdminUserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  suspended: "bg-red-50 text-red-600",
  deleted: "bg-gray-100 text-gray-500"
};

export const normalizeAdminUserStatus = (status: string = "active"): AdminUserStatus =>
  status === "suspended" || status === "deleted" ? status : "active";

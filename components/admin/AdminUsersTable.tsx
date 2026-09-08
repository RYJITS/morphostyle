import React from 'react';
import { Ban, Loader2, Minus, Plus, RefreshCw, Trash2, User, X } from 'lucide-react';
import type { AdminUser, AdminUserDetail, AdminUserStatus } from '../../services/geminiService';
import { adminUserStatusBadgeClass, adminUserStatusLabels, normalizeAdminUserStatus } from './adminUserStatus';

type AdminUsersTableProps = {
  users: AdminUser[];
  selectedUser: AdminUserDetail | null;
  isLoading: boolean;
  busyId: string | null;
  isCreditBusy: boolean;
  formattedDate: (value: string) => string;
  onApplyUserFilter: (user: AdminUser) => void | Promise<void>;
  onAdjustSelectedUserCredits: (amount: number) => void | Promise<void>;
  onSetUserStatus: (user: AdminUser, nextStatus: AdminUserStatus) => void | Promise<void>;
  onClearUserFilter: () => void;
};

export default function AdminUsersTable({
  users,
  selectedUser,
  isLoading,
  busyId,
  isCreditBusy,
  formattedDate,
  onApplyUserFilter,
  onAdjustSelectedUserCredits,
  onSetUserStatus,
  onClearUserFilter
}: AdminUsersTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-widest text-rose-500">Comptes</div>
          <h2 className="serif text-2xl font-bold text-gray-950">Utilisateurs</h2>
        </div>
        <div className="shrink-0 text-[10px] font-black uppercase tracking-widest text-gray-400">{users.length} lignes</div>
      </div>

      <div className="divide-y divide-gray-100">
        {isLoading && users.length === 0 ? (
          <div className="px-4 py-8 text-sm font-bold text-gray-400">Chargement...</div>
        ) : users.length > 0 ? users.map(user => {
          const isSelectedUser = selectedUser?.id === user.id;
          const userStatus = normalizeAdminUserStatus(user.status);
          const isProtectedAdminUser = user.role === "admin";
          const isUserBusy = Boolean(busyId?.startsWith(`user-${user.id}-`));

          return (
            <article
              key={user.id}
              className={`px-4 py-4 transition-colors ${isSelectedUser ? "bg-rose-50/80" : "hover:bg-gray-50"}`}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] xl:grid-cols-[minmax(0,1fr)_minmax(13rem,16rem)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-widest">
                    <span className={`rounded-full px-2 py-1 ${adminUserStatusBadgeClass[userStatus]}`}>
                      {adminUserStatusLabels[userStatus]}
                    </span>
                    <span className="rounded-full bg-gray-50 px-2 py-1 text-gray-500">{user.role}</span>
                    {user.lastLoginAt && <span className="rounded-full bg-gray-50 px-2 py-1 text-gray-400">{formattedDate(user.lastLoginAt)}</span>}
                  </div>
                  <div className="mt-2 break-all text-sm font-black leading-snug text-gray-950">{user.email}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-gray-50 px-2 py-2">
                      <div className="text-sm font-black text-gray-950">{user.generationCount}</div>
                      <div className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">Fiches</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-2 py-2">
                      <div className="text-sm font-black text-gray-950">{user.publishedCount}</div>
                      <div className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">Public</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-2 py-2">
                      <div className="text-sm font-black text-rose-600">{Number(user.creditBalance || 0)}</div>
                      <div className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">Credits</div>
                    </div>
                  </div>

                  {isSelectedUser && (
                    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-rose-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ajuster les credits</div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAdjustSelectedUserCredits(-1);
                          }}
                          disabled={isCreditBusy}
                          className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 text-[9px] font-black uppercase tracking-widest text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                          title="Retirer 1 credit"
                          aria-label="Retirer 1 credit"
                        >
                          {isCreditBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
                          Retirer
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAdjustSelectedUserCredits(1);
                          }}
                          disabled={isCreditBusy}
                          className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-[9px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50"
                          title="Ajouter 1 credit"
                          aria-label="Ajouter 1 credit"
                        >
                          {isCreditBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Ajouter
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => void onApplyUserFilter(user)}
                    className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-3 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-colors hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                    title="Voir le detail utilisateur"
                    aria-label={`Voir le detail de ${user.email}`}
                  >
                    <User className="h-3.5 w-3.5" />
                    Details
                  </button>

                  {isProtectedAdminUser ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-[9px] font-black uppercase tracking-widest text-rose-300 disabled:cursor-not-allowed"
                      title="Compte administrateur protege"
                      aria-label="Compte administrateur protege"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Admin protege
                    </button>
                  ) : (
                    <>
                      {userStatus !== "active" ? (
                        <button
                          type="button"
                          onClick={() => void onSetUserStatus(user, "active")}
                          disabled={isUserBusy}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 text-[9px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50"
                        >
                          {busyId === `user-${user.id}-active` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Reactiver
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void onSetUserStatus(user, "suspended")}
                          disabled={isUserBusy}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 text-[9px] font-black uppercase tracking-widest text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                        >
                          {busyId === `user-${user.id}-suspended` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                          Suspendre
                        </button>
                      )}

                      {userStatus !== "deleted" && (
                        <button
                          type="button"
                          onClick={() => void onSetUserStatus(user, "deleted")}
                          disabled={isUserBusy}
                          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-950 px-3 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:bg-rose-600 disabled:cursor-wait disabled:opacity-50"
                        >
                          {busyId === `user-${user.id}-deleted` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-rose-300" />}
                          Supprimer
                        </button>
                      )}
                    </>
                  )}

                  {isSelectedUser && (
                    <button
                      type="button"
                      onClick={onClearUserFilter}
                      className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white px-3 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-colors hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                      title="Fermer cet utilisateur"
                      aria-label="Fermer cet utilisateur"
                    >
                      <X className="h-3.5 w-3.5" />
                      Fermer
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="px-4 py-8 text-sm font-bold text-gray-400">Aucun utilisateur.</div>
        )}
      </div>
    </section>
  );
}

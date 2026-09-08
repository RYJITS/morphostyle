import React from 'react';
import {
  CalendarDays,
  Coins,
  Database,
  FolderOpen,
  Images,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  User
} from 'lucide-react';
import type { AnalysisResult, PublicGeneration } from '../types';
import type { MorphoOwner } from '../services/geminiService';

type UserSpacePageProps = {
  account: MorphoOwner | null;
  accountCreditBalance: number | null;
  accountQuota: AnalysisResult["quota"] | null;
  storageLabel: string;
  userHistory: PublicGeneration[];
  userHistoryMessage: string | null;
  isUserHistoryLoading: boolean;
  isAuthBusy: boolean;
  deletingGenerationId: string | null;
  imageCount: number;
  publishedCount: number;
  latestDate: string;
  generationCoverUrl: (item: PublicGeneration) => string;
  generationImageCount: (item: PublicGeneration) => number;
  isGenerationPublished: (item: PublicGeneration) => boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenGeneration: (item: PublicGeneration) => void;
  onDeleteGeneration: (item: PublicGeneration) => void | Promise<void>;
  onHistoryImageError: (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
    item: PublicGeneration,
    coverUrl: string
  ) => void;
};

export default function UserSpacePage({
  account,
  accountCreditBalance,
  accountQuota,
  storageLabel,
  userHistory,
  userHistoryMessage,
  isUserHistoryLoading,
  isAuthBusy,
  deletingGenerationId,
  imageCount,
  publishedCount,
  latestDate,
  generationCoverUrl,
  generationImageCount,
  isGenerationPublished,
  onRefresh,
  onLogout,
  onOpenGeneration,
  onDeleteGeneration,
  onHistoryImageError
}: UserSpacePageProps) {
  return (
    <div className="mx-auto max-w-6xl py-10 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
            <Settings className="h-3.5 w-3.5 text-rose-300" />
            Espace utilisateur
          </div>
          <h1 className="serif text-4xl font-bold leading-tight text-gray-950 sm:text-5xl">Parametres et historique</h1>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isUserHistoryLoading}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-100 bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-rose-100"
        >
          {isUserHistoryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Compte connecte</div>
                <div className="truncate text-sm font-black text-gray-950">{account?.email}</div>
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-600">
                  <Coins className="h-3.5 w-3.5" />
                  Credits disponibles
                </span>
                <span className="text-2xl font-black text-gray-950">
                  {typeof accountCreditBalance === "number" ? accountCreditBalance : "-"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-3">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-rose-500" />
                  Statut
                </span>
                <span className="text-xs font-black text-gray-950">{account?.status || "active"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-3">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <Database className="h-3.5 w-3.5 text-rose-500" />
                  Memoire
                </span>
                <span className="text-xs font-black text-gray-950">{storageLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-3">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <CalendarDays className="h-3.5 w-3.5 text-rose-500" />
                  Essais
                </span>
                <span className="text-xs font-black text-gray-950">
                  {accountQuota ? `${accountQuota.remaining}/${accountQuota.limit}` : "-"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              disabled={isAuthBusy}
              className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-rose-100"
            >
              {isAuthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 text-rose-300" />}
              Deconnexion
            </button>
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Bibliotheque</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-gray-50 p-3">
                <div className="text-lg font-black text-gray-950">{userHistory.length}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">Fiches</div>
              </div>
              <div className="rounded-2xl bg-gray-50 p-3">
                <div className="text-lg font-black text-gray-950">{imageCount}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">Images</div>
              </div>
              <div className="rounded-2xl bg-gray-50 p-3">
                <div className="text-lg font-black text-gray-950">{publishedCount}</div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">Public</div>
              </div>
            </div>
            {latestDate && (
              <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-rose-600">
                Dernier resultat: {latestDate}
              </div>
            )}
          </section>
        </aside>

        <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600 ring-1 ring-rose-100">
                <FolderOpen className="h-3.5 w-3.5" />
                Assets utilisateur
              </div>
              <h2 className="serif text-3xl font-bold text-gray-950">Tout l'historique</h2>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              {userHistory.length} resultat{userHistory.length > 1 ? "s" : ""}
            </div>
          </div>

          {userHistoryMessage && (
            <div className="mb-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
              {userHistoryMessage}
            </div>
          )}

          {isUserHistoryLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : userHistory.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {userHistory.map(item => {
                const coverUrl = generationCoverUrl(item);
                return (
                  <article
                    key={item.id}
                    className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenGeneration(item)}
                      className="block w-full cursor-pointer text-left focus:outline-none focus:ring-4 focus:ring-inset focus:ring-rose-100"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
                        <img
                          src={coverUrl}
                          alt={item.styleName}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(event) => onHistoryImageError(event, item, coverUrl)}
                        />
                      </div>
                      <div className="p-3">
                        <div className="truncate text-xs font-black text-gray-950">{item.styleName}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                          <Images className="h-3 w-3" />
                          {item.sourceLabel}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-gray-50 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-gray-500">
                            {generationImageCount(item)} image{generationImageCount(item) > 1 ? "s" : ""}
                          </span>
                          {isGenerationPublished(item) && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-700">
                              Public
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDeleteGeneration(item);
                      }}
                      disabled={deletingGenerationId === item.id}
                      className="absolute right-2 top-2 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-lg ring-1 ring-rose-100 backdrop-blur-xl transition-all hover:bg-rose-50 hover:text-rose-700 disabled:cursor-wait disabled:opacity-70 focus:outline-none focus:ring-4 focus:ring-rose-100"
                      title="Supprimer cette fiche"
                      aria-label={`Supprimer la fiche ${item.styleName}`}
                    >
                      {deletingGenerationId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 text-center">
              <Images className="h-8 w-8 text-gray-300" />
              <div className="mt-3 text-sm font-black text-gray-950">Aucun resultat sauvegarde</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

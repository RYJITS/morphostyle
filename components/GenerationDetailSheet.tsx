import React from 'react';
import { Download, Globe2, Images, Maximize2, RotateCcw, X } from 'lucide-react';
import type { PublicGeneration } from '../types';
import ShareMenuAction from './ShareMenuAction';

type GenerationDetailScope = 'daily' | 'public';

export type GenerationImageEntry = {
  key: string;
  label: string;
  url: string;
};

type GenerationDetailSheetProps = {
  item: PublicGeneration;
  scope: GenerationDetailScope;
  originalUrl: string;
  imageEntries: GenerationImageEntry[];
  downloadsEnabled: boolean;
  showPublicationAction: boolean;
  canPublish: boolean;
  isPublished: boolean;
  isPublishing: boolean;
  shareMenuId: string | null;
  publicationUnavailableReason: string;
  formattedDate: string;
  canResumeRecommendations: boolean;
  isImageUnavailable: (url?: string) => boolean;
  imageDownloadName: (label: string, suffix: string, url?: string) => string;
  onClose: () => void;
  onZoomImage: (url: string) => void;
  onResumeRecommendations: () => void;
  onOpenShareMenuChange: (menuId: string | null) => void;
  onPublish: () => void;
  onShareExternally: () => void;
  onImageError: (
    event: React.SyntheticEvent<HTMLImageElement, Event>,
    url: string,
    forceUnavailable?: boolean
  ) => void;
};

export default function GenerationDetailSheet({
  item,
  scope,
  originalUrl,
  imageEntries,
  downloadsEnabled,
  showPublicationAction,
  canPublish,
  isPublished,
  isPublishing,
  shareMenuId,
  publicationUnavailableReason,
  formattedDate,
  canResumeRecommendations,
  isImageUnavailable,
  imageDownloadName,
  onClose,
  onZoomImage,
  onResumeRecommendations,
  onOpenShareMenuChange,
  onPublish,
  onShareExternally,
  onImageError
}: GenerationDetailSheetProps) {
  const isPersonalScope = scope === 'daily';

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-xl animate-in fade-in duration-200 sm:py-10">
      <div className="relative mx-auto max-w-6xl rounded-[2rem] bg-white p-4 pt-14 shadow-2xl ring-1 ring-white/40 sm:p-6">
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
          className="absolute right-4 top-4 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100 sm:right-6 sm:top-6"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:pr-14">
          <div>
            <div className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${isPersonalScope ? 'bg-black text-white' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'}`}>
              {isPersonalScope ? <Images className="h-3.5 w-3.5 text-rose-300" /> : <Globe2 className="h-3.5 w-3.5" />}
              {isPersonalScope ? 'Historique personnel' : 'Vitrine publique'}
            </div>
            <h2 className="serif text-3xl font-bold leading-tight text-gray-950 sm:text-4xl">{item.styleName}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
              <span className="rounded-full bg-gray-50 px-3 py-1">{item.sourceLabel}</span>
              <span className="rounded-full bg-gray-50 px-3 py-1">{item.color}</span>
              {isPersonalScope && item.backgroundTreatment === 'gray' && (
                <span className="rounded-full bg-gray-50 px-3 py-1">Fond gris</span>
              )}
              {formattedDate && (
                <span className="rounded-full bg-gray-50 px-3 py-1">{formattedDate}</span>
              )}
            </div>
            {isPersonalScope && item.backgroundTreatment === 'original' && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">Le fond de la photo a été conservé. Votre résultat est disponible sans nouvelle génération.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPersonalScope && canResumeRecommendations && (
              <button
                type="button"
                onClick={onResumeRecommendations}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-gray-100 bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-600 shadow-sm transition-all hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
              >
                <RotateCcw className="h-4 w-4" />
                Reprendre les recommandations
              </button>
            )}
            {showPublicationAction && (
              <ShareMenuAction
                menuId={`generation-${item.id}`}
                openMenuId={shareMenuId}
                buttonClassName="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-black px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-rose-100"
                menuClassName="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-72 overflow-hidden rounded-2xl border border-gray-100 bg-white p-2 text-left shadow-2xl"
                isPublishing={isPublishing}
                isPublished={isPublished}
                canPublish={canPublish}
                unavailableReason={publicationUnavailableReason}
                onOpenMenuChange={onOpenShareMenuChange}
                onPublish={onPublish}
                onShareExternally={onShareExternally}
              />
            )}
          </div>
        </div>

        <div className={`grid gap-5 ${originalUrl ? 'lg:grid-cols-[1.1fr_1fr]' : ''}`}>
          {originalUrl && (
            <div className="relative overflow-hidden rounded-[1.5rem] border border-rose-100 bg-gray-100 shadow-xl">
              <button
                type="button"
                onClick={() => onZoomImage(originalUrl)}
                disabled={isImageUnavailable(originalUrl)}
                className={`group relative block aspect-[3/4] w-full overflow-hidden ${isImageUnavailable(originalUrl) ? 'cursor-default' : 'cursor-pointer'}`}
                aria-label="Agrandir la photo d'origine"
              >
                <img
                  src={originalUrl}
                  alt="Photo d'origine"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(event) => onImageError(event, originalUrl, true)}
                />
                <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-2xl bg-black/60 px-4 py-3 text-white backdrop-blur-xl">
                  <span className="text-xs font-black uppercase tracking-widest">Photo d'origine</span>
                  <Maximize2 className="h-4 w-4" />
                </div>
              </button>
              {downloadsEnabled && !isImageUnavailable(originalUrl) && (
                <a
                  href={originalUrl}
                  download={imageDownloadName(item.styleName, 'origine', originalUrl)}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute right-4 top-4 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-white/95 px-3 text-[9px] font-black uppercase tracking-widest text-gray-700 shadow-lg backdrop-blur-xl transition-all hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Telecharger
                </a>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Morphologie</div>
              <div className="mt-1 text-sm font-black text-gray-950">{item.faceShape}</div>
            </div>

            <div className={`grid gap-3 ${originalUrl ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {imageEntries.map((entry) => {
                const entryUnavailable = isImageUnavailable(entry.url);
                return (
                  <div key={`${item.id}-${entry.key}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => !entryUnavailable && onZoomImage(entry.url)}
                      disabled={entryUnavailable}
                      className={`group relative block aspect-[3/4] w-full overflow-hidden bg-gray-100 ${entryUnavailable ? 'cursor-default' : 'cursor-pointer'}`}
                      aria-label={`Agrandir ${entry.label}`}
                    >
                      <img
                        src={entry.url}
                        alt={`${item.styleName} ${entry.label}`}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(event) => onImageError(event, entry.url)}
                      />
                      <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/55 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                        {entry.label}
                      </div>
                    </button>
                    {downloadsEnabled && (
                      <div className="p-2">
                        {entryUnavailable ? (
                          <div className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-gray-50 px-2 text-[9px] font-black uppercase tracking-widest text-gray-400">
                            Non disponible
                          </div>
                        ) : (
                          <a
                            href={entry.url}
                            download={imageDownloadName(item.styleName, entry.key, entry.url)}
                            className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 text-[9px] font-black uppercase tracking-widest text-gray-600 transition-all hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Telecharger
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

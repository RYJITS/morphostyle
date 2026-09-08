import { CheckCircle2, Globe2, Loader2, Send, Share2 } from 'lucide-react';

type ShareMenuActionProps = {
  menuId: string;
  openMenuId: string | null;
  buttonClassName: string;
  menuClassName: string;
  isPublishing: boolean;
  isPublished: boolean;
  canPublish: boolean;
  unavailableReason: string;
  onOpenMenuChange: (menuId: string | null) => void;
  onPublish: () => void;
  onShareExternally: () => void;
};

const ShareMenuAction = ({
  menuId,
  openMenuId,
  buttonClassName,
  menuClassName,
  isPublishing,
  isPublished,
  canPublish,
  unavailableReason,
  onOpenMenuChange,
  onPublish,
  onShareExternally
}: ShareMenuActionProps) => {
  const isOpen = openMenuId === menuId;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenuChange(isOpen ? null : menuId);
        }}
        className={buttonClassName}
      >
        <Share2 className="h-4 w-4 text-rose-300" />
        Partager
      </button>
      {isOpen && (
        <div className={menuClassName}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenuChange(null);
              if (!canPublish || isPublished) return;
              onPublish();
            }}
            disabled={isPublishing || isPublished || !canPublish}
            title={isPublished ? "Deja publie dans la vitrine." : !canPublish ? unavailableReason : "Publier dans la vitrine publique."}
            className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition-colors ${
              isPublished
                ? "cursor-default bg-emerald-50 text-emerald-700"
                : canPublish
                  ? "cursor-pointer text-gray-800 hover:bg-rose-50"
                  : "cursor-default text-gray-300"
            }`}
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPublished ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Globe2 className="h-4 w-4 text-rose-500" />
            )}
            {isPublished ? "Deja dans la vitrine" : canPublish ? "Publier dans la vitrine" : "Publication indisponible"}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenuChange(null);
              onShareExternally();
            }}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-black uppercase tracking-widest text-gray-800 transition-colors hover:bg-gray-50"
          >
            <Send className="h-4 w-4 text-rose-500" />
            Partager ailleurs
          </button>
        </div>
      )}
    </div>
  );
};

export default ShareMenuAction;

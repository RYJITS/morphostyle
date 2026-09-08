import React from 'react';

type AppFooterProps = {
  privacyRoutePath: string;
  privacyPageOpen: boolean;
  onPrivacyClick: () => void;
  navigationDisabled?: boolean;
  disabledReason?: string;
};

const AppFooter: React.FC<AppFooterProps> = ({
  privacyRoutePath,
  privacyPageOpen,
  onPrivacyClick,
  navigationDisabled = false,
  disabledReason = "Action indisponible"
}) => (
  <footer className="border-t border-gray-100 bg-white/70">
    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs font-bold text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <div>MorphoStyle Studio</div>
      <nav aria-label="Liens secondaires" className="flex flex-wrap items-center gap-3">
        <a
          href={privacyRoutePath}
          onClick={(event) => {
            event.preventDefault();
            if (navigationDisabled) return;
            onPrivacyClick();
          }}
          title={navigationDisabled ? disabledReason : "Confidentialite"}
          aria-current={privacyPageOpen ? "page" : undefined}
          aria-disabled={navigationDisabled || undefined}
          tabIndex={navigationDisabled ? -1 : undefined}
          className={`rounded-md px-3 py-2 transition-colors focus:outline-none focus:ring-4 focus:ring-rose-100 ${navigationDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-rose-50 hover:text-rose-600"} ${privacyPageOpen ? "bg-rose-50 text-rose-600" : ""}`}
        >
          Confidentialite
        </a>
      </nav>
    </div>
  </footer>
);

export default AppFooter;

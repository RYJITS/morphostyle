
import React from 'react';
import { Scissors } from 'lucide-react';

type HeaderProps = {
  onHomeClick?: () => void;
  homeDisabled?: boolean;
  homeDisabledReason?: string;
};

const Header: React.FC<HeaderProps> = ({ onHomeClick, homeDisabled = false, homeDisabledReason = "Action indisponible" }) => {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button
            type="button"
            onClick={onHomeClick}
            disabled={homeDisabled}
            title={homeDisabled ? homeDisabledReason : "Accueil"}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-current"
            aria-label="Retour a l'accueil MorphoStyle Studio"
          >
            <div className="bg-black p-1.5 rounded-lg">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <span className="serif text-xl font-bold tracking-tight">MorphoStyle <span className="text-rose-600 font-light italic">Studio</span></span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;

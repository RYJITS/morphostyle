
import React from 'react';
import { Scissors } from 'lucide-react';

interface HeaderProps {
  badgeLabel?: string;
}

const Header: React.FC<HeaderProps> = ({ badgeLabel = 'AI Powered' }) => {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="bg-black p-1.5 rounded-lg">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <span className="serif text-xl font-bold tracking-tight">MorphoStyle <span className="text-rose-600 font-light italic">Studio</span></span>
          </div>
          <div className="text-xs font-semibold bg-gray-100 px-3 py-1 rounded-full uppercase tracking-widest text-gray-500">
            {badgeLabel}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

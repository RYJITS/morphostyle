
import React from 'react';
import { Scissors } from 'lucide-react';

const Header: React.FC = () => {
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
        </div>
      </div>
    </header>
  );
};

export default Header;

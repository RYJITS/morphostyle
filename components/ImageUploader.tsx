
import React, { useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelect: (dataUrl: string) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelect }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        onImageSelect(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const clear = () => {
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {!preview ? (
        <div
          className="border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center hover:border-rose-300 hover:bg-rose-50/30 focus-within:border-rose-500 focus-within:ring-4 focus-within:ring-rose-100 transition-all group"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/png,image/jpeg,image/webp,image/*" 
            aria-label="Choisir une photo"
            className="relative z-10 mx-auto mt-6 block w-full max-w-sm cursor-pointer rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600 shadow-sm file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-rose-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-rose-700" 
          />
          <div className="bg-white w-16 h-16 rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <Camera className="w-8 h-8 text-gray-400 group-hover:text-rose-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Téléchargez votre photo</h3>
          <p className="text-sm text-gray-500">
            Pour une analyse précise, assurez-vous que votre visage est bien éclairé et de face.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-rose-600 font-medium text-sm pointer-events-none">
            <Upload className="w-4 h-4" />
            Parcourir mes fichiers
          </div>
        </div>
      ) : (
        <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-black aspect-[3/4] max-h-[500px] mx-auto">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          <button 
            type="button"
            onClick={clear}
            aria-label="Retirer la photo"
            className="absolute top-4 right-4 bg-white/20 backdrop-blur-md p-2 rounded-full hover:bg-white/40 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;

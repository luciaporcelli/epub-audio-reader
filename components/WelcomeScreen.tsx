import React, { useState } from 'react';
import FileUpload from './FileUpload';

interface WelcomeScreenProps {
  onLoadLibrary: (code: string) => void;
  onFileSelect: (file: File) => void;
  errorMessage?: string;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLoadLibrary, onFileSelect, errorMessage }) => {
  const [code, setCode] = useState('');

  const handleLoadClick = (e: React.FormEvent) => {
    e.preventDefault();
    onLoadLibrary(code);
  };

  return (
    <div className="w-full flex flex-col gap-8">
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Load Existing Library</h3>
        <form onSubmit={handleLoadClick} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter your 6-character library code"
            className="flex-grow bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-gray-500 focus:border-gray-500 block w-full p-2.5 placeholder-gray-400 font-mono"
            maxLength={6}
            style={{ textTransform: 'uppercase' }}
          />
          <button type="submit" className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-2.5 px-6 rounded-lg transition-colors duration-300">
            Load Library
          </button>
        </form>
        {errorMessage && <p className="text-red-500 text-sm mt-3 text-center">{errorMessage}</p>}
      </div>

      <div className="flex items-center gap-4">
        <hr className="w-full border-gray-200" />
        <span className="text-gray-400 font-semibold">OR</span>
        <hr className="w-full border-gray-200" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Create a New Library</h3>
        <FileUpload onFileSelect={onFileSelect} />
      </div>
    </div>
  );
};

export default WelcomeScreen;
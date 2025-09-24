import React from 'react';
import { LibraryBook } from '../types';
import { BookOpenIcon, LogOutIcon } from './Icons';

interface LibraryProps {
  books: LibraryBook[];
  onSelectBook: (bookKey: string) => void;
  onSwitchLibrary: () => void;
  libraryCode: string | null;
}

const Library: React.FC<LibraryProps> = ({ books, onSelectBook, onSwitchLibrary, libraryCode }) => {
  if (books.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-gray-500">Your library is empty.</p>
        <p className="text-gray-400 text-sm">Upload an EPUB file to get started.</p>
      </div>
    );
  }
  
  const handleSwitchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if(window.confirm("Are you sure you want to switch libraries? Make sure you've saved your library code.")) {
        onSwitchLibrary();
    }
  }

  return (
    <div className="mt-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <h3 className="text-xl font-bold text-gray-800">Your Library</h3>
            <div className="flex items-center gap-4">
                {libraryCode && (
                    <div className="text-sm">
                        <span className="text-gray-500">Code: </span>
                        <span className="font-mono bg-gray-200 text-gray-800 px-2 py-1 rounded-md">{libraryCode}</span>
                    </div>
                )}
                <button
                    onClick={handleSwitchClick}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md px-3 py-1 transition-colors"
                    title="Switch Library"
                >
                    <LogOutIcon className="w-4 h-4" />
                    <span>Switch</span>
                </button>
            </div>
        </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {books.map((book) => {
          const totalSentences = book.chapters.map(c => c.content.match(/[^.!?]+[.!?]*|.+/g)?.length || 0).reduce((a,b) => a + b, 0);
          const progressPercentage = totalSentences > 0 ? (book.progress.currentSentenceIndex / totalSentences) * 100 : 0;

          return (
            <div
              key={book.key}
              onClick={() => onSelectBook(book.key)}
              className="group cursor-pointer bg-white rounded-lg shadow-md hover:shadow-lg hover:shadow-gray-200/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[3/4] w-full bg-gray-100 flex items-center justify-center">
                {book.coverImage ? (
                  <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <BookOpenIcon className="w-12 h-12 text-gray-400" />
                )}
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-100 group-hover:opacity-100 transition-opacity"></div>
              </div>
              <div className="p-3 flex-grow flex flex-col justify-between">
                <div>
                    <h4 className="font-bold text-sm text-gray-800 truncate">{book.title}</h4>
                    <p className="text-xs text-gray-500 truncate">{book.author}</p>
                </div>
                <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-gray-800 h-1.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                    </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Library;
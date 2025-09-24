import React, { useState, useCallback, useEffect } from 'react';
import { LibraryBook } from './types';
import { useEpubParser } from './hooks/useEpubParser';
import FileUpload from './components/FileUpload';
import AudioPlayer from './components/AudioPlayer';
import Spinner from './components/Spinner';
import Library from './components/Library';
import WelcomeScreen from './components/WelcomeScreen';

type View = 'welcome' | 'library' | 'player' | 'loading' | 'error';

const ACTIVE_LIBRARY_CODE_KEY = 'epub-audiobook-active-code';
const getLibraryStorageKey = (code: string) => `epub-audiobook-library-${code}`;

const generateBookKey = (title: string, author: string) => {
  return `book-${title}-${author}`.replace(/\s+/g, '-').toLowerCase();
};

const generateLibraryCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const App: React.FC = () => {
  const [view, setView] = useState<View>('loading');
  const [activeBook, setActiveBook] = useState<LibraryBook | null>(null);
  const [library, setLibrary] = useState<Record<string, LibraryBook>>({});
  const [activeLibraryCode, setActiveLibraryCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { parseEpub } = useEpubParser();

  useEffect(() => {
    try {
      const savedCode = localStorage.getItem(ACTIVE_LIBRARY_CODE_KEY);
      if (savedCode) {
        const savedLibraryJson = localStorage.getItem(getLibraryStorageKey(savedCode));
        if (savedLibraryJson) {
            setActiveLibraryCode(savedCode);
            setLibrary(JSON.parse(savedLibraryJson));
            setView('library');
            return;
        }
      }
    } catch (error) {
      console.error("Failed to load library from localStorage", error);
      setLibrary({});
    }
    setView('welcome');
  }, []);

  const updateLibrary = (newLibrary: Record<string, LibraryBook>, code: string) => {
    setLibrary(newLibrary);
    localStorage.setItem(getLibraryStorageKey(code), JSON.stringify(newLibrary));
  };
  
  const handleFileSelect = useCallback(async (file: File) => {
    setView('loading');
    setErrorMessage('');
    try {
      const data = await parseEpub(file);
      const key = generateBookKey(data.title, data.author);
      
      const newBook: LibraryBook = {
        ...data,
        key,
        progress: {
          currentSentenceIndex: 0,
          selectedVoiceURI: null,
          rate: 1,
          elapsedTime: 0,
        }
      };

      let code = activeLibraryCode;
      let newLibrary = { ...library };

      if (!code) {
        // Creating a new library
        code = generateLibraryCode();
        setActiveLibraryCode(code);
        localStorage.setItem(ACTIVE_LIBRARY_CODE_KEY, code);
        newLibrary = {}; // Start with an empty library
      }

      newLibrary[key] = newBook;
      updateLibrary(newLibrary, code);
      
      setActiveBook(newBook);
      setView('player');

    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred during parsing.';
      setErrorMessage(`Failed to process EPUB file. ${message}`);
      setView('error');
    }
  }, [parseEpub, library, activeLibraryCode]);

  const handleSelectBookFromLibrary = (bookKey: string) => {
    const book = library[bookKey];
    if (book) {
      setActiveBook(book);
      setView('player');
    }
  };
  
  const handleProgressUpdate = (bookKey: string, newProgress: any) => {
    if (!activeLibraryCode) return;
      const updatedBook = { ...library[bookKey], progress: newProgress };
      const newLibrary = { ...library, [bookKey]: updatedBook };
      updateLibrary(newLibrary, activeLibraryCode);
  };
  
  const handleReturnToLibrary = () => {
      setActiveBook(null);
      setView('library');
  };

  const handleSwitchLibrary = () => {
    localStorage.removeItem(ACTIVE_LIBRARY_CODE_KEY);
    setLibrary({});
    setActiveBook(null);
    setActiveLibraryCode(null);
    setView('welcome');
  }

  const handleLoadLibrary = (code: string) => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
        setErrorMessage("Please enter a library code.");
        return;
    }

    try {
        const savedLibraryJson = localStorage.getItem(getLibraryStorageKey(trimmedCode));
        if (savedLibraryJson) {
            setActiveLibraryCode(trimmedCode);
            setLibrary(JSON.parse(savedLibraryJson));
            localStorage.setItem(ACTIVE_LIBRARY_CODE_KEY, trimmedCode);
            setView('library');
            setErrorMessage('');
        } else {
            setErrorMessage(`Library with code "${trimmedCode}" not found.`);
        }
    } catch (error) {
        console.error("Failed to load library", error);
        setErrorMessage("An error occurred while loading the library.");
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'loading':
        return (
          <div className="text-center">
            <Spinner />
            <p className="mt-4 text-lg text-gray-600">Processing your book...</p>
          </div>
        );
      case 'player':
        return activeBook && <AudioPlayer book={activeBook} onReturnToLibrary={handleReturnToLibrary} onProgressUpdate={handleProgressUpdate} />;
      case 'error':
        return (
          <div className="text-center bg-red-50 border border-red-200 p-8 rounded-lg">
            <h3 className="text-2xl font-bold text-red-700 mb-4">Error</h3>
            <p className="text-red-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => {
                setErrorMessage('');
                if (activeLibraryCode) {
                  setView('library');
                } else {
                  setView('welcome');
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-300"
            >
              Back
            </button>
          </div>
        );
      case 'welcome':
        return <WelcomeScreen onFileSelect={handleFileSelect} onLoadLibrary={handleLoadLibrary} errorMessage={errorMessage} />;
      case 'library':
      default:
        return (
            <>
                <FileUpload onFileSelect={handleFileSelect} />
                <Library 
                    books={Object.values(library)} 
                    onSelectBook={handleSelectBookFromLibrary} 
                    onSwitchLibrary={handleSwitchLibrary}
                    libraryCode={activeLibraryCode}
                />
            </>
        )
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gray-100">
      <header className="w-full max-w-4xl mx-auto text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-800">
          EPUB Audiobook Creator
        </h1>
        <p className="mt-2 text-lg text-gray-500">
          Your personal audiobook library, ready when you are.
        </p>
      </header>
      <main className="w-full max-w-2xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg shadow-gray-200/50 p-6 sm:p-10 transition-all duration-500">
          {renderContent()}
        </div>
      </main>
      <footer className="w-full max-w-4xl mx-auto text-center mt-8">
        <p className="text-sm text-gray-500">Powered by browser-native Text-to-Speech technology. <span className="text-gray-600 font-medium">Your progress is saved automatically.</span></p>
      </footer>
    </div>
  );
};

export default App;
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LibraryBook, PlaybackState, SavedPlaybackState } from '../types';
import { PlayIcon, PauseIcon, StopIcon, BackIcon, RewindIcon, FastForwardIcon } from './Icons';

interface AudioPlayerProps {
  book: LibraryBook;
  onReturnToLibrary: () => void;
  onProgressUpdate: (bookKey: string, newProgress: SavedPlaybackState) => void;
}

const formatTime = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours).padStart(2,'0')}:${mm}:${ss}` : `${mm}:${ss}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ book, onReturnToLibrary, onProgressUpdate }) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(book.progress.currentSentenceIndex);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(book.progress.selectedVoiceURI);
  const [rate, setRate] = useState(book.progress.rate);
  const [estimatedTotalTime, setEstimatedTotalTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(book.progress.elapsedTime);
  const [currentWordInfo, setCurrentWordInfo] = useState({ sentenceIndex: -1, wordIndex: -1 });

  const [pendingUserPlay, setPendingUserPlay] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [voicesStatus, setVoicesStatus] = useState<'loading' | 'loaded'>('loading');


  const sentences = useMemo(() => {
    const fullText = book.chapters.map(c => c.content).join(' ');
    return fullText.match(/[^.!?]+[.!?]*|.+/g)?.filter(s => s.trim().length > 0) || [];
  }, [book]);

  const sentenceWords = useMemo(() => sentences.map(s => s.trim().split(/\s+/)), [sentences]);

  const sentenceDurationsRef = useRef<number[]>([]);
  const elapsedTimeIntervalRef = useRef<number | null>(null);
  const saveProgressTimeoutRef = useRef<number | null>(null);
  const playbackStateRef = useRef(playbackState);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const preScrubStateRef = useRef<PlaybackState | null>(null);

  playbackStateRef.current = playbackState;

  const stopElapsedTimeInterval = useCallback(() => {
    if (elapsedTimeIntervalRef.current) {
      clearInterval(elapsedTimeIntervalRef.current);
      elapsedTimeIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const saveProgress = () => {
      onProgressUpdate(book.key, {
        currentSentenceIndex,
        selectedVoiceURI,
        rate,
        elapsedTime,
      });
    };
    if (saveProgressTimeoutRef.current) clearTimeout(saveProgressTimeoutRef.current);
    saveProgressTimeoutRef.current = window.setTimeout(saveProgress, 1000);
    return () => {
      if (saveProgressTimeoutRef.current) clearTimeout(saveProgressTimeoutRef.current);
    };
  }, [currentSentenceIndex, selectedVoiceURI, rate, elapsedTime, book.key, onProgressUpdate]);

  useEffect(() => {
    let mounted = true;

    const pickDefault = (list: SpeechSynthesisVoice[]) => {
      const currentVoiceIsValid = list.some(v => v.voiceURI === selectedVoiceURI);
      if (currentVoiceIsValid) return;

      if (list.length > 0) {
        const esAR = list.find(v => v.lang?.toLowerCase().startsWith('es-ar'));
        const esLocal = list.find(v => v.lang?.toLowerCase().startsWith('es') && v.localService);
        const esAny = list.find(v => v.lang?.toLowerCase().startsWith('es'));
        const def = esAR || esLocal || esAny || list[0];
        setSelectedVoiceURI(def.voiceURI);
      } else {
        setSelectedVoiceURI(null);
      }
    };

    const loadOnce = () => {
      const list = speechSynthesis.getVoices();
      if (!mounted) return false;
      
      setVoicesStatus('loaded');
      if (list.length === 0) return false;

      const spanishVoices = list.filter(v => v.lang?.toLowerCase().startsWith('es'));
      setVoices(spanishVoices);
      pickDefault(spanishVoices);
      return true;
    };

    const timers: number[] = [];
    if (!loadOnce()) {
      for (let i = 0; i < 5; i++) timers.push(window.setTimeout(loadOnce, 120 * (i + 1)));
    }

    const onVoices = () => {
      if (loadOnce() && pendingUserPlay) {
        setPendingUserPlay(false);
        handlePlay();
      }
    };

    (speechSynthesis as any).onvoiceschanged = onVoices;
    (speechSynthesis as any).addEventListener?.('voiceschanged', onVoices);

    return () => {
      mounted = false;
      timers.forEach(t => clearTimeout(t));
      (speechSynthesis as any).removeEventListener?.('voiceschanged', onVoices);
      (speechSynthesis as any).onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.key, book.progress.selectedVoiceURI, pendingUserPlay]);

  useEffect(() => {
    if (!sentences.length) return;
    const WPM = 180;
    const durations = sentences.map(s => {
      const wc = s.trim().split(/\s+/).length;
      return (wc / (WPM * rate)) * 60;
    });
    sentenceDurationsRef.current = durations;
    setEstimatedTotalTime(durations.reduce((a, b) => a + b, 0));
  }, [sentences, rate]);

  const resetHighlighting = () => setCurrentWordInfo({ sentenceIndex: -1, wordIndex: -1 });

  const startElapsedTimeInterval = useCallback((sentenceStartTime: number) => {
    stopElapsedTimeInterval();
    let sentenceProgress = 0;
    elapsedTimeIntervalRef.current = window.setInterval(() => {
      sentenceProgress++;
      setElapsedTime(sentenceStartTime + sentenceProgress);
    }, 1000);
  }, [stopElapsedTimeInterval]);

  const speak = useCallback((index: number) => {
    if (index >= sentences.length) {
      setPlaybackState('stopped');
      return;
    }

    speechSynthesis.cancel();
    stopElapsedTimeInterval();
    resetHighlighting();

    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || 'es';
    } else {
      utterance.lang = 'es';
    }
    utterance.rate = rate;

    utterance.onstart = () => {
      const sentenceStartTime = sentenceDurationsRef.current.slice(0, index).reduce((a, b) => a + b, 0);
      setElapsedTime(sentenceStartTime);
      startElapsedTimeInterval(sentenceStartTime);
      setPlaybackState('playing');
    };

    utterance.onboundary = (event: any) => {
      if (typeof event.charIndex === 'number' && event.charIndex >= 0) {
        const textUpTo = sentences[index].substring(0, event.charIndex);
        const cleaned = textUpTo.trim();
        const wordIndex = cleaned ? Math.max(0, cleaned.split(/\s+/).length - 1) : 0;
        setCurrentWordInfo({ sentenceIndex: index, wordIndex });
      }
    };

    utterance.onend = () => {
      resetHighlighting();
      if (playbackStateRef.current === 'playing') {
        setCurrentSentenceIndex(prev => prev + 1);
      }
    };

    utterance.onerror = (event: any) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      console.error("Speech synthesis error:", event.error);
      setPlaybackState('stopped');
    };

    speechSynthesis.speak(utterance);
  }, [sentences, voices, selectedVoiceURI, rate, startElapsedTimeInterval, stopElapsedTimeInterval]);

  useEffect(() => {
    if (playbackState === 'playing' && currentSentenceIndex > book.progress.currentSentenceIndex) {
      speak(currentSentenceIndex);
    }
  }, [currentSentenceIndex, playbackState, book.progress.currentSentenceIndex, speak]);

  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      stopElapsedTimeInterval();
    };
  }, [stopElapsedTimeInterval]);

  useEffect(() => {
    const keepAliveInterval = setInterval(() => {
      if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.resume();
      }
    }, 12000);
    return () => clearInterval(keepAliveInterval);
  }, []);

  useEffect(() => {
    const handleScrubMove = (e: MouseEvent | TouchEvent) => {
        if (!isScrubbing || !progressBarRef.current || estimatedTotalTime === 0) return;
        e.preventDefault();

        const rect = progressBarRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const targetTime = estimatedTotalTime * percentage;
        
        setElapsedTime(targetTime);
    };

    const handleScrubEnd = (e: MouseEvent | TouchEvent) => {
        if (!isScrubbing) return;
        
        const wasPlaying = preScrubStateRef.current === 'playing';
        setIsScrubbing(false);
        preScrubStateRef.current = null;

        if (!progressBarRef.current || estimatedTotalTime === 0) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const targetTime = estimatedTotalTime * percentage;

        let accumulated = 0;
        let newIndex = 0;
        for (let i = 0; i < sentenceDurationsRef.current.length; i++) {
            accumulated += sentenceDurationsRef.current[i];
            if (accumulated >= targetTime) {
                newIndex = i;
                break;
            }
        }
        
        speechSynthesis.cancel();
        stopElapsedTimeInterval();
        resetHighlighting();
        
        setCurrentSentenceIndex(newIndex);
        setElapsedTime(targetTime);
        
        if (wasPlaying) {
            speak(newIndex);
        } else {
            setPlaybackState('paused');
        }
    };

    if (isScrubbing) {
        window.addEventListener('mousemove', handleScrubMove);
        window.addEventListener('mouseup', handleScrubEnd);
        window.addEventListener('touchmove', handleScrubMove, { passive: false });
        window.addEventListener('touchend', handleScrubEnd);
    }

    return () => {
        window.removeEventListener('mousemove', handleScrubMove);
        window.removeEventListener('mouseup', handleScrubEnd);
        window.removeEventListener('touchmove', handleScrubMove);
        window.removeEventListener('touchend', handleScrubEnd);
    }
  }, [isScrubbing, estimatedTotalTime, speak, stopElapsedTimeInterval]);

  const handleScrubStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (e.type === 'mousedown') e.preventDefault();
    
    preScrubStateRef.current = playbackState;

    if (playbackState === 'playing') {
        speechSynthesis.pause();
        stopElapsedTimeInterval();
    }
    setIsScrubbing(true);

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetTime = estimatedTotalTime * percentage;
    setElapsedTime(targetTime);
  };

  const handlePlay = () => {
    if (voices.length === 0) {
      console.warn("Play presionado antes de que carguen voces; se iniciará automáticamente.");
      setPendingUserPlay(true);
      return;
    }
    
    if (playbackState === 'paused' && speechSynthesis.paused) {
      speechSynthesis.resume();
      const sentenceStartTime = sentenceDurationsRef.current.slice(0, currentSentenceIndex).reduce((a, b) => a + b, 0);
      startElapsedTimeInterval(sentenceStartTime);
    } else { 
      speak(currentSentenceIndex);
    }
    setPlaybackState('playing');
  };

  const handlePause = () => {
    speechSynthesis.pause();
    stopElapsedTimeInterval();
    setPlaybackState('paused');
  };

  const handleStop = () => {
    speechSynthesis.cancel();
    stopElapsedTimeInterval();
    setPlaybackState('stopped');
    setCurrentSentenceIndex(0);
    setElapsedTime(0);
    resetHighlighting();
    setPendingUserPlay(false);
  };

  const handleSeek = (direction: 'forward' | 'backward') => {
    const jumpAmount = 10;
    const newIndex = direction === 'forward'
      ? Math.min(sentences.length - 1, currentSentenceIndex + jumpAmount)
      : Math.max(0, currentSentenceIndex - jumpAmount);

    if (newIndex !== currentSentenceIndex) {
      setCurrentSentenceIndex(newIndex);
      const newElapsedTime = sentenceDurationsRef.current.slice(0, newIndex).reduce((a, b) => a + b, 0);
      setElapsedTime(newElapsedTime);
      if (playbackState === 'playing') speak(newIndex);
    }
  };

  const groupedVoices = useMemo(() => {
    return voices.reduce((acc, voice) => {
      const lang = voice.lang;
      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(voice);
      return acc;
    }, {} as Record<string, SpeechSynthesisVoice[]>);
  }, [voices]);

  const progress = estimatedTotalTime > 0 ? (elapsedTime / estimatedTotalTime) * 100 : 0;

  return (
    <div className="flex flex-col items-center text-center w-full relative">
       <button 
        onClick={onReturnToLibrary} 
        className="absolute top-0 left-0 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors p-2 rounded-lg" 
        aria-label="Volver a la librería"
      >
        <BackIcon className="w-5 h-5" />
        <span>Volver a la librería</span>
      </button>

      <h2 className="text-2xl font-bold text-gray-900 truncate max-w-full mt-8 sm:mt-0">{book.title}</h2>
      <p className="text-md text-gray-600 mb-6">by {book.author}</p>
      
      <div className="w-full relative mb-4 py-1">
        <div
          ref={progressBarRef}
          onMouseDown={handleScrubStart}
          onTouchStart={handleScrubStart}
          className="group bg-gray-200 rounded-full h-3 w-full cursor-pointer"
        >
          <div className="bg-gray-800 h-3 rounded-full relative" style={{ width: `${progress}%` }}>
             <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-5 bg-white rounded-full shadow border-2 border-gray-800 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
      
      <div className="w-full flex justify-between text-xs text-gray-500 mb-4 px-1">
        <span>{formatTime(elapsedTime)}</span>
        <span>{formatTime(estimatedTotalTime)}</span>
      </div>

      <div className="text-lg text-gray-700 mb-6 h-24 overflow-y-auto px-2 leading-relaxed text-left">
        {playbackState !== 'stopped' && sentences[currentSentenceIndex] ? (
          sentenceWords[currentSentenceIndex]?.map((word, index) => (
            <span
              key={index}
              className={`p-0.5 rounded-md transition-colors duration-200 ${
                currentWordInfo.sentenceIndex === currentSentenceIndex && currentWordInfo.wordIndex === index
                  ? 'bg-gray-800 text-white'
                  : 'bg-transparent'
              }`}
            >
              {word}{' '}
            </span>
          ))
        ) : (
          <p className="text-sm text-gray-400 text-center pt-6">Tocá ▶️ para empezar a escuchar.</p>
        )}
      </div>

      <div className="w-full max-w-sm mx-auto my-6 space-y-4">
        <div>
          <label htmlFor="voice-select" className="block text-sm font-medium text-gray-500 mb-2 text-left">Voz</label>
          <select
            id="voice-select"
            value={selectedVoiceURI || ''}
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
            disabled={voices.length === 0 || playbackState === 'playing'}
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-gray-500 focus:border-gray-500 block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {voicesStatus === 'loading' ? (
                <option value="">Cargando voces…</option>
            ) : Object.entries(groupedVoices).length > 0 ? (
              Object.entries(groupedVoices).map(([lang, group]) => (
                <optgroup label={lang} key={lang}>
                  {group.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({lang})</option>
                  ))}
                </optgroup>
              ))
            ) : (
                <option value="">No se encontraron voces en español</option>
            )}
          </select>
        </div>
        <div>
          <label htmlFor="rate-slider" className="block text-sm font-medium text-gray-500 mb-2 text-left">Velocidad: {rate.toFixed(1)}x</label>
          <input
            id="rate-slider" type="range" min="0.5" max="2" step="0.1" value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            disabled={playbackState === 'playing'}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <button onClick={() => handleSeek('backward')} className="p-3 bg-gray-100 border border-gray-200/80 rounded-full hover:bg-gray-200 transition-colors" aria-label="Rewind">
          <RewindIcon className="w-6 h-6 text-gray-600" />
        </button>
        <button onClick={handleStop} className="p-3 bg-gray-100 border border-gray-200/80 rounded-full hover:bg-gray-200 transition-colors" aria-label="Stop">
          <StopIcon className="w-6 h-6 text-gray-600" />
        </button>

        {playbackState === 'playing' ? (
          <button onClick={handlePause} className="p-5 bg-gray-800 rounded-full hover:bg-gray-900 transition-colors shadow-lg shadow-gray-800/20" aria-label="Pause">
            <PauseIcon className="w-8 h-8 text-white" />
          </button>
        ) : (
          <button onClick={handlePlay} className="p-5 bg-gray-800 rounded-full hover:bg-gray-900 transition-colors shadow-lg shadow-gray-800/20" aria-label="Play">
            <PlayIcon className="w-8 h-8 text-white" />
          </button>
        )}

        <button onClick={() => handleSeek('forward')} className="p-3 bg-gray-100 border border-gray-200/80 rounded-full hover:bg-gray-200 transition-colors" aria-label="Fast Forward">
          <FastForwardIcon className="w-6 h-6 text-gray-600" />
        </button>
      </div>
    </div>
  );
};

export default AudioPlayer;
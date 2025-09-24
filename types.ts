export interface Chapter {
  id: string;
  title: string | null;
  content: string;
}

export interface BookData {
  title: string;
  author: string;
  chapters: Chapter[];
  coverImage: string | null; // e.g., a base64 data URL
}

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface SavedPlaybackState {
  currentSentenceIndex: number;
  selectedVoiceURI: string | null;
  rate: number;
  elapsedTime: number;
}

export interface LibraryBook extends BookData {
    key: string;
    progress: SavedPlaybackState;
}

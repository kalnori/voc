
export interface FlashcardImage {
  id: string;
  url: string;
  file?: File; // Optional, present if uploaded by user
  isDemo?: boolean;
}

export interface AnalysisResult {
  vocab: string;     // Text from the 1st paragraph (vocabulary)
  sentence: string;  // Text from the 3rd paragraph (example sentence)
  japanese: string;  // Combined text for display
  reading: string;   // Full reading (Hiragana/Romaji)
}

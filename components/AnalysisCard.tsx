import React from 'react';
import { AnalysisResult } from '../types';
import { Volume2 } from 'lucide-react';

interface AnalysisCardProps {
  result: AnalysisResult | null;
  onSpeak: () => void;
  isSpeaking: boolean;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ result, onSpeak, isSpeaking }) => {
  if (!result) return null;

  return (
    <div className="mt-6 bg-white rounded-2xl p-6 shadow-lg border border-indigo-50 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
            <h3 className="text-sm font-semibold text-indigo-500 uppercase tracking-wider mb-1">原文 (Japanese)</h3>
            <p className="text-2xl font-bold text-gray-900 leading-relaxed font-jp">{result.japanese}</p>
            <p className="text-lg text-gray-500 font-jp mt-1">{result.reading}</p>
        </div>
        <button 
            onClick={onSpeak}
            disabled={isSpeaking}
            className={`p-4 rounded-full transition-all transform hover:scale-105 ${isSpeaking ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'}`}
            title="Play Audio"
        >
            <Volume2 className={`w-8 h-8 ${isSpeaking ? 'animate-pulse' : ''}`} />
        </button>
      </div>
    </div>
  );
};

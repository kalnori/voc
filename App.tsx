
import React, { useState, useEffect, useRef } from 'react';
import { FlashcardImage, AnalysisResult } from './types';
import { Button } from './components/Button';
import { AnalysisCard } from './components/AnalysisCard';
import { analyzeJapaneseImage, generatePronunciation, generateSequentialPronunciation } from './services/geminiService';
import { Shuffle, BrainCircuit, Image as ImageIcon, AlertCircle, Volume2 } from 'lucide-react';

// ------------------------------------------------------------------------------------------
// 預設資料庫 (Database)
// 請將下方的 URL 替換為您真實的圖片連結 (例如上傳至 Imgur 或其他圖床後的網址)。
// ------------------------------------------------------------------------------------------
const VOCABULARY_DATABASE = [
  // 模擬您提供的圖片：深藍色背景，日文例句
  "https://www.dropbox.com/scl/fi/7kairxgfvljju5wjqdz2i/3.png?rlkey=jzrtx1bodorfmnou80cyjlgv7&st=vqlh7tve&raw=1", 
  "https://www.dropbox.com/scl/fi/gb7gyoz64m1oskdai05ky/4.png?rlkey=otoiplni2ya5tsw68rat8iv1o&st=53akujrt&raw=1",
  "https://www.dropbox.com/scl/fi/j5cumv857wq86p8juxjgk/5.png?rlkey=16wimfy23v3x96o2ga57nthco&st=o91xbso1&raw=1",
  "https://www.dropbox.com/scl/fi/dpusg98eu4r1i46uncyor/6.png?rlkey=8f0uu7ok89czestjhjn002xl8&st=7ed2tqkc&raw=1",
  
];

export default function App() {
  const [images, setImages] = useState<FlashcardImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Audio context ref
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize Data
  useEffect(() => {
    // Convert string URLs to FlashcardImage objects
    const loadedImages: FlashcardImage[] = VOCABULARY_DATABASE.map((url, index) => ({
      id: `img-${index}`,
      url: url,
    }));
    setImages(loadedImages);
    
    // Pick first random image immediately
    if (loadedImages.length > 0) {
      const nextIndex = Math.floor(Math.random() * loadedImages.length);
      setCurrentIndex(nextIndex);
    }
  }, []);

  const pickRandomImage = () => {
    if (images.length === 0) return;
    
    // Try to pick a different image than current if possible
    let nextIndex;
    if (images.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * images.length);
      } while (nextIndex === currentIndex);
    } else {
      nextIndex = 0;
    }

    setCurrentIndex(nextIndex);
    setAnalysis(null); // Reset analysis for new card
    setError(null);
  };

  const playAudio = async (content: string | { vocab: string, sentence: string }) => {
    if (isSpeaking) return;

    setIsSpeaking(true);
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      }

      let audioBuffer: AudioBuffer;

      if (typeof content === 'string') {
        // Fallback for simple string
        audioBuffer = await generatePronunciation(content);
      } else {
        // Use sequential generation with 3s pause
        audioBuffer = await generateSequentialPronunciation(content.vocab, content.sentence);
      }
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();
    } catch (err) {
      console.error(err);
      setError("語音生成失敗");
      setIsSpeaking(false);
    }
  };

  const handleIdentifyAndRead = async () => {
    if (currentIndex === -1) return;
    
    // If we already have the analysis, read it using the stored parts
    if (analysis) {
        playAudio({ vocab: analysis.vocab, sentence: analysis.sentence });
        return;
    }
    
    setIsAnalyzing(true);
    setError(null);
    try {
      const currentImg = images[currentIndex];
      const result = await analyzeJapaneseImage(currentImg.url);
      setAnalysis(result);
      
      // Auto play after analysis with the sequential logic
      await playAudio({ vocab: result.vocab, sentence: result.sentence });
      
    } catch (err: any) {
      console.error(err);
      // Simplify error message for user
      const msg = err.message || "";
      if (msg.includes("無法讀取")) {
         setError(msg);
      } else {
         setError("辨識失敗，請確認圖片連結可公開存取 (CORS)，或檢查網路連線。");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // If no database, show error
  if (images.length === 0 && currentIndex === -1) {
    // Simple loading state while useEffect runs or if empty
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
         <p className="text-gray-500">正在載入單字卡...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4 md:px-8">
      <header className="max-w-4xl mx-auto flex justify-between items-center mb-6">
         <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <span className="bg-indigo-600 text-white p-2 rounded-lg mr-3 shadow-sm">
                <ImageIcon size={20} />
            </span>
            日文例句練習
         </h1>
         <div className="text-sm text-gray-500 font-medium bg-white px-3 py-1 rounded-full shadow-sm">
            目前題庫: {images.length} 張
         </div>
      </header>

      <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Image Display */}
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden flex flex-col h-[500px] md:h-[600px] relative border border-gray-100">
           {images[currentIndex] && (
             <div className="flex-1 bg-gray-50 flex items-center justify-center overflow-hidden relative group p-4">
                <img 
                  src={images[currentIndex].url} 
                  alt="Vocabulary" 
                  className="max-w-full max-h-full object-contain shadow-md rounded-lg"
                />
                <div className="absolute top-4 right-4 bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm font-mono">
                   #{currentIndex + 1}
                </div>
             </div>
           )}
           
           <div className="p-4 bg-white border-t border-gray-100 flex gap-3 z-10">
              <Button 
                onClick={pickRandomImage} 
                className="flex-1 py-4 text-lg"
                icon={<Shuffle size={24} />}
              >
                隨機切換下一張
              </Button>
           </div>
        </div>

        {/* Right Column: Controls & AI Analysis */}
        <div className="flex flex-col">
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <Volume2 className="text-indigo-500 mr-2" />
              AI 語音助手
            </h2>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              點擊下方按鈕，AI 將自動辨識圖片中的<strong>第 1 段（單字）</strong>與<strong>第 3 段（例句）</strong>，並在兩段發音之間<strong>停頓 3 秒</strong>，方便您跟讀練習。
            </p>
            
            <Button 
              variant="primary" 
              onClick={handleIdentifyAndRead}
              isLoading={isAnalyzing}
              disabled={isSpeaking}
              className="w-full py-4 text-lg shadow-indigo-200 shadow-lg"
              icon={<BrainCircuit size={20} />}
            >
              {analysis ? '再次朗讀例句' : '辨識並朗讀例句'}
            </Button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start animate-fade-in-up">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {analysis ? (
            <AnalysisCard 
              result={analysis} 
              onSpeak={() => playAudio({ vocab: analysis.vocab, sentence: analysis.sentence })}
              isSpeaking={isSpeaking}
            />
          ) : (
             !isAnalyzing && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-200 rounded-2xl p-8 bg-gray-50/50">
                   <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
                        <Volume2 size={32} className="text-indigo-200" />
                   </div>
                   <p className="font-medium text-gray-400">請點擊辨識按鈕以聽取發音</p>
                </div>
             )
          )}
        </div>
      </main>
    </div>
  );
}

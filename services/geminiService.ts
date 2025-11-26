
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to convert Blob to Base64 string (strips data URL prefix).
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Content = base64String.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Converts a URL to a Base64 string.
 * Tries direct fetch first, then falls back to a CORS proxy if blocked.
 */
const fileToGenerativePart = async (url: string): Promise<string> => {
  try {
    // 1. Try direct fetch
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Direct fetch failed: ${response.statusText}`);
    const blob = await response.blob();
    return await blobToBase64(blob);
  } catch (error) {
    console.warn("Direct fetch failed (likely CORS), attempting via CORS proxy...", error);
    
    // 2. Try via CORS Proxy
    // Note: Using a public proxy (corsproxy.io) for demo purposes. 
    // In a production app, you should proxy images through your own backend.
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const proxyResponse = await fetch(proxyUrl);
        if (!proxyResponse.ok) throw new Error(`Proxy fetch failed: ${proxyResponse.statusText}`);
        const proxyBlob = await proxyResponse.blob();
        return await blobToBase64(proxyBlob);
    } catch (proxyError) {
        console.error("Proxy fetch failed:", proxyError);
        throw new Error("無法讀取圖片檔案。原因可能是：1. 連結無效 2. 檔案權限未公開 3. 跨網域存取 (CORS) 被拒絕。");
    }
  }
};

/**
 * Analyzes the image to extract Japanese text, specifically splitting vocab and sentence.
 */
export const analyzeJapaneseImage = async (imageUrl: string): Promise<AnalysisResult> => {
  try {
    const base64Data = await fileToGenerativePart(imageUrl);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data,
            },
          },
          {
            text: `
              Analyze the layout of the text in the image from top to bottom.
              
              Task:
              1. Extract the text from the **1st visual paragraph/block** (this is the 'vocab'). **IMPORTANT: Exclude any leading index numbers (like ①, 1., 1) or bullets.**
              2. Extract the text from the **3rd visual paragraph/block** (this is the 'sentence').
              3. Ignore the 2nd paragraph (translation) or any other text.
              
              Return a JSON object with:
              - 'vocab': The text of the 1st paragraph (clean, without numbers).
              - 'sentence': The text of the 3rd paragraph.
              - 'reading': The full hiragana reading (furigana) for both parts. **Do not include reading for index numbers.**
            `
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vocab: { type: Type.STRING },
            sentence: { type: Type.STRING },
            reading: { type: Type.STRING },
          },
          required: ["vocab", "sentence", "reading"],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text);
      
      // Safety cleanup: Regex to remove leading Circled numbers (①-⑳), digits, dots, and whitespace
      // \u2460-\u2473 matches ① through ⑳
      const cleanVocab = parsed.vocab.replace(/^[\s\d\.\u2460-\u2473]+/, '');

      return {
        vocab: cleanVocab,
        sentence: parsed.sentence,
        reading: parsed.reading,
        japanese: `${cleanVocab}\n${parsed.sentence}` // Combine for display
      };
    }
    throw new Error("No response text generated");

  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};

/**
 * Helper to decode raw PCM audio data manually
 */
const decodePCM = (base64Data: string, ctx: AudioContext): AudioBuffer => {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Gemini TTS returns raw PCM 16-bit, 24kHz, mono (little-endian)
  const int16View = new Int16Array(bytes.buffer);
  const float32Data = new Float32Array(int16View.length);
  
  for (let i = 0; i < int16View.length; i++) {
    float32Data[i] = int16View[i] / 32768.0; // Convert Int16 to Float32 [-1.0, 1.0]
  }

  const buffer = ctx.createBuffer(1, float32Data.length, 24000);
  buffer.copyToChannel(float32Data, 0);
  return buffer;
};

/**
 * Internal helper to fetch TTS raw audio base64 from Gemini
 */
const fetchTTSBase64 = async (text: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new Error("No audio data returned from API");
  return base64;
};

/**
 * Generates audio for a single string.
 */
export const generatePronunciation = async (text: string): Promise<AudioBuffer> => {
  try {
    const base64Audio = await fetchTTSBase64(text);

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass({ sampleRate: 24000 });
    
    return decodePCM(base64Audio, audioContext);
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
};

/**
 * Generates audio for vocab and sentence with a 3-second pause in between.
 */
export const generateSequentialPronunciation = async (vocab: string, sentence: string): Promise<AudioBuffer> => {
  try {
    // 1. Fetch both audio clips in parallel to save time
    const [base64Vocab, base64Sentence] = await Promise.all([
      fetchTTSBase64(vocab),
      fetchTTSBase64(sentence)
    ]);

    // 2. Setup Audio Context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass({ sampleRate: 24000 });
    
    // 3. Decode into buffers
    const buf1 = decodePCM(base64Vocab, ctx);
    const buf2 = decodePCM(base64Sentence, ctx);

    // 4. Calculate total length: buf1 + 3 seconds silence + buf2
    const pauseDuration = 3; // seconds
    const pauseSamples = pauseDuration * 24000;
    const totalLength = buf1.length + pauseSamples + buf2.length;

    // 5. Create combined buffer
    const combinedBuffer = ctx.createBuffer(1, totalLength, 24000);
    const channelData = combinedBuffer.getChannelData(0);

    // 6. Merge data
    channelData.set(buf1.getChannelData(0), 0);
    // The space in between is already initialized to 0 (silence)
    channelData.set(buf2.getChannelData(0), buf1.length + pauseSamples);

    return combinedBuffer;

  } catch (error) {
    console.error("Error generating sequential speech:", error);
    throw error;
  }
};

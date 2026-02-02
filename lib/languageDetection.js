/**
 * Simple language detection based on character patterns and common words
 * Returns detected language with confidence score
 */

// Common words and patterns for each supported language
const languagePatterns = {
  English: {
    words: ['the', 'and', 'is', 'are', 'was', 'were', 'have', 'has', 'been', 'will', 'would', 'could', 'should', 'that', 'this', 'with', 'from', 'they', 'which', 'their', 'please', 'thank', 'dear', 'sincerely', 'regards'],
    patterns: [/\b(ing|tion|ness|ment|able|ible)\b/gi]
  },
  Polish: {
    words: ['jest', 'są', 'był', 'była', 'będzie', 'oraz', 'który', 'która', 'które', 'dla', 'przez', 'przy', 'jako', 'także', 'również', 'bardzo', 'może', 'tylko', 'więc', 'jednak', 'proszę', 'dziękuję', 'szanowni', 'pozdrawiam'],
    patterns: [/[ąćęłńóśźż]/gi, /\b(ść|cz|sz|rz|dz)\w*/gi]
  },
  German: {
    words: ['der', 'die', 'das', 'und', 'ist', 'sind', 'war', 'waren', 'haben', 'hat', 'werden', 'wird', 'für', 'mit', 'von', 'auf', 'auch', 'nicht', 'noch', 'oder', 'aber', 'wenn', 'bitte', 'danke', 'sehr', 'geehrte'],
    patterns: [/[äöüß]/gi, /\b(ung|heit|keit|schaft|lich|isch)\b/gi]
  },
  French: {
    words: ['le', 'la', 'les', 'un', 'une', 'des', 'est', 'sont', 'était', 'étaient', 'avoir', 'être', 'pour', 'avec', 'dans', 'par', 'sur', 'qui', 'que', 'mais', 'aussi', 'très', 'merci', 'bonjour', 'cordialement'],
    patterns: [/[àâçéèêëîïôùûü]/gi, /\b(ment|tion|eur|euse|eux)\b/gi]
  },
  Spanish: {
    words: ['el', 'la', 'los', 'las', 'un', 'una', 'es', 'son', 'era', 'eran', 'estar', 'ser', 'para', 'con', 'por', 'que', 'del', 'pero', 'más', 'muy', 'también', 'gracias', 'hola', 'atentamente', 'estimado'],
    patterns: [/[áéíóúñü¿¡]/gi, /\b(ción|mente|dad|oso|osa)\b/gi]
  }
};

/**
 * Detect the language of a text
 * @param {string} text - Text to analyze
 * @returns {{language: string, confidence: number, isReliable: boolean}}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string' || text.length < 50) {
    return { language: 'unknown', confidence: 0, isReliable: false };
  }

  // Normalize and get a sample (first 5000 chars for performance)
  const sample = text.toLowerCase().slice(0, 5000);
  const words = sample.split(/\s+/).filter(w => w.length > 1);

  const scores = {};

  for (const [lang, config] of Object.entries(languagePatterns)) {
    let score = 0;

    // Check common words
    for (const word of config.words) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = sample.match(regex);
      if (matches) {
        score += matches.length * 2; // Weight common words more
      }
    }

    // Check patterns
    for (const pattern of config.patterns) {
      const matches = sample.match(pattern);
      if (matches) {
        score += matches.length;
      }
    }

    scores[lang] = score;
  }

  // Find the highest scoring language
  let maxScore = 0;
  let detectedLanguage = 'English'; // Default fallback

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = lang;
    }
  }

  // Calculate confidence (0-1)
  // Based on score relative to text length and second-best score
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const secondBest = sortedScores[1] || 0;

  // Confidence is higher if:
  // 1. Absolute score is high relative to sample length
  // 2. Gap between best and second-best is large
  const absoluteConfidence = Math.min(maxScore / (words.length * 0.3), 1);
  const relativeConfidence = secondBest > 0 ? (maxScore - secondBest) / maxScore : 1;
  const confidence = (absoluteConfidence * 0.6 + relativeConfidence * 0.4);

  // Only consider reliable if confidence > 0.6 and we have enough text
  const isReliable = confidence > 0.6 && words.length > 30;

  return {
    language: detectedLanguage,
    confidence: Math.round(confidence * 100) / 100,
    isReliable
  };
}

/**
 * Check if text appears to be in the target language
 * @param {string} text - Text to check
 * @param {string} targetLanguage - Expected language
 * @returns {{isSameLanguage: boolean, detectedLanguage: string, confidence: number, shouldSkipTranslation: boolean}}
 */
export function shouldSkipTranslation(text, targetLanguage) {
  const detection = detectLanguage(text);

  // Only skip if:
  // 1. Detection is reliable (confidence > 0.6)
  // 2. Detected language matches target
  // 3. Confidence is high enough (> 0.7 for safety)
  const isSameLanguage = detection.language === targetLanguage;
  const shouldSkip = isSameLanguage && detection.isReliable && detection.confidence > 0.7;

  return {
    isSameLanguage,
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    shouldSkipTranslation: shouldSkip
  };
}

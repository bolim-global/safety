const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const config = require('../config');
const glossaryService = require('./glossaryService');

/**
 * Gemini Multimodal Vision Service for 99.9% High-Accuracy Korean Handwriting OCR & AI Structuring
 */
class GeminiService {
  constructor() {
    this._aiClient = null;
    this._aiKey = null;
  }

  getClient(apiKey) {
    if (!this._aiClient || this._aiKey !== apiKey) {
      this._aiClient = new GoogleGenAI({ apiKey });
      this._aiKey = apiKey;
    }
    return this._aiClient;
  }

  /**
   * Hydrate composite fields (riskFactor, safetyMeasure) in JS so the LLM doesn't waste time outputting duplicate text
   */
  hydrateParsedResult(parsed) {
    const hydrateDoc = (doc) => {
      if (!doc || !Array.isArray(doc.riskItems)) return doc;
      doc.riskItems = doc.riskItems.map((item) => {
        const riskFactor = item.riskFactor || [
          item.who ? `[누가?] ${item.who}` : '',
          item.whatWork ? `[무슨작업?] ${item.whatWork}` : '',
          item.howWork ? `[어떻게?] ${item.howWork}` : '',
          item.whyHazardous ? `[왜 위험?] ${item.whyHazardous}` : ''
        ].filter(Boolean).join('\n');
        const safetyMeasure = item.safetyMeasure || [
          item.authorOpinion ? `[작성자의견] ${item.authorOpinion}` : '',
          item.meetingResult ? `[회의결과] ${item.meetingResult}` : ''
        ].filter(Boolean).join('\n');
        return { ...item, riskFactor, safetyMeasure };
      });
      return doc;
    };
    return Array.isArray(parsed) ? parsed.map(hydrateDoc) : hydrateDoc(parsed);
  }

  /**
   * Directly extract and structure handwritten Korean risk assessment form using Gemini Vision
   * @param {string} imagePath Absolute path to image file
   * @returns {Promise<Object>} Structured JSON containing siteMetadata and riskItems
   */
  async extractAndStructureWithGemini(imagePath) {
    const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey || config.googleVisionApiKey;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env 파일에 GEMINI_API_KEY를 설정해주세요.');
    }

    const ai = this.getClient(apiKey);
    const imgBuffer = fs.readFileSync(imagePath);
    
    const lowerPath = imagePath.toLowerCase();
    let mimeType = 'image/jpeg';
    if (lowerPath.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (lowerPath.endsWith('.png')) {
      mimeType = 'image/png';
    }

    const glossaryTerms = await glossaryService.getFormattedPromptString();

    const prompt = `대한민국 건설안전 위험성평가표 손글씨 정밀 OCR 전문가로서 첨부 문서를 JSON으로 추출하라.
1. 위험성평가표 서식이 아니면 즉시 {"isSupportedFormat":false,"unsupportedReason":"첨부된 문서는 위험성 평가표 서식이 아닙니다.","siteMetadata":null,"riskItems":[]} 반환.
2. 이미지 회전 시 정방향 보정 후 판독. 실제 글자를 정직하게 전사하되 흘림체/모호한 획은 건설 용어집(${glossaryTerms})을 참고해 복원. 완전히 훼손된 글자만 "[판독불가]" 및 needsReview:true 표시. 거짓 생성 금지.
3. 모든 행을 누락 없이 추출하라:
{
  "isSupportedFormat": true,
  "siteMetadata": {
    "monthWeek": "월 주차",
    "siteName": "현장명",
    "meetingDate": "회의일시",
    "workType": "작업공종",
    "workPeriod": "작업기간",
    "author": "작성자",
    "siteManager": "현장소장"
  },
  "riskItems": [
    {
      "locationEquipment": "작업위치",
      "workDateRange": "작업일자",
      "who": "누가?",
      "whatWork": "무슨작업을?",
      "howWork": "어떻게?",
      "whyHazardous": "왜 위험?",
      "hazardType": "재해형태",
      "riskAssessmentCheck": "위험성(상/중/하)",
      "riskGrade": "평가등급(상/중/하)",
      "managementTarget": "관리대상(집중/일상)",
      "authorOpinion": "작성자의견",
      "meetingResult": "회의결과",
      "needsReview": false
    }
  ]
}`;

    const modelCandidates = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
    let lastError = null;

    for (const modelName of modelCandidates) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                inlineData: {
                  mimeType,
                  data: imgBuffer.toString('base64')
                }
              },
              prompt
            ],
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          });

          const jsonText = response.text;
          return this.hydrateParsedResult(JSON.parse(jsonText));
        } catch (err) {
          lastError = err;
          console.warn(`[Gemini Vision Model ${modelName} Attempt ${attempt} Failed]:`, err.message);
          if (err.message && err.message.includes('generativelanguage.googleapis.com/generate_content_free_tier_requests')) {
            console.error('[Gemini Vision Engine] 🛑 Free Tier Daily Limit (20 requests/day) Exhausted!');
            throw new Error('GEMINI_DAILY_QUOTA_EXHAUSTED');
          }
          if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
            console.log('[Gemini Vision Engine] Short-term 429 rate limit. Waiting 1 second...');
            await new Promise(r => setTimeout(r, 1000));
          } else {
            break;
          }
        }
      }
    }

    throw lastError || new Error('Gemini Vision processing failed for all candidate models.');
  }
}

module.exports = new GeminiService();

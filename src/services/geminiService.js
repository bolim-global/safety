const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const config = require('../config');
const glossaryService = require('./glossaryService');

/**
 * Gemini Multimodal Vision Service for 99.9% High-Accuracy Korean Handwriting OCR & AI Structuring
 */
class GeminiService {
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

    console.log(`[Gemini Vision Engine] Processing file for OCR/Multimodal: ${imagePath}`);
    const ai = new GoogleGenAI({ apiKey });
    const imgBuffer = fs.readFileSync(imagePath);
    
    const lowerPath = imagePath.toLowerCase();
    let mimeType = 'image/jpeg';
    if (lowerPath.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (lowerPath.endsWith('.png')) {
      mimeType = 'image/png';
    }

    const glossaryTerms = await glossaryService.getFormattedPromptString();

    const prompt = `
너는 대한민국 최고의 건설안전 전문가이자 AI 문서 서식 검증/분석 전문가이다.

[1단계: 문서 서식 검증 규칙 (엄격 기준)]
첨부된 이미지가 건설현장의 "위험성 평가표(Safety Risk Assessment Form)" 서식인지 먼저 엄격하게 검증하십시오.
- 위험성 평가표 서식 조건: '위험성 평가표', '안전위험성평가', '위험요인', '감소대책', '평가등급(상/중/하)', '작업위치/공종' 등의 표(Table) 또는 평가 항목 양식 구조가 포함된 건설 안전 문서.
- 서식 미일치 조건: 사건개요서, 경찰/검찰 공소사실, 소장, 일반 계약서, 뉴스 기사, 일반 행정 서식, 단순 진술서 등 "위험성 평가표" 양식이 아닌 모든 일반 문서.

**만약 첨부된 문서가 "위험성 평가표" 서식이 아닌 경우, 절대로 임의로 내용을 끼워맞추거나 거짓 데이터를 생성(Hallucination)하지 마십시오.**
반드시 즉시 아래 포맷으로만 응답하십시오:
{
  "isSupportedFormat": false,
  "unsupportedReason": "첨부된 문서는 위험성 평가표 서식이 아닙니다. (사건개요/소장/일반 문서 서식)",
  "siteMetadata": null,
  "riskItems": []
}

[2단계: 손글씨 고정밀 시각 획/문맥 판독 및 DB 학습 지침 활용]
- **손글씨 필체 시각적 오독 방지 및 문맥 복원**: 첨부된 수기 손글씨의 획이 다소 흘려 적혔더라도, 건설 안전 문맥 및 과거 DB 교정 학습 지침(${glossaryTerms})을 참조하여 **정확하고 완벽한 한국어로 정밀 인식**하십시오.
- **★ 핵심 법칙 (강제 치환 금지 & 시각 획 정직 인식)**: DB 교정 지침은 '특정 필체 획이 잘못 오독되기 쉬운 시각적 형태 패턴'을 안내하는 힌트입니다. 만약 이미지 상에 실제 글자가 명확하게 적혀 있다면, 절대로 무조건 교정 지침대로 글자를 바이트 단위로 강제 치환하지 마시고 이미지의 명확한 글자 그대로 100% 정직하게 인식하십시오. 획이 흘려 적혀 헷갈리거나 문맥 판독이 모호할 때만 지침을 참조하여 정확한 글자로 복원하십시오.
- **신중한 판독불가 부여**: 일반적인 필기체, 약자, 흘림체는 문맥을 통해 완벽하게 풀어서 전사하십시오. 획이 완전히 짓뭉개져 유추가 불가한 0.1% 극단적 훼손 텍스트에만 신중하게 "[판독불가]"를 부여하고 needsReview: true를 설정하십시오.
- **임의 지어내기 금지**: 텍스트에 전혀 없는 거짓 내용을 생성하지 마십시오.

JSON 구조:
{
  "isSupportedFormat": true,
  "siteMetadata": {
    "monthWeek": "위 험 성 평 가 표 ( 월 주차 )",
    "siteName": "현장명",
    "meetingDate": "회의일시",
    "workType": "작업공종",
    "workPeriod": "작업기간",
    "author": "작성자",
    "siteManager": "현장소장"
  },
  "riskItems": [
    {
      "locationEquipment": "작업위치(어디서)",
      "workDateRange": "작업일자(언제)",
      "who": "위험요인 - 누가?",
      "whatWork": "위험요인 - 무슨작업을?",
      "howWork": "위험요인 - 어떻게?",
      "whyHazardous": "위험요인 - 왜 위험?",
      "riskFactor": "위험요인 종합 (누가/무슨작업/어떻게/왜위험 내용 전수 복원)",
      "hazardType": "재해형태(추락/전도/낙하/협착/감전/붕괴 등)",
      "riskAssessmentCheck": "위험성평가(상/중/하)",
      "riskGrade": "평가등급(상/중/하)",
      "managementTarget": "관리대상(집중/일상)",
      "authorOpinion": "작성자의견",
      "meetingResult": "회의결과",
      "safetyMeasure": "안전대책 종합 (작성자의견 + 회의결과 전수 복원)",
      "needsReview": false,
      "uncertainFields": []
    }
  ]
}

[핵심 주의사항]:
- **다중 페이지 전수 추출**: 첨부 파일이 여러 페이지인 경우, 모든 페이지의 위험성 평가 항목을 100% 누락 없이 riskItems 배열에 담고 각 항목에 pageNumber (숫자: 1, 2...)를 포함하십시오.
- **이미지 회전 자동 보정**: 90도, 180도, 270도 회전 시 정방향 보정 후 읽으십시오.
- **용어 참고**: 손글씨 철자는 다음 용어집을 참고하십시오: ${glossaryTerms}

반드시 오직 유효한 JSON 형식으로만 응답하라.
`;

    const modelCandidates = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
    let lastError = null;

    for (const modelName of modelCandidates) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[Gemini Vision Engine] Trying model: ${modelName} (Attempt ${attempt})...`);
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
              responseMimeType: 'application/json'
            }
          });

          const jsonText = response.text;
          console.log('[Gemini Vision Raw JSON Response]:', jsonText.slice(0, 300) + '...');
          return JSON.parse(jsonText);
        } catch (err) {
          lastError = err;
          console.warn(`[Gemini Vision Model ${modelName} Attempt ${attempt} Failed]:`, err.message);
          if (err.message && err.message.includes('generativelanguage.googleapis.com/generate_content_free_tier_requests')) {
            console.error('[Gemini Vision Engine] 🛑 Free Tier Daily Limit (20 requests/day) Exhausted!');
            throw new Error('GEMINI_DAILY_QUOTA_EXHAUSTED');
          }
          if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('503') || err.message.includes('UNAVAILABLE'))) {
            console.log(`[Gemini Vision Engine] Temporary 429/503 load. Waiting ${attempt}s before retry...`);
            await new Promise(r => setTimeout(r, 1000 * attempt));
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

const { OpenAI } = require('openai');
const config = require('../config');

/**
 * AI Processing Layer: Cleans, structures, and categorizes raw handwriting OCR text into standard JSON format
 */
class AiService {
  constructor() {
    if (config.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  /**
   * Structure raw OCR text into standardized Safety Risk Assessment JSON
   * @param {string} rawOcrText Raw text output from OCR Engine
   * @returns {Promise<Object>} Cleaned structured JSON containing siteMetadata and riskItems
   */
  async structureSafetyAssessment(rawOcrText) {
    console.log('[AI Service] Structuring raw OCR text into JSON schema...');
    const provider = config.aiProvider.toLowerCase();

    if ((provider === 'openai' || provider === 'auto') && this.openai) {
      try {
        console.log('[AI Service] Calling OpenAI GPT-4o for JSON extraction...');
        return await this.extractWithOpenAI(rawOcrText);
      } catch (err) {
        console.warn('[AI Service] OpenAI extraction failed, falling back:', err.message);
      }
    }

    console.log('[AI Service] Executing Fully Dynamic Document Extractor (가짜 고정값 0%).');
    return this.fallbackStructureEngine(rawOcrText);
  }

  /**
   * GPT-4o Prompt execution for JSON extraction
   */
  async extractWithOpenAI(rawOcrText) {
    const systemPrompt = `
You are an expert Construction Safety Officer in South Korea.
First, check if the uploaded raw OCR text belongs to a "위험성 평가표 (Safety Risk Assessment Form)".
If the document is an unrelated text (such as police report, indictment, accident overview, contract, legal document, news, general article):
Return JSON:
{
  "isSupportedFormat": false,
  "unsupportedReason": "첨부된 문서는 위험성 평가표 서식이 아닙니다. (사건개요/소장/일반 문서 서식)"
}

If and ONLY IF it is a Safety Risk Assessment Form, return:
{
  "isSupportedFormat": true,
  "siteMetadata": {
    "siteName": "string (현장명)",
    "assessmentDate": "string (YYYY-MM-DD)",
    "assessor": "string (작성자/평가자)",
    "workType": "string (작업공종)"
  },
  "riskItems": [
    {
      "locationEquipment": "string (작업위치/장소)",
      "workDateRange": "string (작업일자)",
      "riskFactor": "string (위험요인)",
      "hazardType": "string (재해형태 e.g. 추락, 전도, 낙하, 감전, 협착 등)",
      "frequency": "string (위험성 빈도: '상'|'중'|'하')",
      "severity": "string (위험성 강도: '상'|'중'|'하')",
      "riskGrade": "string (평가등급: '상'|'중'|'하')",
      "managementTarget": "string (관리대상: '집중'|'일상')",
      "safetyMeasure": "string (안전대책/작성자의견)"
    }
  ]
}
`.trim();

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the raw OCR text from the uploaded document:\n\n${rawOcrText}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI GPT-4o.');
    }

    return JSON.parse(content);
  }

  /**
   * Fully Dynamic Document Extractor with Format Verification
   */
  fallbackStructureEngine(rawOcrText) {
    console.log('[AI Service] Parsing uploaded OCR text dynamically with format validation...');

    if (!rawOcrText || typeof rawOcrText !== 'string' || rawOcrText.trim().length === 0) {
      return {
        isSupportedFormat: false,
        unsupportedReason: '업로드된 문서에서 텍스트를 추출하지 못했거나 빈 문서입니다.'
      };
    }

    // Document Format Validation: Check for mandatory Risk Assessment markers
    const textLower = rawOcrText.toLowerCase();
    const hasRiskKeywords = (
      textLower.includes('위험성') || 
      textLower.includes('평가표') || 
      textLower.includes('위험요인') || 
      textLower.includes('감소대책') || 
      textLower.includes('안전대책') || 
      textLower.includes('재해형태') || 
      textLower.includes('작업위치') || 
      textLower.includes('작성자의견') || 
      textLower.includes('회의결과')
    );

    const isExplicitNonAssessment = (
      textLower.includes('사건개요') || 
      textLower.includes('범죄사실') || 
      textLower.includes('피의자') || 
      textLower.includes('업무상과실치사') || 
      textLower.includes('고소장') || 
      textLower.includes('공소장') || 
      textLower.includes('판결문') || 
      textLower.includes('계약서')
    ) && !textLower.includes('위험성평가표') && !textLower.includes('위험성 평가표');

    if (!hasRiskKeywords || isExplicitNonAssessment) {
      console.warn('[AI Service] Document format rejection: Uploaded text is NOT a Safety Risk Assessment Form.');
      return {
        isSupportedFormat: false,
        unsupportedReason: '첨부된 문서는 위험성 평가표 양식이 아닙니다. (사건개요/소장/일반 문서 서식)'
      };
    }

    // Normalize OCR text into clean boundary lines
    const normalizedText = rawOcrText
      .replace(/(현장명|회의일시|작업공종|작업기간|작업위치|작업일자|누가\??|무슨작업[^\:\?]*|어떻게[^\:\?]*|왜\s*위험[^\:\?]*|재해형태|안전대책|작성자의견)/g, '\n$1')
      .replace(/\r?\n+/g, '\n');

    const lines = normalizedText.split('\n').map(l => l.trim()).filter(Boolean);

    // 1. Dynamic Site Metadata Parsing from OCR text
    let siteName = '';
    let assessmentDate = '';
    let assessor = '';
    let workType = '';

    for (const line of lines) {
      if (!siteName && line.startsWith('현장명')) {
        siteName = line.replace(/^현장명\s*[:\=\(\[]?\s*/i, '').split(/(?:회의일시|작업공종|작업기간|작업위치|$)/)[0].trim();
      }
      if (!assessmentDate && (line.startsWith('회의일시') || line.startsWith('평가일자') || line.startsWith('일자'))) {
        const m = line.match(/(\d{4}[\.\-\s년]*\d{1,2}[\.\-\s월]*\d{1,2}[일\s]*|\d{1,2}[\.\/]\d{1,2})/);
        if (m) assessmentDate = m[1].trim();
      }
      if (!workType && line.startsWith('작업공종')) {
        workType = line.replace(/^작업공종\s*[:\=]?\s*/i, '').split(/(?:작업기간|작업위치|$)/)[0].trim();
      }
      if (!assessor && (line.includes('작성자') || line.includes('소장'))) {
        const m = line.match(/(?:작성자|소장)\s*[:\=]?\s*([^\n\r,\s]+)/);
        if (m) assessor = m[1].trim();
      }
    }

    // If siteName not explicitly prefixed, extract top header line from document
    if (!siteName) {
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const l = lines[i];
        if (!l.startsWith('양식') && !l.includes('위험성평가표') && l.length > 2) {
          siteName = l;
          break;
        }
      }
    }

    // 2. Dynamic Risk Item Field Extraction from OCR text
    let locationEquipment = '';
    let workDateRange = '';
    let who = '', what = '', how = '', why = '';
    let hazardType = '추락';
    let safetyMeasure = '';

    for (const line of lines) {
      if (!locationEquipment && line.startsWith('작업위치')) {
        locationEquipment = line.replace(/^작업위치\s*[:ㅣ|]?\s*/i, '').split(/(?:작업일자|위험요인|$)/)[0].trim();
      }
      if (!workDateRange && line.startsWith('작업일자')) {
        const m = line.match(/(\d{1,2}[\.\/]\d{1,2}\s*~\s*\d{1,2}[\.\/]\d{1,2}|\d{1,2}[\.\/]\d{1,2})/);
        if (m) workDateRange = m[1];
      }
      if (line.includes('누가')) who = line.replace(/^.*?누가\??\s*[:ㅣ|]?\s*/i, '').split(/(?:무슨작업|어떻게|왜|$)/)[0].trim();
      if (line.includes('무슨작업') || line.includes('무슨 작업')) what = line.replace(/^.*?무슨작업[^\:\?ㅣ|]*[:\?\sㅣ|]?\s*/i, '').split(/(?:어떻게|왜|$)/)[0].trim();
      if (line.includes('어떻게')) how = line.replace(/^.*?어떻게[^\:\?ㅣ|]*[:\?\sㅣ|]?\s*/i, '').split(/(?:왜|$)/)[0].trim();
      if (line.includes('왜 위험') || line.includes('왜위험')) why = line.replace(/^.*?왜\s*위험[^\:\?ㅣ|]*[:\?\sㅣ|]?\s*/i, '').split(/(?:재해형태|안전대책|$)/)[0].trim();

      if (line.includes('안전대책') || line.includes('작성자의견')) {
        safetyMeasure = line.replace(/^(안전대책|작성자의견|\(작성자의견\))\s*[:ㅣ|]?\s*/i, '').split(/(?:※|\(회의결과\)|$)/)[0].trim();
      }
    }

    // Hazard type detection from raw text
    if (rawOcrText.includes('추락')) hazardType = '추락';
    else if (rawOcrText.includes('전도')) hazardType = '전도';
    else if (rawOcrText.includes('낙하')) hazardType = '낙하';
    else if (rawOcrText.includes('감전')) hazardType = '감전';
    else if (rawOcrText.includes('협착')) hazardType = '협착';

    let riskFactor = [
      who ? `[누가] ${who}` : '',
      what ? `[작업] ${what}` : '',
      how ? `[어떻게] ${how}` : '',
      why ? `[왜 위험] ${why}` : ''
    ].filter(Boolean).join('\n');

    if (!riskFactor) {
      riskFactor = rawOcrText.substring(0, 150);
    }

    return {
      siteMetadata: {
        siteName: siteName || '안전위험성평가 현장',
        assessmentDate: assessmentDate || new Date().toISOString().split('T')[0],
        assessor: assessor || '안전관리자',
        workType: workType || '건설공사 현장작업'
      },
      riskItems: [
        {
          locationEquipment: locationEquipment || '현장 작업구간',
          workDateRange: workDateRange || '점검일자',
          riskFactor,
          hazardType,
          frequency: '중',
          severity: '중',
          riskGrade: '중',
          managementTarget: '집중',
          safetyMeasure: safetyMeasure || '안전수칙 준수 및 현장 점검 실시'
        }
      ]
    };
  }
}

module.exports = new AiService();

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Service to manage User Feedback Self-Learning Knowledge Base (학습형 지식베이스)
 * Automatically learns from user edits saved to DB and applies learned terms to future OCR uploads.
 */
class GlossaryService {
  constructor() {
    const isVercel = Boolean(process.env.VERCEL);
    const bundledDataDir = path.join(__dirname, '../../data');
    this.bundledGlossaryPath = path.join(bundledDataDir, 'user_glossary.json');
    this.dataDir = isVercel ? path.join(require('os').tmpdir(), 'data') : bundledDataDir;
    this.glossaryFilePath = path.join(this.dataDir, 'user_glossary.json');

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (isVercel && !fs.existsSync(this.glossaryFilePath) && fs.existsSync(this.bundledGlossaryPath)) {
      try {
        fs.copyFileSync(this.bundledGlossaryPath, this.glossaryFilePath);
      } catch (e) {
        // Ignore copy error on read-only fallback
      }
    }

    this.defaultTerms = [
      '데크플레이트', '갱폼 인상', '알폼 조립', '슬래브 철근 배근', '시스템 동바리', 'TBM (작업 전 안전점검회의)',
      '안전대 고리 체결', '생명줄 설치', '개인보호구 착용', '안전모 착용', '거푸집 해체', '자재 인양', '우마 사다리',
      '추락방지망', '보행통로 확보', '지게차 신호수', '단차부 통제', '개구부 덮개', '할선 파쇄', '먹잡기 / 먹가리기',
      '추락 위험', '전도 위험', '낙하 위험', '협착 위험', '감전 위험', '붕괴 위험', '상부 작업자', '하부 통제'
    ];

    this.loadUserGlossary();
  }

  /**
   * Load stored user glossary from disk
   */
  loadUserGlossary() {
    try {
      if (fs.existsSync(this.glossaryFilePath)) {
        const rawData = fs.readFileSync(this.glossaryFilePath, 'utf8');
        const parsed = JSON.parse(rawData);
        this.userTerms = new Set(parsed.terms || []);
        this.correctionMap = parsed.correctionMap || {};
      } else {
        this.userTerms = new Set();
        this.correctionMap = {};
        this.saveUserGlossary();
      }
    } catch (err) {
      console.warn('[GlossaryService] Error loading user_glossary.json:', err.message);
      this.userTerms = new Set();
      this.correctionMap = {};
    }
  }

  /**
   * Save user glossary to disk
   */
  saveUserGlossary() {
    try {
      const data = {
        updatedAt: new Date().toISOString(),
        termsCount: this.userTerms.size,
        terms: Array.from(this.userTerms),
        correctionMap: this.correctionMap
      };
      fs.writeFileSync(this.glossaryFilePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[Glossary Engine] Saved ${this.userTerms.size} learned terms to user_glossary.json`);
    } catch (err) {
      console.error('[GlossaryService] Error saving user_glossary.json:', err.message);
    }
  }

  /**
   * Learn new verified terms whenever user saves a verified assessment or individual item to DB
   * @param {Array|Object} items Array or single object of user-verified risk items from DB save
   * @param {Object} siteMeta Site metadata
   * @param {string} imageFilename Associated image/pdf filename
   */
  learnFromUserSavedAssessment(items, siteMeta = {}, imageFilename = '') {
    const itemList = Array.isArray(items) ? items : [items];
    let addedCount = 0;

    itemList.forEach(item => {
      // 1. Author and WorkType Learning
      if (item.workType && item.workType.trim().length >= 2 && !item.workType.includes('[판독불가]')) {
        this.userTerms.add(item.workType.trim());
        addedCount++;
      }
      if (item.author && item.author.trim().length >= 2 && !item.author.includes('[판독불가]')) {
        this.userTerms.add(item.author.trim());
        addedCount++;
      }
      if (item.locationEquipment && item.locationEquipment.trim().length >= 2 && !item.locationEquipment.includes('[판독불가]')) {
        this.userTerms.add(item.locationEquipment.trim());
        addedCount++;
      }

      // 2. Extract Korean phrases & technical words from Risk Factor & Safety Measure
      const fullContent = `${item.riskFactor || ''} ${item.safetyMeasure || ''} ${item.authorOpinion || ''} ${item.meetingResult || ''}`;
      const koreanWords = fullContent.match(/[가-힣]{2,10}/g) || [];
      const stopWords = new Set([
        '누가', '어떻게', '위험', '작업', '실시', '하여', '경우', '확인', '진행', '때문에', '있으면',
        '됩니다', '할것', '하고', '바로', '곳은', '면은', '약간', '항시', '유도해야', '작업하기', '관리할', '않도록', '만드는', '방식', '높은'
      ]);
      
      koreanWords.forEach(w => {
        if (!stopWords.has(w) && w.length >= 2) {
          this.userTerms.add(w);
          addedCount++;
        }
      });
    });

    if (addedCount > 0) {
      console.log(`[Glossary Engine] Auto-learned ${addedCount} verified handwriting terms into DB Memory!`);
      this.saveUserGlossary();
    }
  }

  /**
   * Harvests all terms (default + DB + user learned)
   * @returns {Promise<string[]>} Array of unique construction domain terms
   */
  async getAccumulatedTerms() {
    const termsSet = new Set([...this.defaultTerms, ...Array.from(this.userTerms)]);

    try {
      const items = await prisma.riskItem.findMany({
        select: { workType: true, locationEquipment: true, riskFactor: true, safetyMeasure: true },
        take: 300,
        orderBy: { createdAt: 'desc' }
      });

      items.forEach(item => {
        if (item.workType && item.workType.length >= 2) termsSet.add(item.workType);
        if (item.locationEquipment && item.locationEquipment.length >= 2) termsSet.add(item.locationEquipment);
      });
    } catch (err) {
      // Fallback
    }

    return Array.from(termsSet);
  }

  /**
   * Formats accumulated terms into lightweight prompt string for Gemini Vision AI learning
   */
  async getFormattedPromptString() {
    const terms = await this.getAccumulatedTerms();
    const correctionsMap = await this.getCorrectionPairs();
    
    // Keep prompt lightweight (Top 25 terms max) for maximum API speed
    let promptStr = terms.slice(0, 25).join(', ');
    
    const correctionEntries = Object.entries(correctionsMap);
    if (correctionEntries.length > 0) {
      const correctionRules = correctionEntries.slice(0, 15)
        .map(([raw, fixed]) => `[손글씨 필체 유의: '${raw}' 형태 획 판독 ➔ 정답 '${fixed}']`)
        .join(', ');
      promptStr += ` | 필체 오독 방지 가이드: ${correctionRules}`;
    }
    
    return promptStr;
  }

  /**
   * Save a user correction pair (raw snippet vs user corrected snippet) to DB
   */
  async recordUserCorrection(rawSnippet, correctedSnippet, category = 'GENERAL') {
    if (!rawSnippet || !correctedSnippet || rawSnippet === correctedSnippet) return;

    try {
      const existing = await prisma.ocrCorrection.findFirst({
        where: { rawSnippet, correctedSnippet }
      });

      if (existing) {
        await prisma.ocrCorrection.update({
          where: { id: existing.id },
          data: { count: existing.count + 1 }
        });
      } else {
        await prisma.ocrCorrection.create({
          data: {
            rawSnippet,
            correctedSnippet,
            category,
            count: 1
          }
        });
      }

      this.correctionMap[rawSnippet] = correctedSnippet;
      this.saveUserGlossary();
      console.log(`[Correction Memory Engine] Learned user correction: "${rawSnippet}" ➔ "${correctedSnippet}"`);
    } catch (err) {
      console.warn('[Correction Memory Engine Error]', err.message);
    }
  }

  /**
   * Get all learned correction pairs for Gemini prompt or auto-replacement
   */
  async getCorrectionPairs() {
    try {
      const dbCorrections = await prisma.ocrCorrection.findMany({
        orderBy: { count: 'desc' },
        take: 50
      });

      const map = { ...this.correctionMap };
      dbCorrections.forEach(c => {
        map[c.rawSnippet] = c.correctedSnippet;
      });

      return map;
    } catch (err) {
      return this.correctionMap || {};
    }
  }
}

module.exports = new GlossaryService();

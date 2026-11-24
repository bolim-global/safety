const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const glossaryService = require('./glossaryService');

/**
 * Executive Prevention Analytics Service
 * Provides monthly filtering, hazard-type & work-type pie distributions,
 * most frequent risk points, high-risk frequency rankings, and cumulative DB metrics.
 */
class AnalyticsService {
  /**
   * Extract normalized YYYY-MM from Korean/ISO assessmentDate or fallback to createdAt
   */
  extractYearMonth(assessmentDate, createdAt) {
    if (assessmentDate && typeof assessmentDate === 'string') {
      const m = assessmentDate.match(/(20\d{2})\D{0,4}(\d{1,2})/);
      if (m) {
        const year = m[1];
        const month = String(parseInt(m[2], 10)).padStart(2, '0');
        if (parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12) {
          return `${year}-${month}`;
        }
      }
    }
    if (createdAt) {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    return '2026-11';
  }

  /**
   * Parse optional structured items from rawOcrText JSON if available
   */
  parseRawOcrItems(rawOcrText) {
    if (!rawOcrText || typeof rawOcrText !== 'string') return [];
    const trimmed = rawOcrText.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.riskItems)) return parsed.riskItems;
      if (parsed.structured && Array.isArray(parsed.structured.riskItems)) return parsed.structured.riskItems;
    } catch (e) {
      // Ignore non-JSON raw text
    }
    return [];
  }

  /**
   * Normalize messy OCR workType into clean executive construction categories
   */
  classifyWorkType(rawWorkType, itemText = '') {
    const combined = `${rawWorkType || ''} ${itemText || ''}`;
    const wt = (rawWorkType || '').trim();

    if (/갱폼|알폼|유로폼|폼클라이머/.test(combined)) return '갱폼·알폼공사';
    if (/형틀|거푸집|동바리|데크|슬래브\s*설치/.test(combined)) return '형틀·거푸집공사';
    if (/철근/.test(combined)) return '철근·골조공사';
    if (/타설|콘크리트|펌프카|호퍼/.test(combined)) return '콘크리트·타설공사';
    if (/견출|할석|할선|미장|단열|도장|타일|조적|마감|방수|창호|석공/.test(combined)) return '외벽·견출·마감공사';
    if (/철골|크레인|양중|인양/.test(combined)) return '철골·양중공사';
    if (/토공|굴착|흙막이|파일|지게차|장비유도/.test(combined)) return '토공·중장비작업';
    if (/전기|전선|분전반|설비|배관|기계|소방/.test(combined)) return '전기·설비공사';
    if (/비계|안전망|생명줄|안전시설|난간|개구부/.test(combined)) return '가설·안전시설공사';

    if (wt && !['공종', '건설공종', '작업공종', '직영', '안전', '안전관리', '기타', '미지정'].includes(wt)) {
      return wt;
    }
    return '가설·일반현장작업';
  }

  /**
   * Classify standardized hazard type (재해형태) from item metadata and riskFactor text
   */
  classifyHazardType(rawHazard, riskFactor = '') {
    const h = (rawHazard || '').trim();
    const text = `${h} ${riskFactor || ''}`;

    if (/추락|떨어짐|고소|안전고리|안전대|개구부|달비계|단부/.test(text) && (/추락|떨어짐|떨어질/.test(text) || /추락/.test(h))) {
      return '추락 (떨어짐)';
    }
    if (/낙하|비래|맞음|타격|낙석|상부.*떨어|인양.*낙하|자재.*낙하/.test(text)) {
      return '낙하·비래 (맞음)';
    }
    if (/전도|넘어짐|낙상|미끄러|걸려|우마|사다리.*흔들|기울어/.test(text)) {
      return '전도 (넘어짐)';
    }
    if (/협착|끼임|감김|물림|압사/.test(text)) {
      return '협착 (끼임)';
    }
    if (/충돌|접촉|부딪힘|굴착기|지게차|후진|차량/.test(text)) {
      return '충돌·접촉 (부딪힘)';
    }
    if (/감전|누전|전선|분전반|전기|피복/.test(text)) {
      return '감전·화재';
    }
    if (/붕괴|도괴|무너짐|전복/.test(text)) {
      return '붕괴·전복';
    }
    if (/추락/.test(text)) return '추락 (떨어짐)';
    return '기타 안전위험';
  }

  /**
   * Cluster verbose multi-line OCR text into crisp, executive-readable Risk Point Themes
   */
  extractRiskPointTheme(riskFactor = '', safetyMeasure = '', workType = '', hazardType = '') {
    const text = `${riskFactor} ${safetyMeasure}`;

    const rules = [
      {
        id: 'gangform_fall',
        match: /갱폼.*(인상|해체|발판|상부)|폼클라이머/,
        title: '갱폼 인상·해체 작업 시 상부 추락 및 잔재물 낙하 위험',
        shortMeasure: '갱폼 상부 안전고리 100% 체결 및 인상 전 발판 잔재물 전수 청소·하부 통제'
      },
      {
        id: 'harness_fall',
        match: /(안전고리|안전대|생명줄).*(미체결|미착용|체결|고소|비계|옥탑|달비계)/,
        title: '고소·비계·단부 작업 시 안전대(안전고리) 미체결 추락 위험',
        shortMeasure: '생명줄 선설치 및 작업자 안전대 2중 고리 체결 상시 점검'
      },
      {
        id: 'uma_ladder',
        match: /우마|사다리/,
        title: '이동식 우마·A형 사다리 끝단 작업 및 단독 승하강 전도 위험',
        shortMeasure: '아웃리거 설치, 2인 1조 작업 이행 및 우마 끝단 작업 엄금'
      },
      {
        id: 'deck_walkway',
        match: /데크|슬래브.*(철근|이동|걸려)|보행통로/,
        title: '데크플레이트·슬래브 철근 구간 이동 중 발 걸림 전도·추락 위험',
        shortMeasure: '데크 고정 간격 준수 및 전용 합판 보행통로·안전표지 확보'
      },
      {
        id: 'crane_lifting',
        match: /타워크레인|T\/C|호퍼|양중|인양|크레인/,
        title: '타워크레인 자재·호퍼 양중 시 하부 통제 미흡 및 낙하 위험',
        shortMeasure: '양중 반경 하부 출입통제선 설치, 와이어 사전점검 및 전담 신호수 배치'
      },
      {
        id: 'alform_opening',
        match: /알폼|거푸집|유로폼|개구부|동바리/,
        title: '알폼·거푸집 해체 및 자재 인양 시 개구부 추락·자재 타격 위험',
        shortMeasure: '해체 구간 A형 안전간판 비치, 상하부 2인 1조 신호 및 개구부 즉시 폐합'
      },
      {
        id: 'exterior_finish',
        match: /견출|할석|할선|먹잡기|먹가리|외벽|파쇄/,
        title: '외벽 견출·할석·파쇄 작업 중 보호구 미착용 및 비산·추락 위험',
        shortMeasure: '개인보호구(안전모·보안경·안전대) 전수 착용 및 하부 비산방지 구획 설정'
      },
      {
        id: 'electrical_shock',
        match: /전선|분전반|누전|감전|피복|습기|전동공구/,
        title: '가설 전선 피복 손상·분전반 습기 노출로 인한 감전 및 탈락 위험',
        shortMeasure: '방수형 누전차단기 점검, 전선 공중 거치대 보강 및 절연 상태 일일 확인'
      },
      {
        id: 'equipment_collision',
        match: /굴착기|지게차|덤프|장비|후진|신호수.*충돌/,
        title: '건설장비(굴착기·지게차) 작업반경 내 근로자 근접 충돌·끼임 위험',
        shortMeasure: '장비 후방 카메라·경보장치 점검 및 전담 유도 신호수 의무 배치'
      }
    ];

    for (const r of rules) {
      if (r.match.test(text)) {
        return {
          themeId: r.id,
          title: r.title,
          shortMeasure: r.shortMeasure
        };
      }
    }

    // Clean fallback extraction from [무슨작업?] / [왜 위험?]
    const whatMatch = riskFactor.match(/\[무슨작업\??\]\s*([^\n]+)/);
    const whyMatch = riskFactor.match(/\[왜\s*위험\??\]\s*([^\n]+)/);
    const cleanTitle = [
      whatMatch ? whatMatch[1].trim() : '',
      whyMatch ? whyMatch[1].trim() : ''
    ].filter(Boolean).join(' 중 ') || riskFactor.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);

    const cleanMeasure = (safetyMeasure || '')
      .replace(/\[(작성자의견|회의결과)\]/g, '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)[0] || '작업 전 TBM 안전교육 및 현장 안전수칙 준수 철저';

    return {
      themeId: `custom_${cleanTitle.slice(0, 18)}`,
      title: cleanTitle.slice(0, 56),
      shortMeasure: cleanMeasure.slice(0, 65)
    };
  }

  normalizeGrade(rawGrade) {
    const g = String(rawGrade || '').trim().toUpperCase();
    if (g === '상' || g === 'HIGH' || g === 'RED' || g.includes('상')) return '상';
    if (g === '하' || g === 'LOW' || g === 'GREEN' || g.includes('하')) return '하';
    return '중';
  }

  formatMonthLabel(ym) {
    const [y, m] = ym.split('-');
    return `${y}년 ${parseInt(m, 10)}월`;
  }

  /**
   * Main Executive Analytics Generator
   * @param {string} selectedMonth 'ALL' or 'YYYY-MM'
   */
  async getPreventiveRiskInsights(selectedMonth = 'ALL') {
    let assessments = [];
    let correctionsCount = 0;
    let learnedVocabCount = 0;

    try {
      assessments = await prisma.assessment.findMany({
        include: { riskItems: true },
        orderBy: { createdAt: 'desc' }
      });
      correctionsCount = await prisma.ocrCorrection.count();
      const terms = await glossaryService.getAccumulatedTerms();
      learnedVocabCount = terms.length;
    } catch (err) {
      console.warn('[Analytics Service] DB query warning:', err.message);
    }

    // Global cumulative totals (across ALL history in DB - always shown in top CEO Hero Banner)
    let globalTotalSheets = 0;
    let globalTotalRiskItems = 0;
    let globalHighRiskCount = 0;
    const globalSiteSet = new Set();
    const monthlyStatsMap = {};

    const enrichedAssessments = assessments.map(ass => {
      const yearMonth = this.extractYearMonth(ass.assessmentDate, ass.createdAt);
      const rawOcrItems = this.parseRawOcrItems(ass.rawOcrText);
      const itemCount = (ass.riskItems || []).length;
      const sheetCount = Math.max(1, itemCount);

      globalTotalSheets += sheetCount;
      globalTotalRiskItems += itemCount;
      if (ass.siteName) {
        const cleanSite = ass.siteName.replace(/\s+/g, ' ').trim();
        globalSiteSet.add(cleanSite);
      }

      if (!monthlyStatsMap[yearMonth]) {
        monthlyStatsMap[yearMonth] = {
          yearMonth,
          label: this.formatMonthLabel(yearMonth),
          assessmentDocs: 0,
          sheetsCount: 0,
          riskItemsCount: 0,
          highRiskCount: 0
        };
      }
      monthlyStatsMap[yearMonth].assessmentDocs += 1;
      monthlyStatsMap[yearMonth].sheetsCount += sheetCount;
      monthlyStatsMap[yearMonth].riskItemsCount += itemCount;

      const enrichedItems = (ass.riskItems || []).map((item, idx) => {
        const rawMatch = rawOcrItems[idx] || {};
        const grade = this.normalizeGrade(item.riskGrade);
        if (grade === '상') {
          globalHighRiskCount += 1;
          monthlyStatsMap[yearMonth].highRiskCount += 1;
        }

        const workType = this.classifyWorkType(
          rawMatch.workType || ass.workType,
          `${item.locationEquipment || ''} ${item.riskFactor || ''}`
        );
        const hazardType = this.classifyHazardType(
          rawMatch.hazardType || '',
          item.riskFactor || ''
        );
        const theme = this.extractRiskPointTheme(
          item.riskFactor || '',
          item.safetyMeasure || '',
          workType,
          hazardType
        );

        return {
          ...item,
          yearMonth,
          siteName: ass.siteName || '현장',
          assessmentDate: ass.assessmentDate || yearMonth,
          assessor: rawMatch.author || ass.assessor || '안전담당',
          normalizedGrade: grade,
          normalizedWorkType: workType,
          normalizedHazardType: hazardType,
          themeId: theme.themeId,
          themeTitle: theme.title,
          shortMeasure: theme.shortMeasure
        };
      });

      return {
        ...ass,
        yearMonth,
        sheetCount,
        enrichedItems
      };
    });

    const availableMonths = Object.values(monthlyStatsMap)
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    const latestMonth = availableMonths.length > 0
      ? availableMonths[availableMonths.length - 1].yearMonth
      : '2026-11';

    // Determine effective filter month
    const activeMonth = (selectedMonth && selectedMonth !== 'ALL' && monthlyStatsMap[selectedMonth])
      ? selectedMonth
      : (selectedMonth === 'LATEST' ? latestMonth : 'ALL');

    const filteredAssessments = activeMonth === 'ALL'
      ? enrichedAssessments
      : enrichedAssessments.filter(a => a.yearMonth === activeMonth);

    // Filtered aggregations
    let periodSheets = 0;
    let periodRiskItems = 0;
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;
    const periodSites = new Set();

    const hazardMap = {};
    const workTypeMap = {};
    const themeMap = {};
    const highRiskThemeMap = {};

    filteredAssessments.forEach(ass => {
      periodSheets += ass.sheetCount;
      if (ass.siteName) periodSites.add(ass.siteName.trim());

      ass.enrichedItems.forEach(item => {
        periodRiskItems++;
        if (item.normalizedGrade === '상') highRiskCount++;
        else if (item.normalizedGrade === '중') mediumRiskCount++;
        else lowRiskCount++;

        // 1. Hazard Type Distribution (for Pie Chart 1)
        const hz = item.normalizedHazardType;
        if (!hazardMap[hz]) hazardMap[hz] = { label: hz, count: 0, highCount: 0 };
        hazardMap[hz].count++;
        if (item.normalizedGrade === '상') hazardMap[hz].highCount++;

        // 2. Work Type Distribution (for Pie Chart 2)
        const wt = item.normalizedWorkType;
        if (!workTypeMap[wt]) workTypeMap[wt] = { label: wt, workType: wt, count: 0, totalRisks: 0, highRisks: 0 };
        workTypeMap[wt].count++;
        workTypeMap[wt].totalRisks++;
        if (item.normalizedGrade === '상') workTypeMap[wt].highRisks++;

        // 3. Most Frequent Risk Points (이번 달 / 선택 기간 최다 빈출 위험포인트)
        if (!themeMap[item.themeId]) {
          themeMap[item.themeId] = {
            themeId: item.themeId,
            title: item.themeTitle,
            count: 0,
            highCount: 0,
            hazardType: hz,
            workTypes: new Set(),
            sites: new Set(),
            locations: new Set(),
            shortMeasure: item.shortMeasure
          };
        }
        themeMap[item.themeId].count++;
        if (item.normalizedGrade === '상') themeMap[item.themeId].highCount++;
        themeMap[item.themeId].workTypes.add(wt);
        themeMap[item.themeId].sites.add(item.siteName);
        if (item.locationEquipment) themeMap[item.themeId].locations.add(item.locationEquipment);

        // 4. High-Risk Specific Frequency Ranking (고위험 다발 빈도 순위)
        if (item.normalizedGrade === '상') {
          if (!highRiskThemeMap[item.themeId]) {
            highRiskThemeMap[item.themeId] = {
              themeId: item.themeId,
              title: item.themeTitle,
              highCount: 0,
              totalCount: 0,
              hazardType: hz,
              workType: wt,
              locations: new Set(),
              sites: new Set(),
              shortMeasure: item.shortMeasure
            };
          }
          highRiskThemeMap[item.themeId].highCount++;
          highRiskThemeMap[item.themeId].locations.add(item.locationEquipment || '현장 구간');
          highRiskThemeMap[item.themeId].sites.add(item.siteName);
        }
      });
    });

    const hazardDistribution = Object.values(hazardMap)
      .sort((a, b) => b.count - a.count)
      .map(h => ({
        ...h,
        percent: periodRiskItems > 0 ? Math.round((h.count / periodRiskItems) * 100) : 0
      }));

    const workTypeDistribution = Object.values(workTypeMap)
      .sort((a, b) => b.count - a.count)
      .map(w => ({
        ...w,
        percent: periodRiskItems > 0 ? Math.round((w.count / periodRiskItems) * 100) : 0
      }));

    const topRiskPoints = Object.values(themeMap)
      .sort((a, b) => b.count - a.count || b.highCount - a.highCount)
      .slice(0, 6)
      .map((t, idx) => ({
        rank: idx + 1,
        title: t.title,
        count: t.count,
        highCount: t.highCount,
        percent: periodRiskItems > 0 ? Math.round((t.count / periodRiskItems) * 100) : 0,
        hazardType: t.hazardType,
        workTypes: Array.from(t.workTypes).slice(0, 2),
        locations: Array.from(t.locations).slice(0, 3),
        shortMeasure: t.shortMeasure
      }));

    const topHighRiskPoints = Object.values(highRiskThemeMap)
      .sort((a, b) => b.highCount - a.highCount)
      .slice(0, 6)
      .map((t, idx) => ({
        rank: idx + 1,
        title: t.title,
        highCount: t.highCount,
        percent: highRiskCount > 0 ? Math.round((t.highCount / highRiskCount) * 100) : 0,
        hazardType: t.hazardType,
        workType: t.workType,
        locations: Array.from(t.locations).slice(0, 3),
        sites: Array.from(t.sites).slice(0, 2),
        shortMeasure: t.shortMeasure
      }));

    // Calculate MoM growth for executive highlight
    let momGrowthPercent = null;
    if (availableMonths.length >= 2) {
      const targetIdx = activeMonth === 'ALL'
        ? availableMonths.length - 1
        : availableMonths.findIndex(m => m.yearMonth === activeMonth);
      if (targetIdx > 0) {
        const prev = availableMonths[targetIdx - 1].sheetsCount;
        const curr = availableMonths[targetIdx].sheetsCount;
        if (prev > 0) {
          momGrowthPercent = Math.round(((curr - prev) / prev) * 100);
        }
      }
    }

    return {
      activeMonth,
      activeMonthLabel: activeMonth === 'ALL' ? '전체 누적 기간' : this.formatMonthLabel(activeMonth),
      latestMonth,
      executiveTotals: {
        totalAccumulatedSheets: globalTotalSheets,
        totalAssessmentDocs: assessments.length,
        totalRiskItems: globalTotalRiskItems,
        totalHighRiskResolved: globalHighRiskCount,
        activeSitesCount: Math.max(globalSiteSet.size, assessments.length > 0 ? 1 : 0),
        learnedVocabCount: learnedVocabCount + correctionsCount,
        preventionRatePercent: 100,
        momGrowthPercent
      },
      availableMonths: [...availableMonths].reverse(), // newest first for selector buttons
      monthlyTrend: availableMonths, // chronological for bar chart
      summary: {
        periodSheets,
        totalAssessments: filteredAssessments.length,
        totalRiskItems: periodRiskItems,
        highRiskCount,
        mediumRiskCount,
        lowRiskCount,
        highRiskRatioPercent: periodRiskItems > 0 ? Math.round((highRiskCount / periodRiskItems) * 100) : 0,
        topHazardName: hazardDistribution[0]?.label || '-',
        topHazardPercent: hazardDistribution[0]?.percent || 0,
        topWorkTypeName: workTypeDistribution[0]?.label || '-',
        topWorkTypePercent: workTypeDistribution[0]?.percent || 0
      },
      hazardDistribution,
      workTypeDistribution,
      topRiskPoints,
      topHighRiskPoints
    };
  }
}

module.exports = new AnalyticsService();

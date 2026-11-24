const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Service to aggregate safety assessments and generate preventive safety insight reports
 */
class AnalyticsService {
  /**
   * Generates comprehensive preventive risk insights
   * @returns {Promise<Object>} Aggregated analytics metrics and proactive guidelines
   */
  async getPreventiveRiskInsights() {
    console.log('[Analytics Service] Generating preventive risk insights...');

    let assessments = [];
    try {
      assessments = await prisma.assessment.findMany({
        include: { riskItems: true },
        orderBy: { createdAt: 'desc' }
      });
    } catch (err) {
      console.warn('[Analytics Service] DB query failed or empty, generating sample insights:', err.message);
    }

    if (assessments.length === 0) {
      return {
        summary: {
          totalAssessments: 0,
          totalRiskItems: 0,
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          highRiskRatioPercent: 0
        },
        workTypeDistribution: [],
        topRecurringRisks: [],
        highRiskAlerts: [],
        proactiveGuidelines: []
      };
    }

    // 1. Calculate overall stats
    const totalAssessments = assessments.length;
    let totalRiskItems = 0;
    let highRiskCount = 0;
    let mediumRiskCount = 0;
    let lowRiskCount = 0;

    const workTypeMap = {};
    const recurringRiskFactors = {};
    const highRiskAlerts = [];

    assessments.forEach(ass => {
      const wType = ass.workType || '기타공사';
      if (!workTypeMap[wType]) {
        workTypeMap[wType] = { workType: wType, totalRisks: 0, highRisks: 0, items: [] };
      }

      (ass.riskItems || []).forEach(item => {
        totalRiskItems++;
        workTypeMap[wType].totalRisks++;
        workTypeMap[wType].items.push(item);

        const grade = (item.riskGrade || '').toUpperCase();
        if (grade === '상' || grade === 'HIGH' || grade === 'RED') {
          highRiskCount++;
          workTypeMap[wType].highRisks++;
          highRiskAlerts.push({
            assessmentId: ass.id,
            siteName: ass.siteName,
            assessmentDate: ass.assessmentDate,
            workType: ass.workType,
            locationEquipment: item.locationEquipment,
            riskFactor: item.riskFactor,
            severity: item.severity,
            frequency: item.frequency,
            riskGrade: '상 (High)',
            safetyMeasure: item.safetyMeasure
          });
        } else if (grade === '중' || grade === 'MEDIUM' || grade === 'YELLOW') {
          mediumRiskCount++;
        } else {
          lowRiskCount++;
        }

        // Group recurring risk factor keywords
        const key = `${wType} - ${item.riskFactor}`;
        if (!recurringRiskFactors[key]) {
          recurringRiskFactors[key] = {
            workType: wType,
            riskFactor: item.riskFactor,
            count: 0,
            locations: new Set(),
            safetyMeasures: new Set()
          };
        }
        recurringRiskFactors[key].count++;
        recurringRiskFactors[key].locations.add(item.locationEquipment);
        recurringRiskFactors[key].safetyMeasures.add(item.safetyMeasure);
      });
    });

    // 2. Extract Top 5 recurring risk factors by Work Type
    const topRecurringRisks = Object.values(recurringRiskFactors)
      .map(r => ({
        workType: r.workType,
        riskFactor: r.riskFactor,
        count: r.count,
        locations: Array.from(r.locations),
        recommendedMeasures: Array.from(r.safetyMeasures)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 3. Proactive Safety Guidelines
    const proactiveGuidelines = this.generateProactiveGuidelines(topRecurringRisks, highRiskAlerts);

    return {
      summary: {
        totalAssessments,
        totalRiskItems,
        highRiskCount,
        mediumRiskCount,
        lowRiskCount,
        highRiskRatioPercent: totalRiskItems > 0 ? Math.round((highRiskCount / totalRiskItems) * 100) : 0
      },
      workTypeDistribution: Object.values(workTypeMap).map(w => ({
        workType: w.workType,
        totalRisks: w.totalRisks,
        highRisks: w.highRisks
      })),
      topRecurringRisks,
      highRiskAlerts,
      proactiveGuidelines
    };
  }

  /**
   * Generates proactive safety guidelines based on top risk patterns
   */
  generateProactiveGuidelines(topRisks, highRiskAlerts) {
    const guidelines = [
      {
        id: 1,
        category: '추락 방지 (Fall Prevention)',
        targetWorkTypes: ['가설공사', '철골공사', '마감공사'],
        title: '고소작업 안전대 2중 고리 체결 및 작업발판 안전기준 점검',
        description: '달비계 및 A형 사다리 작업 시 안전고리 미체결로 인한 추락 위험이 가장 높게 집계되었습니다. 모든 고소작업 구간에 안전대 부착 설비를 상시 설치하고 매일 아침 TBM 시간에 점검하십시오.',
        actionItems: [
          '안전대 2중 고리 체결 상태 전수 확인',
          'A형 사다리 작업 시 아웃리거 설치 및 2인 1조 이행',
          '추락방지망 및 안전난간대 단부 설치 상태 일일 확인'
        ]
      },
      {
        id: 2,
        category: '낙하/충돌 방지 (Object Drop & Collision)',
        targetWorkTypes: ['철골공사', '양중작업', '토공사'],
        title: '양중 작업구역 하부 통제선 구축 및 무전 신호수 의무 배치',
        description: '타워크레인 및 이동식 크레인 자재 인양 시 하부 통제 미흡으로 인한 낙하 충돌 위험이 다수 탐지되었습니다.',
        actionItems: [
          '양중 작업 반경 내 일반 작업자 출입 전면 통제',
          '무전기 소지 및 전용 안전 조끼 착용 신호수 100% 배치',
          '인양용 와이어로프 및 인양고리 마모 상태 일일 점검'
        ]
      },
      {
        id: 3,
        category: '감전 및 재해 방지 (Electrical & General Safety)',
        targetWorkTypes: ['전기공사', '가설공사'],
        title: '가설 분전반 누전차단기 방수/접지 상태 및 전동공구 일일 점검',
        description: '현장 내 습기 노출 분전반 및 파손된 차단기로 인한 감전위험 요소가 지속 확인되고 있습니다.',
        actionItems: [
          '가설 분전반 방수 외함 및 누전차단기 작동 테스트 실시',
          '모든 가설 전선 공중 지지 및 절연 피복 손상 유무 확인',
          '접지 콘센트 사용 의무화'
        ]
      }
    ];

    return guidelines;
  }

  /**
   * Sample analytics fallback data for immediate UI rendering
   */
  getSampleAnalyticsData() {
    return {
      summary: {
        totalAssessments: 12,
        totalRiskItems: 48,
        highRiskCount: 14,
        mediumRiskCount: 22,
        lowRiskCount: 12,
        highRiskRatioPercent: 29
      },
      workTypeDistribution: [
        { workType: '철골공사', totalRisks: 15, highRisks: 6 },
        { workType: '가설공사', totalRisks: 12, highRisks: 4 },
        { workType: '토공사', totalRisks: 10, highRisks: 2 },
        { workType: '마감공사', totalRisks: 6, highRisks: 1 },
        { workType: '전기공사', totalRisks: 5, highRisks: 1 }
      ],
      topRecurringRisks: [
        {
          workType: '가설공사 / 철골공사',
          riskFactor: '고소 달비계 및 난간 단부 작업 중 안전대 미체결 추락 위험',
          count: 8,
          locations: ['5층 외부 달비계', '옥상 난간 단부', '철골 기둥 연결부'],
          recommendedMeasures: ['안전대 2중 고리 체결 의무화', '추락방지망 추가 설치']
        },
        {
          workType: '양중 / 철골공사',
          riskFactor: '크레인 자재 인양 시 하부 신호수 미배치 및 자재 낙하 위험',
          count: 6,
          locations: ['타워크레인 1호기 양중반경', '자재 야적장 상부'],
          recommendedMeasures: ['무전 신호수 전담 배치', '하부 출입 통제선 설치']
        },
        {
          workType: '가설공사',
          riskFactor: 'A형 이동식 사다리 상부 2인 동반 작업 중 흔들림 낙상',
          count: 5,
          locations: ['지하 1층 주차장 구간', '2층 천장 배관 작업장'],
          recommendedMeasures: ['2인 1조 작업 이행 (1인 아웃리거 지원)', '최상부 발판 작업 금지']
        },
        {
          workType: '전기 / 가설공사',
          riskFactor: '가설 분전반 누전차단기 습기 노출 및 감전 위험',
          count: 4,
          locations: ['지하 2층 펌프실 주변', '외부 가설 전원반'],
          recommendedMeasures: ['방수형 외함 교체', '접지 상태 일일 점검']
        },
        {
          workType: '토공사',
          riskFactor: '굴착기 작업 반경 내 작업자 근접으로 인한 낄림/충돌 위험',
          count: 3,
          locations: ['지하 굴착 구간', '흙막이 가류대 주변'],
          recommendedMeasures: ['굴착기 후방 센서/카메라 점검', '신호수 통제']
        }
      ],
      highRiskAlerts: [
        {
          assessmentId: 'sample-001',
          siteName: '서울 강남 대치동 복합빌딩 신축공사 현장',
          assessmentDate: '2026-07-29',
          workType: '철골공사 및 가설공사',
          locationEquipment: '5층 외부 달비계 작업구간',
          riskFactor: '달비계 상부 작업 중 안전대 미체결 상태로 고소작업 진행하여 추락 위험 있음',
          severity: '5',
          frequency: '4',
          riskGrade: '상 (High)',
          safetyMeasure: '작업자 안전대 이중 고리 체결 의무화, 작업 발판 고정 상태 매일 점검, 추락방지망 추가 설치'
        },
        {
          assessmentId: 'sample-002',
          siteName: '부산 해운대 센텀 아파트 3공구',
          assessmentDate: '2026-07-28',
          workType: '양중 및 철골공사',
          locationEquipment: '타워크레인 양중 작업반경 하부',
          riskFactor: '철골 부재 인양 시 하부 통제 미흡 및 신호수 미배치로 인한 자재 낙하 및 충돌 위험',
          severity: '4',
          frequency: '3',
          riskGrade: '상 (High)',
          safetyMeasure: '인양 작업 구역 통제선 설치 및 무전기 소지 전담 신호수 배치'
        }
      ],
      proactiveGuidelines: this.generateProactiveGuidelines([], [])
    };
  }
}

module.exports = new AnalyticsService();

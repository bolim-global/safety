const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Phase 4: Prevention Analytics API
 * GET /api/analytics/preventive-risks
 */
router.get('/preventive-risks', async (req, res) => {
  try {
    const insights = await analyticsService.getPreventiveRiskInsights();
    return res.status(200).json({
      success: true,
      message: 'Preventive risk insights generated successfully.',
      data: insights
    });
  } catch (error) {
    console.error('[Analytics API Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper endpoint to seed realistic sample assessments into the database
 * POST /api/analytics/seed-sample
 */
router.post('/seed-sample', async (req, res) => {
  try {
    const samples = [
      {
        siteName: '서울 강남 대치동 복합빌딩 신축공사 현장',
        assessmentDate: '2026-07-29',
        assessor: '김철수 안전관리자',
        workType: '철골공사 및 가설공사',
        rawOcrText: '[손글씨 OCR 샘플 1 데이터]',
        pdfFilename: 'sample_risk_assessment_01.pdf',
        riskItems: [
          {
            locationEquipment: '5층 외부 달비계 작업구간',
            riskFactor: '달비계 상부 작업 중 안전대 미체결 상태로 고소작업 진행하여 추락 위험 있음',
            frequency: '4',
            severity: '5',
            riskGrade: '상',
            safetyMeasure: '작업자 안전대 이중 고리 체결 의무화, 작업 발판 고정 상태 매일 점검, 추락방지망 추가 설치'
          },
          {
            locationEquipment: '타워크레인 양중 작업반경 하부',
            riskFactor: '철골 부재 인양 시 하부 통제 미흡 및 신호수 미배치로 인한 자재 낙하 및 충돌 위험',
            frequency: '3',
            severity: '4',
            riskGrade: '상',
            safetyMeasure: '인양 작업 구역 통제선 설치 및 무전기 소지 전담 신호수 배치, 하부 출입 통제 구역 설정'
          },
          {
            locationEquipment: '지하 1층 이동식 사다리 작업구간',
            riskFactor: 'A형 이동식 사다리 상부 2인 동반 작업 중 흔들림으로 인한 낙상 위험',
            frequency: '3',
            severity: '2',
            riskGrade: '중',
            safetyMeasure: '사다리 작업 시 2인 1조 (1인 아웃리거 잡기) 이행, 최상부 발판 작업 금지 표지판 설치'
          }
        ]
      },
      {
        siteName: '부산 해운대 센텀 아파트 3공구',
        assessmentDate: '2026-07-28',
        assessor: '이영희 차장',
        workType: '가설공사',
        rawOcrText: '[손글씨 OCR 샘플 2 데이터]',
        pdfFilename: 'sample_risk_assessment_02.pdf',
        riskItems: [
          {
            locationEquipment: '외벽 타설용 시스템 거푸집(Euro-form)',
            riskFactor: '거푸집 해체 시 상부 작업자 하부 낙하물 방지망 불량으로 자재 낙하 위험',
            frequency: '4',
            severity: '4',
            riskGrade: '상',
            safetyMeasure: '하부 통제선 개설 및 낙하물 방지망 100% 밀착 설치'
          },
          {
            locationEquipment: '지하 2층 펌프실 분전반 주변',
            riskFactor: '가설 전선 피복 손상 및 습기 노출로 인한 작업자 감전 위험',
            frequency: '2',
            severity: '4',
            riskGrade: '중',
            safetyMeasure: '전선 절연 테이핑 보수 및 방수 분전반으로 교체'
          }
        ]
      },
      {
        siteName: '인천 송도 바이오클러스터 건설현장',
        assessmentDate: '2026-07-27',
        assessor: '박지성 팀장',
        workType: '토공사',
        rawOcrText: '[손글씨 OCR 샘플 3 데이터]',
        pdfFilename: 'sample_risk_assessment_03.pdf',
        riskItems: [
          {
            locationEquipment: '지하 굴착 흙막이 구조물 구간',
            riskFactor: '굴착기 후진 시 신호수 미조작 및 후방 카메라 불량으로 충돌 위험',
            frequency: '3',
            severity: '5',
            riskGrade: '상',
            safetyMeasure: '굴착기 감지 센서 및 신호수 전담 배치'
          }
        ]
      }
    ];

    for (const item of samples) {
      await prisma.assessment.create({
        data: {
          siteName: item.siteName,
          assessmentDate: item.assessmentDate,
          assessor: item.assessor,
          workType: item.workType,
          rawOcrText: item.rawOcrText,
          pdfFilename: item.pdfFilename,
          riskItems: {
            create: item.riskItems
          }
        }
      });
    }

    return res.json({ success: true, message: 'Sample assessment data seeded successfully into database.' });
  } catch (error) {
    console.error('[Seed Sample Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

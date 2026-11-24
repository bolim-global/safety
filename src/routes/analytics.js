const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Phase 4: Executive Prevention Analytics API (supports ?month=ALL | LATEST | YYYY-MM)
 * GET /api/analytics/preventive-risks
 */
router.get('/preventive-risks', async (req, res) => {
  try {
    const selectedMonth = req.query.month || 'ALL';
    const insights = await analyticsService.getPreventiveRiskInsights(selectedMonth);
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
 * Seed realistic multi-month construction safety assessments for executive demonstration
 * POST /api/analytics/seed-sample
 */
router.post('/seed-sample', async (req, res) => {
  try {
    const monthlyBatches = [
      {
        siteName: '평촌 자이 퍼스티니 1단지 공사현장',
        assessmentDate: '2026년 08월 14일',
        assessor: '이철호 안전팀장',
        workType: '갱폼·알폼공사',
        items: [
          { loc: '101동~103동 상부층', factor: '[누가?] 갱폼팀 12명\n[무슨작업?] 갱폼 인상 및 고정볼트 체결\n[왜 위험?] 상부 작업 중 안전고리 미체결로 인한 추락 위험 및 발판 잔재물 낙하 위험', grade: '상', measure: '[작성자의견] 갱폼 인상 전 상부 발판 청소 및 안전대 2중 고리 체결 확인' },
          { loc: '104동 기준층', factor: '[누가?] 알폼팀 15명\n[무슨작업?] 알폼 해체 및 상부 인양\n[왜 위험?] 해체 구간 개구부 추락 위험 및 자재 낙하 타격 위험', grade: '상', measure: '[작성자의견] A형 안전간판 설치 및 상하부 2인 1조 신호 작업' },
          { loc: '102동 슬래브', factor: '[누가?] 철근팀 10명\n[무슨작업?] 슬래브 철근 배근\n[왜 위험?] 데크플레이트 단차 구간 이동 중 걸려 넘어짐 전도 위험', grade: '중', measure: '[작성자의견] 합판 보행통로 개설 및 단차 주의 표지 설치' },
          { loc: '지하 1층 주차장', factor: '[누가?] 전기팀 4명\n[무슨작업?] 가설 분전반 점검 및 전선 연장\n[왜 위험?] 우천 후 바닥 습기 및 전선 피복 손상으로 감전 위험', grade: '중', measure: '[작성자의견] 누전차단기 작동 점검 및 전선 공중 거치대 설치' }
        ]
      },
      {
        siteName: '인천 검단아테라자이 신축현장',
        assessmentDate: '2026년 08월 25일',
        assessor: '김지한 안전과장',
        workType: '콘크리트·타설공사',
        items: [
          { loc: '201동 옥탑층', factor: '[누가?] 타설팀 8명\n[무슨작업?] 타워크레인 호퍼 콘크리트 타설\n[왜 위험?] 호퍼 양중 반경 하부 통제 미흡으로 인한 낙하·충돌 위험', grade: '상', measure: '[작성자의견] 하부 출입통제선 설치 및 무전 신호수 전담 배치' },
          { loc: '203동 세대 내부', factor: '[누가?] 견출팀 6명\n[무슨작업?] 이동식 우마를 이용한 벽체 견출 및 할석\n[왜 위험?] 우마 끝단 디딤 작업으로 인한 전도 위험', grade: '중', measure: '[작성자의견] 안전 인증 우마 사용 및 끝단 작업 금지 교육' },
          { loc: '외곽 토공 구간', factor: '[누가?] 토공 장비팀\n[무슨작업?] 굴착기 되메우기 및 자재 운반\n[왜 위험?] 장비 후진 시 작업 반경 내 근로자 충돌·협착 위험', grade: '상', measure: '[작성자의견] 후방 카메라 점검 및 장비 유도 신호수 상시 배치' }
        ]
      },
      {
        siteName: '평택역 센트럴시티 복합개발 현장',
        assessmentDate: '2026년 09월 11일',
        assessor: '박성훈 안전차장',
        workType: '철골·양중공사',
        items: [
          { loc: '상가동 철골구간', factor: '[누가?] 철골팀 10명\n[무슨작업?] H빔 철골 기둥 볼트 본조임 고소작업\n[왜 위험?] 고소 달비계 및 철골 상부 안전대 미체결 추락 위험', grade: '상', measure: '[작성자의견] 생명줄 선설치 및 추락방지망 전 구간 밀착 설치' },
          { loc: '타워크레인 2호기 반경', factor: '[누가?] 양중팀 5명\n[무슨작업?] 데크플레이트 번들 인양\n[왜 위험?] 슬링벨트 마모 및 신호 미숙으로 인한 자재 낙하 위험', grade: '상', measure: '[작성자의견] 인양 전 슬링벨트 점검 및 전담 신호수 무전 교신' },
          { loc: '지하 2층 기계실', factor: '[누가?] 설비팀 7명\n[무슨작업?] A형 사다리 상부 배관 행거 설치\n[왜 위험?] 사다리 단독 작업 중 흔들림으로 인한 전도·추락 위험', grade: '중', measure: '[작성자의견] 아웃리거 펼침 고정 및 2인 1조 잡아주기 의무화' },
          { loc: '105동 외벽', factor: '[누가?] 단열·창호팀 9명\n[무슨작업?] 외벽 단열재 부착 및 창호 프레임 운반\n[왜 위험?] 통로 적치물에 발이 걸려 넘어짐 전도 위험', grade: '하', measure: '[작성자의견] 자재 운반 통로 청결 유지 및 2인 1조 운반' },
          { loc: '101동 엘리베이터 홀', factor: '[누가?] 가설팀 4명\n[무슨작업?] 승강기 피트 개구부 안전난간 보수\n[왜 위험?] 개구부 덮개 해체 중 추락 위험', grade: '상', measure: '[작성자의견] 안전대 고리 선체결 후 개구부 안전난간 즉시 보강' }
        ]
      },
      {
        siteName: '평촌 자이 퍼스티니 1단지 공사현장',
        assessmentDate: '2026년 09월 24일',
        assessor: '이대영 현장소장',
        workType: '형틀·거푸집공사',
        items: [
          { loc: '101동~105동 옥탑', factor: '[누가?] 형틀팀 14명\n[무슨작업?] 옥탑 파라펫 시스템비계 및 거푸집 설치\n[왜 위험?] 비계 이동 중 안전고리 미체결 추락 위험', grade: '상', measure: '[작성자의견] 비계 상부 생명줄 설치 및 안전고리 체결 상시 감시' },
          { loc: '103동 기준층', factor: '[누가?] 철근팀 11명\n[무슨작업?] 벽체 및 슬래브 철근 결속\n[왜 위험?] 우마 위 철근 조립 중 중심 상실 전도 위험', grade: '중', measure: '[작성자의견] 우마 수평 고정 및 발판 중앙 작업 수칙 준수' },
          { loc: '전 동 외부 하부', factor: '[누가?] 직영 정리팀\n[무슨작업?] 갱폼 하부 잔재물 청소 및 할석 정리\n[왜 위험?] 상부 골조 작업 중 콘크리트 파편 낙하 위험', grade: '중', measure: '[작성자의견] 낙하물 방지망 점검 및 상하부 동시 작업 금지' }
        ]
      },
      {
        siteName: '평촌 자이 퍼스티니 1단지 공사현장',
        assessmentDate: '2026년 10월 08일',
        assessor: '김지한 안전관리자',
        workType: '갱폼·알폼공사',
        items: [
          { loc: '101동~104동 상부', factor: '[누가?] 갱폼팀 심범현 외 8명\n[무슨작업?] 갱폼 타워크레인 인양 및 볼트 해체\n[왜 위험?] 볼트 선해체 또는 안전고리 미체결 시 중대 추락 위험', grade: '상', measure: '[작성자의견] 인양 와이어 선체결 확인 후 볼트 해체 및 안전대 체결 철저' },
          { loc: '102동 세대 내부', factor: '[누가?] 할석·미장팀 김교리 외 5명\n[무슨작업?] 세대 내부 면갈이·먹잡기 및 할석 파쇄\n[왜 위험?] 우마 이동 중 전도 및 파쇄 분진·파편 비래 위험', grade: '중', measure: '[작성자의견] 보안경·방진마스크·안전모 착용 및 우마 안전발판 사용' },
          { loc: '105동 슬래브', factor: '[누가?] 철근팀 김민수 외 12명\n[무슨작업?] 데크플레이트 상부 철근 배근 및 인양 자재 정리\n[왜 위험?] 양중 자재 하부 통제 미흡 낙하 위험 및 데크 전도 위험', grade: '상', measure: '[작성자의견] 양중 시 신호수 통제 및 데크 보행통로 합판 설치' },
          { loc: '101동 코어 타설구간', factor: '[누가?] 타설팀 이강운 외 7명\n[무슨작업?] 펌프카 및 호퍼 콘크리트 타설\n[왜 위험?] 타설 호스 요동으로 인한 작업자 충돌·전도 위험', grade: '상', measure: '[작성자의견] 호스 선단 2인 1조 제어 및 단부 안전난간 확인' },
          { loc: '지하 1층 전기실', factor: '[누가?] 전기팀 5명\n[무슨작업?] 임시 가설전선 정리 및 투광등 설치\n[왜 위험?] 피복 손상 전선 접촉 감전 위험', grade: '중', measure: '[작성자의견] 절연 피복 상태 점검 및 전용 전선 거치대 사용' },
          { loc: '단지 내 지상 도로', factor: '[누가?] 지게차 및 자재팀\n[무슨작업?] 지게차 팔레트 자재 하역 및 운반\n[왜 위험?] 사각지대 보행 근로자 충돌 위험', grade: '중', measure: '[작성자의견] 지게차 유도 신호수 배치 및 제한속도 10km/h 준수' }
        ]
      },
      {
        siteName: '인천 검단아테라자이 신축현장',
        assessmentDate: '2026년 10월 22일',
        assessor: '손재현 안전과장',
        workType: '외벽·견출·마감공사',
        items: [
          { loc: '202동 외벽 고소구간', factor: '[누가?] 외벽 견출팀 6명\n[무슨작업?] 달비계 외벽 견출 및 균열 보수\n[왜 위험?] 달비계 수직구명줄 및 안전대 미체결 시 추락 위험', grade: '상', measure: '[작성자의견] 작업 전 로프 마모 점검, 수직구명줄 별도 고정 및 안전대 체결' },
          { loc: '204동 실내 마감구간', factor: '[누가?] 타일·내장팀 10명\n[무슨작업?] 우마 발판 상부 벽타일 시공\n[왜 위험?] 우마 발판 전도 및 타일 절단기 끼임 위험', grade: '중', measure: '[작성자의견] 절단기 방호커버 장착 및 우마 안전수칙 준수' },
          { loc: '201동 옥상 단부', factor: '[누가?] 방수·난간팀 5명\n[무슨작업?] 옥상 파라펫 안전난간 및 방수 시공\n[왜 위험?] 단부 난간 해체 구간 작업자 추락 위험', grade: '상', measure: '[작성자의견] 임시 안전난간대 선설치 및 안전대 고리 체결 의무화' },
          { loc: '자재 야적장', factor: '[누가?] 이동식 크레인팀\n[무슨작업?] 마감 자재 양중 반입\n[왜 위험?] 크레인 아웃리거 지반 침하 전복 및 자재 낙하 위험', grade: '상', measure: '[작성자의견] 아웃리거 철판 받침 설치 및 양중 구역 출입 통제' }
        ]
      },
      {
        siteName: '평촌 자이 퍼스티니 1단지 공사현장',
        assessmentDate: '2026년 11월 06일',
        assessor: '김지한 안전관리자',
        workType: '갱폼·알폼공사',
        items: [
          { loc: '101동~105동 상부층', factor: '[누가?] 갱폼팀 10명\n[무슨작업?] 동절기 대비 갱폼 방풍천막 점검 및 갱폼 인상\n[왜 위험?] 강풍 시 갱폼 흔들림 및 상부 작업자 안전고리 미체결 추락 위험', grade: '상', measure: '[작성자의견] 풍속 10m/s 이상 시 인상 즉시 중지 및 안전대 2중 고리 체결' },
          { loc: '103동 기준층', factor: '[누가?] 알폼 해체팀 12명\n[무슨작업?] 슬래브 및 벽체 알폼 해체 반출\n[왜 위험?] 해체 중 알폼 판넬 낙하 타격 및 개구부 추락 위험', grade: '상', measure: '[작성자의견] 해체 구역 하부 통제선 설치 및 개구부 덮개 즉시 고정' },
          { loc: '102동~104동 세대', factor: '[누가?] 내장·단열팀 14명\n[무슨작업?] 이동식 우마 및 사다리 활용 천장 단열재 시공\n[왜 위험?] 우마 끝단 작업 및 사다리 단독 작업으로 인한 전도 위험', grade: '중', measure: '[작성자의견] 안전 발판 규격품 사용 및 2인 1조 사다리 작업 철저' },
          { loc: '105동 옥탑층', factor: '[누가?] 철근·형틀팀 9명\n[무슨작업?] 옥탑 구조물 데크플레이트 및 철근 배근\n[왜 위험?] 데크 단부 추락 및 철근 걸림 전도 위험', grade: '상', measure: '[작성자의견] 단부 안전난간·추락방지망 설치 및 전용 보행통로 확보' },
          { loc: '타워크레인 1·2호기', factor: '[누가?] 양중 신호팀 4명\n[무슨작업?] 철근 및 거푸집 자재 상부 인양\n[왜 위험?] 양중 반경 내 근로자 통행으로 인한 낙하물 맞음 위험', grade: '상', measure: '[작성자의견] 양중 구역 사이렌 경보 및 전담 신호수 하부 통제' }
        ]
      },
      {
        siteName: '평택역 센트럴시티 복합개발 현장',
        assessmentDate: '2026년 11월 18일',
        assessor: '박성훈 안전차장',
        workType: '전기·설비공사',
        items: [
          { loc: '지하 1~2층 주차장', factor: '[누가?] 전기·소방팀 8명\n[무슨작업?] 고소작업대 및 우마 이용 트레이·배관 설치\n[왜 위험?] 고소작업 중 안전대 미체결 추락 및 협착 위험', grade: '상', measure: '[작성자의견] 과상승 방지봉 점검 및 안전고리 체결 확인 후 상승' },
          { loc: '가설 전기 분전반 전 구간', factor: '[누가?] 전기 안전팀 4명\n[무슨작업?] 동절기 열선 및 임시 분전반 과부하 점검\n[왜 위험?] 문어발식 콘센트 연결 및 피복 손상으로 감전·화재 위험', grade: '중', measure: '[작성자의견] 정격 용량 준수, 접지형 방수 콘센트 사용 및 소화기 비치' },
          { loc: '외부 부대토목 구간', factor: '[누가?] 부대토목 장비팀 6명\n[무슨작업?] 굴착기 우수관로 터파기 및 자재 안치\n[왜 위험?] 굴착 단부 붕괴 및 굴착기 선회 반경 충돌 위험', grade: '상', measure: '[작성자의견] 굴착 사면 구배 준수 및 장비 유도 신호수 상시 배치' },
          { loc: '상가동 외벽', factor: '[누가?] 외벽 석재·마감팀 7명\n[무슨작업?] 시스템비계 상부 외벽 마감재 시공\n[왜 위험?] 비계 발판 틈새 공구 낙하 및 안전고리 미체결 추락 위험', grade: '상', measure: '[작성자의견] 공구 달줄 체결, 하부 낙하물 방지망 점검 및 안전대 착용' }
        ]
      }
    ];

    let createdSheets = 0;
    for (const batch of monthlyBatches) {
      createdSheets += batch.items.length;
      await prisma.assessment.create({
        data: {
          siteName: batch.siteName,
          assessmentDate: batch.assessmentDate,
          assessor: batch.assessor,
          workType: batch.workType,
          status: 'VERIFIED',
          rawOcrText: '[임원 보고용 전사 안전위험성평가 축적 데이터]',
          pdfFilename: 'executive_safety_archive.pdf',
          riskItems: {
            create: batch.items.map(it => ({
              locationEquipment: it.loc,
              riskFactor: it.factor,
              frequency: it.grade,
              severity: it.grade,
              riskGrade: it.grade,
              safetyMeasure: it.measure
            }))
          }
        }
      });
    }

    return res.json({
      success: true,
      message: `월별 위험성평가 데이터 ${createdSheets}장이 추가 축적되었습니다.`
    });
  } catch (error) {
    console.error('[Seed Sample Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

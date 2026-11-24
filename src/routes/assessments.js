const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const glossaryService = require('../services/glossaryService');

/**
 * GET /api/assessments
 * List all saved safety risk assessments
 */
router.get('/', async (req, res) => {
  try {
    const assessments = await prisma.assessment.findMany({
      include: { riskItems: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: assessments });
  } catch (error) {
    console.error('[Get Assessments Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/assessments/:id
 * Retrieve a specific assessment by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      include: { riskItems: true }
    });

    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment record not found.' });
    }

    return res.json({ success: true, data: assessment });
  } catch (error) {
    console.error('[Get Assessment Detail Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/assessments
 * Save a newly verified / edited risk assessment with items into Prisma DB
 */
router.post('/', async (req, res) => {
  try {
    const { siteMetadata, riskItems, rawOcrText, pdfFilename } = req.body;

    if (!siteMetadata || !riskItems) {
      return res.status(400).json({ success: false, error: 'Missing siteMetadata or riskItems.' });
    }

    const createdAssessment = await prisma.assessment.create({
      data: {
        siteName: siteMetadata.siteName || '미지정 현장',
        assessmentDate: siteMetadata.assessmentDate || new Date().toISOString().split('T')[0],
        assessor: siteMetadata.assessor || (riskItems && riskItems[0] && riskItems[0].author) || '미지정 작성자',
        workType: siteMetadata.workType || (riskItems && riskItems[0] && riskItems[0].workType) || '건설공종',
        rawOcrText: rawOcrText || '',
        pdfFilename: pdfFilename || '',
        status: 'VERIFIED',
        riskItems: {
          create: (riskItems || []).map(item => ({
            locationEquipment: item.locationEquipment || '일반구간',
            riskFactor: item.riskFactor || '위험요인 미기재',
            frequency: String(item.frequency || item.riskAssessmentCheck || '중'),
            severity: String(item.severity || item.riskAssessmentCheck || '중'),
            riskGrade: item.riskGrade || '중',
            safetyMeasure: item.safetyMeasure || item.authorOpinion || item.meetingResult || '안전 수칙 준수'
          }))
        }
      },
      include: { riskItems: true }
    });

    // Auto-learn user's corrected terms and specific correction rules
    try {
      glossaryService.learnFromUserSavedAssessment(riskItems);
      if (Array.isArray(req.body.corrections)) {
        for (const c of req.body.corrections) {
          if (c.rawSnippet && c.correctedSnippet) {
            await glossaryService.recordUserCorrection(c.rawSnippet, c.correctedSnippet, c.category);
          }
        }
      }
    } catch (learnErr) {
      console.warn('[Glossary Auto-Learn Warning]', learnErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Safety risk assessment successfully saved to database and user knowledge base updated.',
      data: createdAssessment
    });

  } catch (error) {
    console.error('[Save Assessment Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/assessments/single-item
 * Save a single risk assessment item individually as an independent DB record
 */
router.post('/single-item', async (req, res) => {
  try {
    const { siteMetadata, riskItem, rawOcrText, pdfFilename, corrections } = req.body;

    if (!riskItem) {
      return res.status(400).json({ success: false, error: 'Missing riskItem data.' });
    }

    const itemWorkType = riskItem.workType || siteMetadata?.workType || '건설공종';
    const itemAuthor = riskItem.author || siteMetadata?.assessor || '미지정 작성자';
    const itemSiteName = siteMetadata?.siteName || '위험성평가 현장';
    const itemDate = siteMetadata?.assessmentDate || new Date().toISOString().split('T')[0];

    const createdAssessment = await prisma.assessment.create({
      data: {
        siteName: itemSiteName,
        assessmentDate: itemDate,
        assessor: itemAuthor,
        workType: itemWorkType,
        rawOcrText: rawOcrText || '',
        pdfFilename: pdfFilename || '',
        status: 'VERIFIED',
        riskItems: {
          create: [{
            locationEquipment: riskItem.locationEquipment || '현장 작업구간',
            riskFactor: riskItem.riskFactor || '위험요인 미기재',
            frequency: String(riskItem.frequency || '중'),
            severity: String(riskItem.severity || '중'),
            riskGrade: riskItem.riskGrade || '중',
            safetyMeasure: riskItem.safetyMeasure || riskItem.authorOpinion || riskItem.meetingResult || '안전 수칙 준수'
          }]
        }
      },
      include: { riskItems: true }
    });

    // Auto-learn this individual item into Knowledge Base / Glossary Memory
    try {
      glossaryService.learnFromUserSavedAssessment([riskItem], siteMetadata, pdfFilename);
      if (Array.isArray(corrections)) {
        for (const c of corrections) {
          if (c.rawSnippet && c.correctedSnippet) {
            await glossaryService.recordUserCorrection(c.rawSnippet, c.correctedSnippet, c.category);
          }
        }
      }
    } catch (err) {
      console.warn('[Glossary Single-Item Auto-Learn Warning]', err.message);
    }

    return res.status(201).json({
      success: true,
      message: `[${itemWorkType} - ${itemAuthor}] 해당 위험성평가가 개별 DB로 성공적으로 저장되었습니다.`,
      data: createdAssessment
    });

  } catch (error) {
    console.error('[Save Single Item Assessment Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/assessments/:id
 * Update an existing assessment and its risk items
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { siteMetadata, riskItems } = req.body;

    // Delete existing risk items and recreate updated set
    await prisma.riskItem.deleteMany({ where: { assessmentId: id } });

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        siteName: siteMetadata.siteName,
        assessmentDate: siteMetadata.assessmentDate,
        assessor: siteMetadata.assessor,
        workType: siteMetadata.workType,
        riskItems: {
          create: (riskItems || []).map(item => ({
            locationEquipment: item.locationEquipment,
            riskFactor: item.riskFactor,
            frequency: String(item.frequency),
            severity: String(item.severity),
            riskGrade: item.riskGrade,
            safetyMeasure: item.safetyMeasure
          }))
        }
      },
      include: { riskItems: true }
    });

    return res.json({ success: true, message: 'Assessment updated successfully.', data: updated });
  } catch (error) {
    console.error('[Update Assessment Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/assessments/reset
 * Clear all assessments and risk items from database
 */
router.post('/reset', async (req, res) => {
  try {
    await prisma.riskItem.deleteMany();
    await prisma.assessment.deleteMany();
    return res.json({ success: true, message: '평가 데이터베이스가 성공적으로 초기화되었습니다.' });
  } catch (error) {
    console.error('[Reset DB Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/assessments/:id
 * Remove assessment from database
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'all') {
      await prisma.riskItem.deleteMany();
      await prisma.assessment.deleteMany();
      return res.json({ success: true, message: '모든 평가 데이터베이스가 초기화되었습니다.' });
    }
    await prisma.assessment.delete({ where: { id } });
    return res.json({ success: true, message: 'Assessment deleted successfully.' });
  } catch (error) {
    console.error('[Delete Assessment Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

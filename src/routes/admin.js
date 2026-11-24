const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const glossaryService = require('../services/glossaryService');

/**
 * GET /api/admin/learning-summary
 * Fetch all AI learning records, user correction histories, and vocabulary database
 */
router.get('/learning-summary', async (req, res) => {
  try {
    const corrections = await prisma.ocrCorrection.findMany({
      orderBy: { count: 'desc' }
    });

    const learnedTerms = await glossaryService.getAccumulatedTerms();
    const userGlossary = glossaryService.userTerms ? Array.from(glossaryService.userTerms) : [];

    return res.json({
      success: true,
      data: {
        stats: {
          totalCorrections: corrections.length,
          totalVocabulary: learnedTerms.length,
          userAddedTermsCount: userGlossary.length
        },
        corrections,
        learnedTerms,
        userGlossary
      }
    });
  } catch (error) {
    console.error('[Admin Learning Summary Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/corrections
 * Manually register or add an AI OCR correction rule
 */
router.post('/corrections', async (req, res) => {
  try {
    const { rawSnippet, correctedSnippet, category } = req.body;

    if (!rawSnippet || !correctedSnippet) {
      return res.status(400).json({ success: false, error: '최초 오인식 문구와 정답 문구를 모두 입력하세요.' });
    }

    await glossaryService.recordUserCorrection(rawSnippet.trim(), correctedSnippet.trim(), category || 'GENERAL');

    return res.status(201).json({
      success: true,
      message: `[${rawSnippet} ➔ ${correctedSnippet}] 오답 교정 지침이 성공적으로 등록되었습니다.`
    });
  } catch (error) {
    console.error('[Admin Add Correction Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/corrections/:id
 * Edit an existing OCR correction rule
 */
router.put('/corrections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rawSnippet, correctedSnippet, category } = req.body;

    const updated = await prisma.ocrCorrection.update({
      where: { id },
      data: {
        rawSnippet: rawSnippet.trim(),
        correctedSnippet: correctedSnippet.trim(),
        category: category || 'GENERAL'
      }
    });

    // Refresh glossary service in-memory map
    glossaryService.correctionMap[rawSnippet.trim()] = correctedSnippet.trim();
    glossaryService.saveUserGlossary();

    return res.json({
      success: true,
      message: '교정 지침이 성공적으로 수정되었습니다.',
      data: updated
    });
  } catch (error) {
    console.error('[Admin Update Correction Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/corrections/:id
 * Delete a wrong or unwanted OCR correction rule
 */
router.delete('/corrections/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const target = await prisma.ocrCorrection.findUnique({ where: { id } });
    if (target) {
      delete glossaryService.correctionMap[target.rawSnippet];
      glossaryService.saveUserGlossary();
    }

    await prisma.ocrCorrection.delete({ where: { id } });

    return res.json({
      success: true,
      message: '잘못된 학습 교정 지침이 성공적으로 삭제되었습니다.'
    });
  } catch (error) {
    console.error('[Admin Delete Correction Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/terms
 * Add custom construction term to user glossary
 */
router.post('/terms', async (req, res) => {
  try {
    const { term } = req.body;
    if (!term || !term.trim()) {
      return res.status(400).json({ success: false, error: '등록할 용어를 입력하세요.' });
    }

    const cleanTerm = term.trim();
    glossaryService.userTerms.add(cleanTerm);
    glossaryService.saveUserGlossary();

    return res.json({
      success: true,
      message: `[${cleanTerm}] 용어가 지식베이스에 신규 등록되었습니다.`
    });
  } catch (error) {
    console.error('[Admin Add Term Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/terms
 * Delete mislearned term from user glossary
 */
router.delete('/terms', async (req, res) => {
  try {
    const { term } = req.body;
    if (!term) {
      return res.status(400).json({ success: false, error: '삭제할 용어를 지정하세요.' });
    }

    glossaryService.userTerms.delete(term.trim());
    glossaryService.saveUserGlossary();

    return res.json({
      success: true,
      message: `[${term}] 용어가 지식베이스에서 삭제되었습니다.`
    });
  } catch (error) {
    console.error('[Admin Delete Term Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

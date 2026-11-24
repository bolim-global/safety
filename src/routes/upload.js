const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const config = require('../config');
const pdfService = require('../services/pdfService');
const ocrService = require('../services/ocrService');
const aiService = require('../services/aiService');
const geminiService = require('../services/geminiService');

// Multer storage configuration
const uploadDir = config.uploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `safety_assessment_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(pdf|png|jpg|jpeg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Image files (PNG, JPG) are allowed.'));
    }
  }
});

const progressStore = {};

/**
 * GET /api/assessments/upload/progress/:jobId
 * Retrieve real-time per-page OCR progress status
 */
router.get('/upload/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const progress = progressStore[jobId] || { total: 1, current: 0, percent: 0, status: '분석 준비 중...' };
  return res.json({ success: true, progress });
});

/**
 * Phase 1 & 2 & 3 Combined Upload Pipeline with Gemini Vision Support
 * POST /api/assessments/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF or image file uploaded.' });
    }

    const jobId = req.body.jobId || req.headers['x-job-id'] || 'job_' + Date.now();
    console.log(`[Upload API] Processing file (${jobId}): ${req.file.originalname}`);

    // Phase 1: PDF to High-Res Image Preprocessing
    const fileMetadata = await pdfService.processUploadedFile(req.file);

    let structuredResult = null;
    let mainProvider = '';
    let totalConfidence = 0.99;
    let combinedRawText = '';
    let combinedBlocks = [];

    // Attempt Gemini Vision OCR & Multimodal Structuring (High-Speed Parallel Per-Page Pipeline)
    if (fileMetadata.imagePaths && fileMetadata.imagePaths.length > 0) {
      try {
        const totalPages = fileMetadata.imagePaths.length;
        console.log(`[Upload Pipeline] Processing ${totalPages} pages in parallel with Gemini 3.6 Flash Engine...`);
        
        progressStore[jobId] = {
          total: totalPages,
          current: 0,
          percent: 5,
          status: `⚡ PDF 총 ${totalPages}페이지 분할 완료 ➔ AI 초고속 병렬 전수 분석 시작...`
        };

        const pageResults = [];
        let completedCount = 0;

        // Optimized micro-batching (3 pages per batch with 100ms pause) to eliminate 429 rate limits
        const concurrency = 3;
        for (let i = 0; i < totalPages; i += concurrency) {
          if (i > 0) await new Promise(r => setTimeout(r, 100));
          const chunk = fileMetadata.imagePaths.slice(i, i + concurrency);
          const chunkPromises = chunk.map(async (pageFilePath, idx) => {
            const pageNum = i + idx + 1;
            try {
              const pageData = await geminiService.extractAndStructureWithGemini(pageFilePath);
              return { pageNum, pageData };
            } catch (err) {
              console.error(`[Upload Pipeline] Page ${pageNum} extraction error:`, err.message);
              if (err.message === 'GEMINI_DAILY_QUOTA_EXHAUSTED') {
                throw err;
              }
              return { pageNum, pageData: null };
            }
          });

          const batchResults = await Promise.all(chunkPromises);
          for (const res of batchResults) {
            completedCount++;
            const pct = Math.min(99, Math.round((completedCount / totalPages) * 100));
            progressStore[jobId] = {
              total: totalPages,
              current: completedCount,
              percent: pct,
              status: `⚡ ${completedCount} / ${totalPages} 페이지 AI 1:1 개별 정밀 분석 완료 (${pct}%)`
            };

            if (res && res.pageData) {
              if (Array.isArray(res.pageData)) {
                res.pageData.forEach(p => pageResults.push({ pageNumber: res.pageNum, ...p }));
              } else {
                pageResults.push({ pageNumber: res.pageNum, ...res.pageData });
              }
            }
          }
        }

        progressStore[jobId] = {
          total: totalPages,
          current: totalPages,
          percent: 100,
          status: `✅ 총 ${totalPages}개 페이지 AI 1:1 개별 분석 100% 완료!`
        };

        mainProvider = 'Google Gemini 3.6 Flash Parallel High-Res Vision Engine';

        const combinedMeta = {
          monthWeek: '',
          siteName: '',
          meetingDate: '',
          workType: '',
          workPeriod: '',
          author: '',
          siteManager: ''
        };
        let combinedRiskItems = [];

        // Check if any page indicates unsupported format
        const formatRejection = pageResults.find(p => p && p.isSupportedFormat === false);
        if (formatRejection) {
          console.warn('[Upload Pipeline] 🛑 Rejected unsupported document format:', formatRejection.unsupportedReason);
          structuredResult = {
            isSupportedFormat: false,
            unsupportedReason: formatRejection.unsupportedReason || '첨부된 문서는 위험성 평가표 서식이 아닙니다. (사건개요/소장/일반 문서 서식)'
          };
        } else {
          pageResults.forEach(pageObj => {
            if (pageObj && pageObj.siteMetadata) {
              const sm = pageObj.siteMetadata;
              if (!combinedMeta.monthWeek && sm.monthWeek) combinedMeta.monthWeek = sm.monthWeek;
              if (!combinedMeta.siteName && sm.siteName) combinedMeta.siteName = sm.siteName;
              if (!combinedMeta.meetingDate && sm.meetingDate) combinedMeta.meetingDate = sm.meetingDate;
              if (!combinedMeta.workType && sm.workType) combinedMeta.workType = sm.workType;
              if (!combinedMeta.workPeriod && sm.workPeriod) combinedMeta.workPeriod = sm.workPeriod;
              if (!combinedMeta.author && sm.author) combinedMeta.author = sm.author;
              if (!combinedMeta.siteManager && sm.siteManager) combinedMeta.siteManager = sm.siteManager;
            }
            if (pageObj && Array.isArray(pageObj.riskItems)) {
              const pageWorkType = pageObj.siteMetadata?.workType || '';
              const pageAuthor = pageObj.siteMetadata?.author || '';
              const pNum = pageObj.pageNumber || 1;

              const itemsWithMeta = pageObj.riskItems.map(item => ({
                ...item,
                pageNumber: item.pageNumber || pNum,
                workType: item.workType || pageWorkType,
                author: item.author || pageAuthor
              }));

              combinedRiskItems = combinedRiskItems.concat(itemsWithMeta);
            }
          });

          if (combinedRiskItems.length > 0) {
            structuredResult = {
              isSupportedFormat: true,
              siteMetadata: combinedMeta,
              riskItems: combinedRiskItems
            };
            combinedRawText = JSON.stringify(structuredResult, null, 2);
          }
        }
      } catch (geminiErr) {
        console.warn('[Upload Pipeline] Gemini Multimodal Engine failed, falling back:', geminiErr.message);
        if (geminiErr.message === 'GEMINI_DAILY_QUOTA_EXHAUSTED') {
          progressStore[jobId] = {
            total: fileMetadata.pageCount,
            current: 1,
            percent: 50,
            status: `⚡ Gemini 일일 무료 쿼터(20회) 소진 ➔ Google Cloud Vision OCR 엔진 초고속 전환!`
          };
        }
      }
    }

    // Fallback to OCR Service & AI Service pipeline
    if (!structuredResult) {
      let avgConfidence = totalConfidence;
      if (fileMetadata.extractedText && fileMetadata.extractedText.trim().length > 10) {
        combinedRawText = fileMetadata.extractedText;
        mainProvider = 'PDF Digital Text Parser';
        avgConfidence = 0.99;
      } else {
        for (let i = 0; i < fileMetadata.imagePaths.length; i++) {
          const pageImgPath = fileMetadata.imagePaths[i];
          const pageOcr = await ocrService.extractText(pageImgPath);

          mainProvider = pageOcr.provider;
          totalConfidence += pageOcr.confidenceScore || 0.9;
          combinedBlocks = combinedBlocks.concat(pageOcr.blocks || []);
          combinedRawText += `\n--- 페이지 ${i + 1} ---\n` + pageOcr.rawText + '\n';
        }
        if (fileMetadata.imagePaths.length > 0) {
          avgConfidence = totalConfidence / fileMetadata.imagePaths.length;
        }
        totalConfidence = avgConfidence;
      }

      console.log('[Upload Pipeline] Structuring extracted text via AI Service...');
      structuredResult = await aiService.structureSafetyAssessment(combinedRawText);
    }

    if (structuredResult && structuredResult.isSupportedFormat === false) {
      console.warn('[Upload API] Rejecting unsupported document format response.');
      return res.status(400).json({
        success: false,
        error: structuredResult.unsupportedReason || '양식이 올바르지 않거나 지원되지 않는 문서 서식입니다. (위험성 평가표 양식 미일치)'
      });
    }

    const avgConfidence = totalConfidence;

    return res.status(200).json({
      success: true,
      message: `Safety risk assessment file (${fileMetadata.pageCount} pages) processed successfully.`,
      data: {
        fileInfo: {
          originalName: fileMetadata.originalName,
          filename: fileMetadata.filename,
          fileUrl: `/uploads/${fileMetadata.filename}`,
          isPdf: fileMetadata.isPdf,
          pageCount: fileMetadata.pageCount,
          imageUrls: fileMetadata.relImagePaths
        },
        ocr: {
          provider: mainProvider,
          confidenceScore: avgConfidence,
          rawText: combinedRawText.trim(),
          blocks: combinedBlocks
        },
        structured: structuredResult
      }
    });

  } catch (error) {
    console.error('[Upload API Error]', error);
    return res.status(400).json({
      success: false,
      error: error.message || '업로드 처리 중 오류가 발생했습니다. 파일 상태를 확인해주세요.'
    });
  }
});

module.exports = router;

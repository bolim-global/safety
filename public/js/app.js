/**
 * Construction Safety Risk Assessment OCR & AI Insight Platform Frontend Logic
 */
document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let currentOcrData = null;
  let currentStructuredData = null;
  let uploadedFileInfo = null;

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const currentPageTitle = document.getElementById('current-page-title');

  // File Upload Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnSelectFile = document.getElementById('btn-select-file');
  const uploadProgress = document.getElementById('upload-progress');

  // Editor Elements
  const documentPreviewImg = document.getElementById('document-preview-img');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const rawOcrTextBox = document.getElementById('raw-ocr-text-box');
  const ocrProviderBadge = document.getElementById('ocr-provider-badge');
  const metaSiteName = document.getElementById('meta-site-name');
  const metaDate = document.getElementById('meta-date');
  const metaAssessor = document.getElementById('meta-assessor');
  const metaWorkType = document.getElementById('meta-work-type');
  const riskItemsTbody = document.getElementById('risk-items-tbody');
  const btnAddRiskItem = document.getElementById('btn-add-risk-item');
  const btnSaveAssessment = document.getElementById('btn-save-assessment');

  // History & Refresh Elements
  const historyTbody = document.getElementById('history-tbody');
  const btnRefreshHistory = document.getElementById('btn-refresh-history');

  // --- TAB NAVIGATION ---
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');

      navItems.forEach(n => n.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(`${tab}-section`).classList.add('active');

      // Update Header Title
      if (tab === 'upload') currentPageTitle.textContent = '손글씨 안전위험성평가 PDF 인식 & AI 분석';
      if (tab === 'editor') currentPageTitle.textContent = '손글씨 OCR 인식 결과 확인 및 수동 보정';
      if (tab === 'analytics') {
        currentPageTitle.textContent = '데이터베이스 축적 데이터 기반 위험 예방 통계';
        loadAnalyticsData();
      }
      if (tab === 'history') {
        currentPageTitle.textContent = '저장된 위험성평가 데이터베이스 조회';
        loadAssessmentHistory();
      }
      if (tab === 'admin') {
        currentPageTitle.textContent = 'AI 자가학습 & 오답교정 관리자 모드';
        loadAdminLearningData();
      }
    });
  });

  function switchTab(tabName) {
    const targetNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (targetNav) targetNav.click();
  }

  // --- FILE UPLOAD & DRAG/DROP ---
  btnSelectFile.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  /**
   * Compress or convert a single image File > 3.5MB to JPEG Blob so it stays well under Vercel's 4.5MB limit
   */
  async function ensureImageUnderLimit(file) {
    if (file.size <= 3.5 * 1024 * 1024) return file;
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 2400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  /**
   * Render one PDF page to a compressed JPEG File (< 1.5MB) using PDF.js when a single page exceeds 3.5MB
   */
  async function renderPdfPageToJpegFile(pdfDoc, pageNum, baseName) {
    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1.0 });
    const maxDim = 1800;
    const scale = Math.min(2.0, maxDim / Math.max(baseViewport.width, baseViewport.height, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    let quality = 0.8;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    while (blob && blob.size > 3.0 * 1024 * 1024 && quality > 0.4) {
      quality -= 0.15;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }
    const pageFileName = `${baseName}_p${pageNum}.jpg`;
    return {
      file: new File([blob], pageFileName, { type: 'image/jpeg' }),
      blobUrl: URL.createObjectURL(blob)
    };
  }

  /**
   * Safely parse JSON response from server (handles Vercel 413/504 plain-text errors gracefully)
   */
  async function safeParseJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      if (response.status === 413 || text.includes('Request Entity Too Large')) {
        throw new Error('파일 용량이 서버 단일 요청 한도(4.5MB)를 초과했습니다. (페이지를 새로고침 Ctrl+F5 후 다시 시도해주세요)');
      }
      if (response.status === 504 || text.includes('FUNCTION_INVOCATION_TIMEOUT')) {
        throw new Error('AI 분석 시간이 서버 제한 시간을 초과했습니다.');
      }
      throw new Error(text.slice(0, 120) || `서버 응답 오류 (HTTP ${response.status})`);
    }
  }

  /**
   * Uploads file to backend API pipeline (POST /api/assessments/upload)
   * Uses self-hosted PDFLib (and PDF.js fallback) to split PDFs per-page in the browser so every request is ~500KB.
   */
  async function handleFileUpload(file) {
    showUploadProgress(true);

    const progressFill = document.getElementById('progress-fill');
    const progressStatusText = document.getElementById('progress-status-text');
    const progressSubtext = document.getElementById('progress-subtext');

    if (progressStatusText) {
      progressStatusText.innerText = '📄 파일 업로드 및 페이지 분할 준비 중...';
    }
    if (progressFill) progressFill.style.width = '5%';

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const localBlobUrl = URL.createObjectURL(file);
    loadedPdfDoc = null;
    const pdfjsApi = window.pdfjsLib || window['pdfjs-dist/build/pdf'];

    // Client-side per-page PDF pipeline using self-hosted PDFLib (0% CDN dependency) or PDF.js
    if (isPdf && (window.PDFLib || pdfjsApi)) {
      try {
        const baseName = file.name.replace(/\.pdf$/i, '');
        const arrayBuffer = await file.arrayBuffer();
        let totalPages = 1;
        let srcPdfLibDoc = null;
        let pdfJsDoc = null;

        if (window.PDFLib && window.PDFLib.PDFDocument) {
          srcPdfLibDoc = await window.PDFLib.PDFDocument.load(arrayBuffer);
          totalPages = srcPdfLibDoc.getPageCount();
        }
        if (pdfjsApi) {
          pdfjsApi.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          try {
            pdfJsDoc = await pdfjsApi.getDocument({ data: arrayBuffer.slice(0) }).promise;
            loadedPdfDoc = pdfJsDoc;
            if (!srcPdfLibDoc) totalPages = pdfJsDoc.numPages;
          } catch (workerErr) {
            console.warn('[PDF.js Preview Init Warning]', workerErr);
          }
        }

        if (progressStatusText) {
          progressStatusText.innerText = `⚡ PDF 총 ${totalPages}페이지 분할 완료 ➔ AI 병렬 정밀 분석 시작...`;
        }
        if (progressSubtext) {
          progressSubtext.innerText = `개별 페이지 1:1 AI 추출 진행률: 0 / ${totalPages} 페이지 완료 (5%)`;
        }

        const pageResults = new Array(totalPages);
        const pageBlobUrls = new Array(totalPages);
        let completedCount = 0;
        let mainProvider = 'Google Gemini 3.6 Flash Parallel High-Res Vision Engine';
        let totalConfidence = 0;
        let combinedRawText = '';

        // Process 2 pages concurrently so each request is ~500KB and finishes in ~3s
        const concurrency = 2;
        for (let i = 0; i < totalPages; i += concurrency) {
          if (i > 0) await new Promise(r => setTimeout(r, 150));
          const batchPageNums = [];
          for (let j = i; j < Math.min(i + concurrency, totalPages); j++) {
            batchPageNums.push(j + 1);
          }

          await Promise.all(batchPageNums.map(async (pageNum) => {
            let pageUploadFile = null;

            // 1st choice: Lossless 1-page PDF split via self-hosted PDFLib (~500KB per page)
            if (srcPdfLibDoc) {
              const subDoc = await window.PDFLib.PDFDocument.create();
              const [copiedPage] = await subDoc.copyPages(srcPdfLibDoc, [pageNum - 1]);
              subDoc.addPage(copiedPage);
              const subBytes = await subDoc.save();

              if (subBytes.byteLength <= 3.5 * 1024 * 1024) {
                const subBlob = new Blob([subBytes], { type: 'application/pdf' });
                pageUploadFile = new File([subBlob], `${baseName}_p${pageNum}.pdf`, { type: 'application/pdf' });
                pageBlobUrls[pageNum - 1] = URL.createObjectURL(subBlob);
              }
            }

            // 2nd choice (if single PDF page > 3.5MB or PDFLib unavailable): compressed JPEG via PDF.js
            if (!pageUploadFile && pdfJsDoc) {
              const rendered = await renderPdfPageToJpegFile(pdfJsDoc, pageNum, baseName);
              pageUploadFile = rendered.file;
              pageBlobUrls[pageNum - 1] = rendered.blobUrl;
            }

            if (!pageUploadFile) {
              throw new Error(`${pageNum}페이지 분할에 실패했습니다.`);
            }

            const pageJobId = `job_${Date.now()}_p${pageNum}`;
            const pageFormData = new FormData();
            pageFormData.append('file', pageUploadFile);
            pageFormData.append('jobId', pageJobId);

            const response = await fetch('/api/assessments/upload', {
              method: 'POST',
              headers: { 'X-Job-Id': pageJobId },
              body: pageFormData
            });

            const resJson = await safeParseJsonResponse(response);
            if (!resJson.success) {
              throw new Error(resJson.error || `${pageNum}페이지 분석 실패`);
            }

            pageResults[pageNum - 1] = resJson.data;
            completedCount++;
            const pct = Math.min(99, Math.round((completedCount / totalPages) * 100));
            if (progressFill) progressFill.style.width = `${pct}%`;
            if (progressStatusText) {
              progressStatusText.innerText = `⚡ ${completedCount} / ${totalPages} 페이지 AI 1:1 개별 정밀 분석 완료 (${pct}%)`;
            }
            if (progressSubtext) {
              progressSubtext.innerText = `개별 페이지 1:1 AI 추출 진행률: ${completedCount} / ${totalPages} 페이지 완료 (${pct}%)`;
            }
          }));
        }

        // Merge all pages' siteMetadata and riskItems in page order
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

        pageResults.forEach((pageData, idx) => {
          const pNum = idx + 1;
          if (!pageData) return;
          if (pageData.ocr?.provider) mainProvider = pageData.ocr.provider;
          totalConfidence += pageData.ocr?.confidenceScore || 0.98;
          if (pageData.ocr?.rawText) {
            combinedRawText += `\n--- 페이지 ${pNum} ---\n` + pageData.ocr.rawText + '\n';
          }

          const structured = pageData.structured || {};
          const sm = structured.siteMetadata || {};
          if (!combinedMeta.monthWeek && sm.monthWeek) combinedMeta.monthWeek = sm.monthWeek;
          if (!combinedMeta.siteName && sm.siteName) combinedMeta.siteName = sm.siteName;
          if (!combinedMeta.meetingDate && sm.meetingDate) combinedMeta.meetingDate = sm.meetingDate;
          if (!combinedMeta.workType && sm.workType) combinedMeta.workType = sm.workType;
          if (!combinedMeta.workPeriod && sm.workPeriod) combinedMeta.workPeriod = sm.workPeriod;
          if (!combinedMeta.author && sm.author) combinedMeta.author = sm.author;
          if (!combinedMeta.siteManager && sm.siteManager) combinedMeta.siteManager = sm.siteManager;

          if (Array.isArray(structured.riskItems)) {
            const itemsWithPage = structured.riskItems.map(item => ({
              ...item,
              pageNumber: pNum,
              workType: item.workType || sm.workType || '',
              author: item.author || sm.author || ''
            }));
            combinedRiskItems = combinedRiskItems.concat(itemsWithPage);
          }
        });

        showUploadProgress(false);
        showToast(`PDF 총 ${totalPages}페이지 1:1 AI 정밀 추출 완료!`, 'success');

        populateEditorView({
          fileInfo: {
            originalName: file.name,
            filename: file.name,
            fileUrl: localBlobUrl,
            localBlobUrl,
            isPdf: true,
            pageCount: totalPages,
            imageUrls: pageBlobUrls
          },
          ocr: {
            provider: mainProvider,
            confidenceScore: totalConfidence / Math.max(1, totalPages),
            rawText: combinedRawText.trim(),
            blocks: []
          },
          structured: {
            isSupportedFormat: true,
            siteMetadata: combinedMeta,
            riskItems: combinedRiskItems
          }
        });
        switchTab('editor');
        return;
      } catch (pdfErr) {
        showUploadProgress(false);
        showToast('분석 오류: ' + pdfErr.message, 'danger');
        return;
      }
    }

    // Single Image (or fallback) upload
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const uploadReadyFile = isPdf ? file : await ensureImageUnderLimit(file);
    const formData = new FormData();
    formData.append('file', uploadReadyFile);
    formData.append('jobId', jobId);

    // Real-time per-page progress polling
    const pollInterval = setInterval(async () => {
      try {
        const pRes = await fetch(`/api/assessments/upload/progress/${jobId}`);
        const pData = await pRes.json();
        if (pData.success && pData.progress) {
          const { percent, status, current, total } = pData.progress;
          if (progressFill) progressFill.style.width = `${percent}%`;
          if (progressStatusText && status) {
            progressStatusText.innerText = status;
          }
          if (progressSubtext && total > 0) {
            progressSubtext.innerText = `개별 페이지 1:1 AI 추출 진행률: ${current} / ${total} 페이지 완료 (${percent}%)`;
          }
        }
      } catch (e) {
        // Silent poll exception
      }
    }, 400);

    try {
      const response = await fetch('/api/assessments/upload', {
        method: 'POST',
        headers: {
          'X-Job-Id': jobId
        },
        body: formData
      });

      clearInterval(pollInterval);
      const result = await safeParseJsonResponse(response);
      showUploadProgress(false);

      if (!result.success) {
        showToast(result.error || '업로드 처리 실패', 'danger');
        return;
      }

      if (result.data && result.data.fileInfo) {
        result.data.fileInfo.localBlobUrl = localBlobUrl;
        if (!result.data.fileInfo.imageUrls || result.data.fileInfo.imageUrls.length === 0) {
          result.data.fileInfo.imageUrls = [localBlobUrl];
        }
      }

      showToast('AI 정밀 추출 완료!', 'success');
      populateEditorView(result.data);
      switchTab('editor');

    } catch (err) {
      clearInterval(pollInterval);
      showUploadProgress(false);
      showToast('서버 연결 실패: ' + err.message, 'danger');
    }
  }

  /**
   * Triggers fast mock sample evaluation
   */
  async function handleQuickSample() {
    showUploadProgress(true);
    setTimeout(() => {
      showUploadProgress(false);
      const mockData = {
        fileInfo: {
          originalName: '샘플_안전위험성평가표_철골공사.pdf',
          filename: 'sample_risk_assessment.pdf',
          isPdf: true,
          pageCount: 1,
          imageUrls: ['/uploads/images/sample_preview.png']
        },
        ocr: {
          provider: 'Korean Handwriting High-Accuracy OCR Engine',
          confidenceScore: 0.94,
          rawText: `
[안전위험성평가표 - 손글씨 원문 OCR]
현장명: 서울 강남 대치동 복합빌딩 신축공사 현장
평가일자: 2026년 07월 29일
평가자: 김철수 안전관리자 / 이영희 공사팀장
공종: 철골공사 및 가설공사

--- 위험요인 및 안전대책 세부내역 ---
1. 위험장소: 5층 외부 달비계 작업구간
위험요인 (손글씨): 달비계 상부 작업 중 안전대 미체결 상태로 고소작업 진행하여 추락 위험 있음 (손글씨 흘림: 안전고리 헐거움)
위험성수준: 빈도(4), 강도(5), 위험등급: 상 (Red)
안전대책: 작업자 안전대 이중 고리 체결 의무화, 작업 발판 고정 상태 매일 점검, 추락방지망 추가 설치

2. 위험장소: 타워크레인 양중 작업반경 하부
위험요인 (손글씨): 철골 부재 인양 시 하부 통제 미흡 및 신호수 미배치로 인한 자재 낙하 및 충돌 위험
위험성수준: 빈도(3), 강도(4), 위험등급: 상 (Red)
안전대책: 인양 작업 구역 통제선 설치 및 무전기 소지 전담 신호수 배치

3. 위험장소: 지하 1층 이동식 사다리 작업구간
위험요인 (손글씨): A형 이동식 사다리 상부 2인 동반 작업 중 흔들림으로 인한 낙상 위험
위험성수준: 빈도(3), 강도(2), 위험등급: 중 (Yellow)
안전대책: 사다리 작업 시 2인 1조 (1인 아웃리거 잡기) 이행

4. 위험장소: 현장 내 가설 전동공구 전원반
위험요인 (손글씨): 누전차단기 외함 파손 및 습기 노출 상태로 작업 진행하여 감전 위험
위험성수준: 빈도(2), 강도(4), 위험등급: 중 (Yellow)
안전대책: 접지 상태 및 누전차단기 작동 여부 점검, 방수형 접지 콘센트로 즉시 교체
`.trim()
        },
        structured: {
          siteMetadata: {
            siteName: '서울 강남 대치동 복합빌딩 신축공사 현장',
            assessmentDate: '2026-07-29',
            assessor: '김철수 안전관리자',
            workType: '철골공사'
          },
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
              safetyMeasure: '인양 작업 구역 통제선 설치 및 무전기 소지 전담 신호수 배치'
            },
            {
              locationEquipment: '지하 1층 이동식 사다리 작업구간',
              riskFactor: 'A형 이동식 사다리 상부 2인 동반 작업 중 흔들림으로 인한 낙상 위험',
              frequency: '3',
              severity: '2',
              riskGrade: '중',
              safetyMeasure: '사다리 작업 시 2인 1조 (1인 아웃리거 잡기) 이행, 최상부 발판 작업 금지 표지판 설치'
            },
            {
              locationEquipment: '현장 내 가설 전동공구 전원반',
              riskFactor: '누전차단기 외함 파손 및 습기 노출 상태로 작업 진행하여 감전 위험',
              frequency: '2',
              severity: '4',
              riskGrade: '중',
              safetyMeasure: '접지 상태 및 누전차단기 작동 여부 점검, 방수형 접지 콘센트로 즉시 교체'
            }
          ]
        }
      };

      showToast('샘플 평가표 손글씨 OCR 처리 완료!', 'success');
      populateEditorView(mockData);
      switchTab('editor');
    }, 1200);
  }

  function showUploadProgress(show) {
    if (show) {
      dropZone.classList.add('hidden');
      uploadProgress.classList.remove('hidden');
    } else {
      dropZone.classList.remove('hidden');
      uploadProgress.classList.add('hidden');
    }
  }

  // --- POPULATE EDITOR VIEW ---
  function populateEditorView(data) {
    currentOcrData = data.ocr;
    currentStructuredData = data.structured;
    uploadedFileInfo = data.fileInfo;

    // OCR Raw Output Log
    if (ocrProviderBadge) ocrProviderBadge.textContent = `${data.ocr.provider} (신뢰도: ${Math.round(data.ocr.confidenceScore * 100)}%)`;
    if (rawOcrTextBox) rawOcrTextBox.textContent = data.ocr.rawText;

    // Image / PDF Preview
    if (data.fileInfo && data.fileInfo.isPdf) {
      if (previewPlaceholder) previewPlaceholder.innerHTML = `<i class="fa-solid fa-file-pdf" style="font-size: 54px; color: #ef4444; margin-bottom: 12px;"></i><p>PDF 멀티페이지 문서 (${data.fileInfo.pageCount || 1}페이지)<br><small style="color: #64748b;">${escapeHtml(data.fileInfo.originalName)}</small></p>`;
      if (previewPlaceholder) previewPlaceholder.classList.remove('hidden');
      if (documentPreviewImg) documentPreviewImg.classList.add('hidden');
    } else if (data.fileInfo && data.fileInfo.imageUrls && data.fileInfo.imageUrls.length > 0) {
      if (documentPreviewImg) documentPreviewImg.src = data.fileInfo.imageUrls[0];
      if (documentPreviewImg) documentPreviewImg.classList.remove('hidden');
      if (previewPlaceholder) previewPlaceholder.classList.add('hidden');
    }

    // Site Metadata Form
    const meta = data.structured.siteMetadata || {};
    metaSiteName.value = meta.siteName || '';
    
    const monthWeekInput = document.getElementById('meta-month-week');
    if (monthWeekInput) monthWeekInput.value = meta.monthWeek || '';
    
    metaDate.value = meta.assessmentDate || meta.meetingDate || new Date().toISOString().split('T')[0];
    
    const workPeriodInput = document.getElementById('meta-work-period');
    if (workPeriodInput) workPeriodInput.value = meta.workPeriod || '';

    if (metaAssessor) metaAssessor.value = meta.assessor || meta.author || '';
    
    const siteManagerInput = document.getElementById('meta-site-manager');
    if (siteManagerInput) siteManagerInput.value = meta.siteManager || '';

    if (metaWorkType) metaWorkType.value = meta.workType || '';

    // Check for uncertain items needing user review
    const riskItems = data.structured.riskItems || [];
    const uncertainCount = riskItems.filter(item => 
      item.needsReview || 
      JSON.stringify(item).includes('[판독불가]') || 
      JSON.stringify(item).includes('[불확실')
    ).length;

    const alertBanner = document.getElementById('uncertainty-warning-alert');
    const alertText = document.getElementById('uncertainty-warning-text');
    if (uncertainCount > 0) {
      if (alertBanner) alertBanner.classList.remove('hidden');
      if (alertText) alertText.innerHTML = `손글씨 획이 뭉개지거나 판독이 불확실한 항목이 <strong>${uncertainCount}건</strong> 감지되었습니다. DB 저장 전 <strong>[🔍 원본확인]</strong> 기능으로 수기 문서 원본을 대조하시어 텍스트를 수동 보정해 주시기 바랍니다.`;
      // Auto unlock edit mode when uncertain items are detected
      isEditLocked = false;
    } else {
      if (alertBanner) alertBanner.classList.add('hidden');
      isEditLocked = true;
    }

    // Risk Items Table
    renderRiskItemsTable(riskItems);
    applyLockState();
  }

  let isEditLocked = true;
  const btnToggleEdit = document.getElementById('btn-toggle-edit');
  const readonlyBadge = document.getElementById('readonly-badge');

  if (btnToggleEdit) {
    btnToggleEdit.addEventListener('click', () => {
      isEditLocked = !isEditLocked;
      applyLockState();
    });
  }

  function applyLockState() {
    const inputs = document.querySelectorAll('.editor-column.right input, .editor-column.right textarea');
    const selects = document.querySelectorAll('.editor-column.right select');
    const removeBtns = document.querySelectorAll('.btn-remove-row');

    inputs.forEach(input => {
      if (isEditLocked) {
        input.setAttribute('readonly', 'readonly');
        input.classList.add('readonly-mode');
      } else {
        input.removeAttribute('readonly');
        input.classList.remove('readonly-mode');
      }
    });

    selects.forEach(select => {
      if (isEditLocked) {
        select.setAttribute('disabled', 'disabled');
        select.classList.add('readonly-mode');
      } else {
        select.removeAttribute('disabled');
        select.classList.remove('readonly-mode');
      }
    });

    removeBtns.forEach(btn => {
      btn.style.display = isEditLocked ? 'none' : 'inline-block';
    });

    if (readonlyBadge && btnToggleEdit) {
      if (isEditLocked) {
        readonlyBadge.innerHTML = '<i class="fa-solid fa-lock"></i> 수정 불가 (읽기 전용 모드)';
        readonlyBadge.className = 'badge badge-success';
        btnToggleEdit.innerHTML = '<i class="fa-solid fa-lock-open"></i> 수정 잠금 해제';
        btnAddRiskItem.style.display = 'none';
      } else {
        readonlyBadge.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 수정 가능 (편집 모드)';
        readonlyBadge.className = 'badge badge-warning';
        btnToggleEdit.innerHTML = '<i class="fa-solid fa-lock"></i> 수정 잠금 적용';
        btnAddRiskItem.style.display = 'inline-flex';
      }
    }
  }

  function extractWordLevelCorrections(rawStr, correctedStr, category = 'GENERAL') {
    rawStr = (rawStr || '').trim();
    correctedStr = (correctedStr || '').trim();

    if (!rawStr || !correctedStr || rawStr === correctedStr) return [];

    if (rawStr.length <= 25 && correctedStr.length <= 25) {
      return [{ rawSnippet: rawStr, correctedSnippet: correctedStr, category }];
    }

    const cleanRaw = rawStr.replace(/\[(누가\?|무슨작업\?|어떻게\?|왜 위험\?|작성자의견|회의결과)\]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanCorr = correctedStr.replace(/\[(누가\?|무슨작업\?|어떻게\?|왜 위험\?|작성자의견|회의결과)\]/g, ' ').replace(/\s+/g, ' ').trim();

    const rawWords = cleanRaw.split(' ').filter(Boolean);
    const corrWords = cleanCorr.split(' ').filter(Boolean);

    const m = rawWords.length;
    const n = corrWords.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (rawWords[i - 1] === corrWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const diffChunks = [];
    let i = m, j = n;
    let currentRaw = [];
    let currentCorr = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && rawWords[i - 1] === corrWords[j - 1]) {
        if (currentRaw.length > 0 || currentCorr.length > 0) {
          diffChunks.unshift({
            raw: currentRaw.reverse().join(' '),
            corr: currentCorr.reverse().join(' ')
          });
          currentRaw = [];
          currentCorr = [];
        }
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        currentCorr.push(corrWords[j - 1]);
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        currentRaw.push(rawWords[i - 1]);
        i--;
      }
    }

    if (currentRaw.length > 0 || currentCorr.length > 0) {
      diffChunks.unshift({
        raw: currentRaw.reverse().join(' '),
        corr: currentCorr.reverse().join(' ')
      });
    }

    const pairs = [];
    diffChunks.forEach(chunk => {
      const r = chunk.raw.trim();
      const c = chunk.corr.trim();

      if (!r || !c || r === c) return;

      let finalRaw = r;
      let finalCorr = c;

      if (finalRaw.length > 30) finalRaw = finalRaw.substring(0, 30) + '...';
      if (finalCorr.length > 30) finalCorr = finalCorr.substring(0, 30) + '...';

      pairs.push({ rawSnippet: finalRaw, correctedSnippet: finalCorr, category });
    });

    return pairs;
  }

  function collectRowCorrections(tr) {
    const itemCorrections = [];

    const rawWorkType = (tr.dataset.rawWorkType || '').trim();
    const rawAuthor = (tr.dataset.rawAuthor || '').trim();
    const rawLocation = (tr.dataset.rawLocation || '').trim();
    const rawFactor = (tr.dataset.rawFactor || '').trim();
    const rawMeasure = (tr.dataset.rawMeasure || '').trim();

    const currentWorkType = (tr.querySelector('.item-work-type')?.value || '').trim();
    const currentAuthor = (tr.querySelector('.item-author')?.value || '').trim();
    const currentLocation = (tr.querySelector('.item-location')?.value || '').trim();
    const currentFactor = (tr.querySelector('.item-factor')?.value || '').trim();

    const currentAuthorOpinion = (tr.querySelector('.item-author-opinion')?.value || '').trim();
    const currentMeetingResult = (tr.querySelector('.item-meeting-result')?.value || '').trim();
    const currentMeasure = [currentAuthorOpinion, currentMeetingResult].filter(Boolean).join('\n') || currentAuthorOpinion || currentMeetingResult;

    if (rawWorkType && currentWorkType && rawWorkType !== currentWorkType) {
      itemCorrections.push(...extractWordLevelCorrections(rawWorkType, currentWorkType, 'WORK_TYPE'));
    }
    if (rawAuthor && currentAuthor && rawAuthor !== currentAuthor) {
      itemCorrections.push(...extractWordLevelCorrections(rawAuthor, currentAuthor, 'AUTHOR'));
    }
    if (rawLocation && currentLocation && rawLocation !== currentLocation) {
      itemCorrections.push(...extractWordLevelCorrections(rawLocation, currentLocation, 'LOCATION'));
    }
    if (rawFactor && currentFactor && rawFactor !== currentFactor) {
      itemCorrections.push(...extractWordLevelCorrections(rawFactor, currentFactor, 'RISK_FACTOR'));
    }
    if (rawMeasure && currentMeasure && rawMeasure !== currentMeasure) {
      itemCorrections.push(...extractWordLevelCorrections(rawMeasure, currentMeasure, 'SAFETY_MEASURE'));
    }

    return itemCorrections;
  }

  function renderRiskItemsTable(items) {
    riskItemsTbody.innerHTML = '';

    items.forEach((item, index) => {
      const tr = document.createElement('tr');
      const isUncertainItem = item.needsReview || JSON.stringify(item).includes('[판독불가]') || JSON.stringify(item).includes('[불확실');

      if (isUncertainItem) {
        tr.style.backgroundColor = '#fffbeb';
      }

      let factorText = item.riskFactor || '';
      if (item.who || item.whatWork || item.howWork || item.whyHazardous) {
        factorText = [
          item.who ? `[누가?] ${item.who}` : '',
          item.whatWork ? `[무슨작업?] ${item.whatWork}` : '',
          item.howWork ? `[어떻게?] ${item.howWork}` : '',
          item.whyHazardous ? `[왜 위험?] ${item.whyHazardous}` : ''
        ].filter(Boolean).join('\n');
      }

      const measureText = [
        item.authorOpinion ? `[작성자의견] ${item.authorOpinion}` : '',
        item.meetingResult ? `[회의결과] ${item.meetingResult}` : ''
      ].filter(Boolean).join('\n') || item.safetyMeasure || item.authorOpinion || item.meetingResult || '';

      tr.dataset.rawWorkType = (item.workType || '').trim();
      tr.dataset.rawAuthor = (item.author || '').trim();
      tr.dataset.rawLocation = (item.locationEquipment || '').trim();
      tr.dataset.rawFactor = factorText.trim();
      tr.dataset.rawMeasure = measureText.trim();

      const isReadonlyAttr = isEditLocked ? 'readonly' : '';
      const isDisabledAttr = isEditLocked ? 'disabled' : '';
      const readonlyClass = isEditLocked ? 'readonly-mode' : '';

      tr.innerHTML = `
        <td><input type="text" class="table-input item-work-type ${readonlyClass}" ${isReadonlyAttr} value="${escapeHtml(item.workType || '공종')}" placeholder="공종"></td>
        <td><input type="text" class="table-input item-author ${readonlyClass}" ${isReadonlyAttr} value="${escapeHtml(item.author || '')}" placeholder="작성자"></td>
        <td><input type="text" class="table-input item-location ${readonlyClass}" ${isReadonlyAttr} value="${escapeHtml(item.locationEquipment || '현장 작업구간')}"></td>
        <td><input type="text" class="table-input item-date-range ${readonlyClass}" ${isReadonlyAttr} value="${escapeHtml(item.workDateRange || '점검일자')}"></td>
        <td><textarea class="table-input item-factor ${readonlyClass}" ${isReadonlyAttr} rows="6" style="min-height: 140px; font-size: 13px; line-height: 1.6; resize: vertical;">${escapeHtml(factorText)}</textarea></td>
        <td><input type="text" class="table-input item-hazard-type ${readonlyClass}" ${isReadonlyAttr} value="${escapeHtml(item.hazardType || '추락')}"></td>
        <td>
          <select class="table-select item-freq ${readonlyClass}" ${isDisabledAttr}>
            <option value="상" ${item.riskAssessmentCheck === '상' || item.frequency === '상' ? 'selected' : ''}>상</option>
            <option value="중" ${item.riskAssessmentCheck === '중' || item.frequency === '중' || (!item.frequency && !item.riskAssessmentCheck) ? 'selected' : ''}>중</option>
            <option value="하" ${item.riskAssessmentCheck === '하' || item.frequency === '하' ? 'selected' : ''}>하</option>
          </select>
        </td>
        <td>
          <select class="table-select item-grade ${readonlyClass}" ${isDisabledAttr}>
            <option value="상" ${item.riskGrade === '상' ? 'selected' : ''}>상 (Red)</option>
            <option value="중" ${item.riskGrade === '중' ? 'selected' : ''}>중 (Yellow)</option>
            <option value="하" ${item.riskGrade === '하' || !item.riskGrade ? 'selected' : ''}>하 (Green)</option>
          </select>
        </td>
        <td>
          <select class="table-select item-target ${readonlyClass}" ${isDisabledAttr}>
            <option value="일상" ${item.managementTarget === '일상' || !item.managementTarget ? 'selected' : ''}>일상</option>
            <option value="집중" ${item.managementTarget === '집중' ? 'selected' : ''}>집중</option>
          </select>
        </td>
        <td><textarea class="table-input item-author-opinion ${readonlyClass}" ${isReadonlyAttr} rows="6" style="min-height: 140px; font-size: 13px; line-height: 1.6; resize: vertical;" placeholder="작성자의견 입력">${escapeHtml(item.authorOpinion || item.safetyMeasure || '')}</textarea></td>
        <td><textarea class="table-input item-meeting-result ${readonlyClass}" ${isReadonlyAttr} rows="6" style="min-height: 140px; font-size: 13px; line-height: 1.6; resize: vertical;" placeholder="회의결과 입력">${escapeHtml(item.meetingResult || '')}</textarea></td>
        <td>
          <button class="btn btn-sm btn-outline btn-verify-page" data-page="${item.pageNumber || (index + 1)}" style="font-size: 11px; padding: 4px 6px; white-space: nowrap; color: #2563eb; border-color: #93c5fd; background: #eff6ff;">
            <i class="fa-solid fa-file-signature"></i> ${item.pageNumber || (index + 1)}P 원본
          </button>
        </td>
        <td>
          <button class="btn btn-sm btn-success btn-save-single-item" style="font-size: 11px; padding: 4px 8px; white-space: nowrap;">
            <i class="fa-solid fa-floppy-disk"></i> 개별저장
          </button>
        </td>
        <td>
          <button class="btn-danger-icon btn-remove-row" style="${isEditLocked ? 'display:none;' : ''}"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;

      const verifyBtn = tr.querySelector('.btn-verify-page');
      if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
          const pageNum = parseInt(item.pageNumber || (index + 1), 10);
          openOriginalViewerModal(pageNum);
        });
      }

      const saveSingleBtn = tr.querySelector('.btn-save-single-item');
      if (saveSingleBtn) {
        saveSingleBtn.addEventListener('click', async () => {
          const singleRiskItem = {
            workType: tr.querySelector('.item-work-type')?.value?.trim() || '',
            author: tr.querySelector('.item-author')?.value?.trim() || '',
            locationEquipment: tr.querySelector('.item-location')?.value?.trim() || '',
            workDateRange: tr.querySelector('.item-date-range')?.value?.trim() || '',
            riskFactor: tr.querySelector('.item-factor')?.value?.trim() || '',
            hazardType: tr.querySelector('.item-hazard-type')?.value?.trim() || '',
            frequency: tr.querySelector('.item-freq')?.value || '중',
            severity: tr.querySelector('.item-freq')?.value || '중',
            riskGrade: tr.querySelector('.item-grade')?.value || '중',
            managementTarget: tr.querySelector('.item-target')?.value || '일상',
            authorOpinion: tr.querySelector('.item-author-opinion')?.value?.trim() || '',
            meetingResult: tr.querySelector('.item-meeting-result')?.value?.trim() || '',
            safetyMeasure: [
              tr.querySelector('.item-author-opinion')?.value?.trim(),
              tr.querySelector('.item-meeting-result')?.value?.trim()
            ].filter(Boolean).join('\n')
          };

          const siteMetadata = {
            siteName: metaSiteName ? metaSiteName.value.trim() : '위험성평가 현장',
            monthWeek: document.getElementById('meta-month-week')?.value?.trim() || '',
            assessmentDate: metaDate ? metaDate.value : '',
            workPeriod: document.getElementById('meta-work-period')?.value?.trim() || '',
            assessor: singleRiskItem.author || (metaAssessor ? metaAssessor.value.trim() : ''),
            siteManager: document.getElementById('meta-site-manager')?.value?.trim() || '',
            workType: singleRiskItem.workType
          };

          const itemCorrections = collectRowCorrections(tr);

          try {
            saveSingleBtn.disabled = true;
            saveSingleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중';

            const response = await fetch('/api/assessments/single-item', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteMetadata,
                riskItem: singleRiskItem,
                corrections: itemCorrections,
                rawOcrText: currentOcrData ? currentOcrData.rawText : '',
                pdfFilename: uploadedFileInfo ? uploadedFileInfo.filename : ''
              })
            });

            const resData = await response.json();
            if (resData.success) {
              showToast(`[${singleRiskItem.workType} - ${singleRiskItem.author}] 위험성평가 개별 DB 저장 & 지식 축적 완료!`, 'success');
              saveSingleBtn.className = 'btn btn-sm btn-secondary';
              saveSingleBtn.innerHTML = '<i class="fa-solid fa-check"></i> 저장완료';
              tr.style.backgroundColor = '#f0fdf4';
            } else {
              showToast(resData.error || '개별 저장 실패', 'danger');
              saveSingleBtn.disabled = false;
              saveSingleBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 개별저장';
            }
          } catch (err) {
            showToast('서버 연결 실패: ' + err.message, 'danger');
            saveSingleBtn.disabled = false;
            saveSingleBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 개별저장';
          }
        });
      }

      tr.querySelector('.btn-remove-row').addEventListener('click', () => tr.remove());
      riskItemsTbody.appendChild(tr);
    });

    applyLockState();
  }

  // --- ORIGINAL HANDWRITING VIEWER MODAL LOGIC ---
  const modalOriginalViewer = document.getElementById('modal-original-viewer');
  const modalPageTitle = document.getElementById('modal-page-title');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnRotate = document.getElementById('btn-rotate');
  const modalZoomLevel = document.getElementById('modal-zoom-level');
  const pdfModalCanvas = document.getElementById('pdf-modal-canvas');
  const imageModalView = document.getElementById('image-modal-view');

  let currentModalScale = 1.2;
  let currentModalRotation = 0;
  let currentActivePage = 1;
  let loadedPdfDoc = null;

  async function openOriginalViewerModal(pageNum) {
    if (!uploadedFileInfo) {
      showToast('업로드된 원본 파일 정보가 없습니다.', 'danger');
      return;
    }

    currentActivePage = pageNum || 1;
    currentModalScale = 1.2;
    currentModalRotation = 0;
    updateZoomLabel();

    modalPageTitle.innerHTML = `<i class="fa-solid fa-file-signature" style="color: #2563eb;"></i> 원본 손글씨 수기 문서 대조 (페이지 ${currentActivePage})`;
    if (modalOriginalViewer) modalOriginalViewer.classList.remove('hidden');

    if (uploadedFileInfo.isPdf && window.pdfjsLib) {
      if (imageModalView) imageModalView.style.display = 'none';
      if (pdfModalCanvas) pdfModalCanvas.style.display = 'inline-block';
      await renderPdfModalPage(currentActivePage);
    } else {
      if (pdfModalCanvas) pdfModalCanvas.style.display = 'none';
      if (imageModalView) {
        imageModalView.style.display = 'inline-block';
        const imgUrl = (uploadedFileInfo.imageUrls && uploadedFileInfo.imageUrls[currentActivePage - 1]) || uploadedFileInfo.fileUrl;
        imageModalView.src = imgUrl;
        imageModalView.style.transform = `scale(${currentModalScale}) rotate(${currentModalRotation}deg)`;
      }
    }
  }

  async function renderPdfModalPage(pageNum) {
    try {
      if (!loadedPdfDoc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        loadedPdfDoc = await pdfjsLib.getDocument(uploadedFileInfo.fileUrl).promise;
      }
      const page = await loadedPdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentModalScale, rotation: currentModalRotation });
      const context = pdfModalCanvas.getContext('2d');
      pdfModalCanvas.height = viewport.height;
      pdfModalCanvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
    } catch (err) {
      console.warn('[PDF Modal Render Warning]', err);
    }
  }

  function updateZoomLabel() {
    if (modalZoomLevel) modalZoomLevel.textContent = `${Math.round(currentModalScale * 100)}%`;
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      if (modalOriginalViewer) modalOriginalViewer.classList.add('hidden');
    });
  }

  if (modalOriginalViewer) {
    modalOriginalViewer.addEventListener('click', (e) => {
      if (e.target === modalOriginalViewer) modalOriginalViewer.classList.add('hidden');
    });
  }

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', async () => {
      currentModalScale += 0.25;
      updateZoomLabel();
      if (uploadedFileInfo && uploadedFileInfo.isPdf) {
        await renderPdfModalPage(currentActivePage);
      } else if (imageModalView) {
        imageModalView.style.transform = `scale(${currentModalScale}) rotate(${currentModalRotation}deg)`;
      }
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', async () => {
      if (currentModalScale > 0.5) {
        currentModalScale -= 0.25;
        updateZoomLabel();
        if (uploadedFileInfo && uploadedFileInfo.isPdf) {
          await renderPdfModalPage(currentActivePage);
        } else if (imageModalView) {
          imageModalView.style.transform = `scale(${currentModalScale}) rotate(${currentModalRotation}deg)`;
        }
      }
    });
  }

  if (btnRotate) {
    btnRotate.addEventListener('click', async () => {
      currentModalRotation = (currentModalRotation + 90) % 360;
      if (uploadedFileInfo && uploadedFileInfo.isPdf) {
        await renderPdfModalPage(currentActivePage);
      } else if (imageModalView) {
        imageModalView.style.transform = `scale(${currentModalScale}) rotate(${currentModalRotation}deg)`;
      }
    });
  }

  btnAddRiskItem.addEventListener('click', () => {
    const newItem = {
      workType: '공종',
      author: '',
      locationEquipment: '',
      workDateRange: '',
      riskFactor: '',
      hazardType: '전도',
      frequency: '중',
      riskGrade: '하',
      managementTarget: '일상',
      authorOpinion: '',
      meetingResult: '',
      safetyMeasure: ''
    };
    const currentItems = getRiskItemsFromTable();
    currentItems.push(newItem);
    renderRiskItemsTable(currentItems);
  });

  function getRiskItemsFromTable() {
    const rows = riskItemsTbody.querySelectorAll('tr');
    const items = [];
    rows.forEach(tr => {
      const authorOpinionVal = tr.querySelector('.item-author-opinion')?.value?.trim() || '';
      const meetingResultVal = tr.querySelector('.item-meeting-result')?.value?.trim() || '';
      const combinedMeasure = [
        authorOpinionVal ? `[작성자의견] ${authorOpinionVal}` : '',
        meetingResultVal ? `[회의결과] ${meetingResultVal}` : ''
      ].filter(Boolean).join('\n');

      items.push({
        workType: tr.querySelector('.item-work-type')?.value?.trim() || '',
        author: tr.querySelector('.item-author')?.value?.trim() || '',
        locationEquipment: tr.querySelector('.item-location').value.trim(),
        workDateRange: tr.querySelector('.item-date-range').value.trim(),
        riskFactor: tr.querySelector('.item-factor').value.trim(),
        hazardType: tr.querySelector('.item-hazard-type').value.trim(),
        frequency: tr.querySelector('.item-freq').value,
        severity: tr.querySelector('.item-freq').value,
        riskGrade: tr.querySelector('.item-grade').value,
        managementTarget: tr.querySelector('.item-target').value,
        authorOpinion: authorOpinionVal,
        meetingResult: meetingResultVal,
        safetyMeasure: combinedMeasure || authorOpinionVal || meetingResultVal
      });
    });
    return items;
  }

  // Save Verified Assessment to DB
  btnSaveAssessment.addEventListener('click', async () => {
    const monthWeekVal = document.getElementById('meta-month-week')?.value?.trim() || '';
    const workPeriodVal = document.getElementById('meta-work-period')?.value?.trim() || '';
    const siteManagerVal = document.getElementById('meta-site-manager')?.value?.trim() || '';

    const siteMetadata = {
      siteName: metaSiteName ? metaSiteName.value.trim() : '',
      monthWeek: monthWeekVal,
      assessmentDate: metaDate ? metaDate.value : '',
      workPeriod: workPeriodVal,
      assessor: metaAssessor ? metaAssessor.value.trim() : '',
      siteManager: siteManagerVal,
      workType: metaWorkType ? metaWorkType.value : ''
    };

    const riskItems = getRiskItemsFromTable();

    if (!siteMetadata.siteName) {
      showToast('현장명을 입력하세요.', 'danger');
      return;
    }

    const allCorrections = [];
    const rows = riskItemsTbody.querySelectorAll('tr');
    rows.forEach(tr => {
      const rowCors = collectRowCorrections(tr);
      allCorrections.push(...rowCors);
    });

    try {
      const response = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteMetadata,
          riskItems,
          corrections: allCorrections,
          rawOcrText: currentOcrData ? currentOcrData.rawText : '',
          pdfFilename: uploadedFileInfo ? uploadedFileInfo.filename : ''
        })
      });

      const resData = await response.json();
      if (resData.success) {
        showToast('데이터베이스에 성공적으로 저장되었습니다!', 'success');
        switchTab('analytics');
      } else {
        showToast(resData.error || '저장 실패', 'danger');
      }
    } catch (err) {
      showToast('서버 저장 실패: ' + err.message, 'danger');
    }
  });

  // --- ANALYTICS DASHBOARD ---
  async function loadAnalyticsData() {
    try {
      const response = await fetch('/api/analytics/preventive-risks');
      const result = await response.json();

      if (result.success && result.data) {
        renderAnalyticsView(result.data);
      }
    } catch (err) {
      console.error('[Analytics Load Error]', err);
    }
  }

  function renderAnalyticsView(data) {
    const s = data.summary;
    document.getElementById('stat-total-assessments').textContent = s.totalAssessments || 0;
    document.getElementById('stat-total-risks').textContent = s.totalRiskItems || 0;
    document.getElementById('stat-high-risks').textContent = s.highRiskCount || 0;
    document.getElementById('stat-high-ratio').textContent = `${s.highRiskRatioPercent || 0}%`;

    // High Risk Alerts Banner
    const alertList = document.getElementById('high-risk-alert-list');
    alertList.innerHTML = '';
    if (data.highRiskAlerts && data.highRiskAlerts.length > 0) {
      data.highRiskAlerts.forEach(alert => {
        const div = document.createElement('div');
        div.className = 'alert-item';
        div.innerHTML = `
          <div>
            <div class="alert-item-title">[${escapeHtml(alert.workType)}] ${escapeHtml(alert.siteName)} - ${escapeHtml(alert.locationEquipment)}</div>
            <div class="alert-item-desc">⚠️ 위험요인: ${escapeHtml(alert.riskFactor)} (위험성: ${alert.riskGrade})</div>
          </div>
          <div>
            <span class="badge badge-danger">조치: ${escapeHtml(alert.safetyMeasure.substring(0, 30))}...</span>
          </div>
        `;
        alertList.appendChild(div);
      });
    } else {
      alertList.innerHTML = '<div class="alert-item"><div class="alert-item-title">현재 감지된 고위험(상) 항목이 없습니다.</div></div>';
    }

    // Top Recurring Risks
    const recurringContainer = document.getElementById('top-recurring-risks-container');
    recurringContainer.innerHTML = '';
    (data.topRecurringRisks || []).forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'recurring-risk-card';
      card.innerHTML = `
        <div class="recurring-risk-header">
          <span>#${i + 1} [${escapeHtml(item.workType)}] ${escapeHtml(item.riskFactor)}</span>
          <span class="badge badge-danger">빈출 ${item.count}회</span>
        </div>
        <div style="font-size: 12px; color: #64748b;">📍 위치/장비: ${escapeHtml((item.locations || []).join(', '))}</div>
        <div class="recurring-risk-measures">💡 권장 예방대책: ${escapeHtml((item.recommendedMeasures || []).join(' / '))}</div>
      `;
      recurringContainer.appendChild(card);
    });

    // Work Type Bars
    const barsContainer = document.getElementById('worktype-bars-container');
    barsContainer.innerHTML = '';
    const maxRisks = Math.max(...(data.workTypeDistribution || []).map(w => w.totalRisks), 1);

    (data.workTypeDistribution || []).forEach(w => {
      const pct = Math.round((w.totalRisks / maxRisks) * 100);
      const div = document.createElement('div');
      div.className = 'worktype-row';
      div.innerHTML = `
        <div class="worktype-label">
          <span>${escapeHtml(w.workType)}</span>
          <span>총 ${w.totalRisks}건 (고위험 ${w.highRisks}건)</span>
        </div>
        <div class="worktype-bar-bg">
          <div class="worktype-bar-fill" style="width: ${pct}%;"></div>
        </div>
      `;
      barsContainer.appendChild(div);
    });

    // Proactive Guidelines Cards
    const guidelinesContainer = document.getElementById('proactive-guidelines-container');
    guidelinesContainer.innerHTML = '';
    (data.proactiveGuidelines || []).forEach(g => {
      const card = document.createElement('div');
      card.className = 'guideline-card';
      card.innerHTML = `
        <span class="badge badge-info">${escapeHtml(g.category)}</span>
        <h4>${escapeHtml(g.title)}</h4>
        <p>${escapeHtml(g.description)}</p>
        <ul class="guideline-checklist">
          ${(g.actionItems || []).map(act => `<li><i class="fa-solid fa-square-check"></i> ${escapeHtml(act)}</li>`).join('')}
        </ul>
      `;
      guidelinesContainer.appendChild(card);
    });
  }

  // --- SEED SAMPLE DATA ---
  async function seedSampleData() {
    try {
      const response = await fetch('/api/analytics/seed-sample', { method: 'POST' });
      const res = await response.json();
      if (res.success) {
        showToast('샘플 위험성평가 3건이 DB에 시딩되었습니다.', 'success');
        loadAnalyticsData();
        switchTab('analytics');
      }
    } catch (err) {
      showToast('시딩 오류: ' + err.message, 'danger');
    }
  }

  // --- ASSESSMENT HISTORY DATABASE ---
  async function loadAssessmentHistory() {
    try {
      const response = await fetch('/api/assessments');
      const res = await response.json();
      if (res.success) {
        renderHistoryTable(res.data || []);
      }
    } catch (err) {
      console.error('[History Load Error]', err);
    }
  }

  btnRefreshHistory.addEventListener('click', () => loadAssessmentHistory());

  const btnResetHistory = document.getElementById('btn-reset-history');
  if (btnResetHistory) {
    btnResetHistory.addEventListener('click', async () => {
      if (!confirm('정말로 저장된 모든 평가 데이터베이스를 초기화하시겠습니까?')) {
        return;
      }
      try {
        const response = await fetch('/api/assessments/reset', { method: 'POST' });
        const res = await response.json();
        if (res.success) {
          showToast('모든 평가 데이터베이스가 초기화되었습니다.', 'success');
          loadAssessmentHistory();
          loadAnalyticsData();
        } else {
          showToast(res.error || '초기화 실패', 'danger');
        }
      } catch (err) {
        showToast('초기화 요청 실패: ' + err.message, 'danger');
      }
    });
  }

  function renderHistoryTable(assessments) {
    historyTbody.innerHTML = '';
    if (assessments.length === 0) {
      historyTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8;">저장된 평가 기록이 없습니다.</td></tr>';
      return;
    }

    assessments.forEach(ass => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(ass.assessmentDate)}</td>
        <td><strong>${escapeHtml(ass.siteName)}</strong></td>
        <td>${escapeHtml(ass.workType)}</td>
        <td>${escapeHtml(ass.assessor)}</td>
        <td><span class="badge badge-info">${(ass.riskItems || []).length}개 항목</span></td>
        <td><span class="badge badge-success">${ass.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline btn-delete-history" data-id="${ass.id}"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;

      tr.querySelector('.btn-delete-history').addEventListener('click', async () => {
        if (confirm('이 평가 기록을 삭제하시겠습니까?')) {
          await fetch(`/api/assessments/${ass.id}`, { method: 'DELETE' });
          showToast('삭제되었습니다.', 'success');
          loadAssessmentHistory();
        }
      });

      historyTbody.appendChild(tr);
    });
  }

  // --- ADMIN MODE & AI LEARNING LOGIC ---
  async function loadAdminLearningData() {
    try {
      const response = await fetch('/api/admin/learning-summary');
      const res = await response.json();
      if (res.success && res.data) {
        renderAdminDashboard(res.data);
      }
    } catch (err) {
      console.error('[Admin Load Error]', err);
    }
  }

  function renderAdminDashboard(data) {
    const s = data.stats || {};
    const statCor = document.getElementById('admin-stat-corrections');
    const statVoc = document.getElementById('admin-stat-vocab');
    const statUsr = document.getElementById('admin-stat-user-terms');

    if (statCor) statCor.textContent = s.totalCorrections || 0;
    if (statVoc) statVoc.textContent = s.totalVocabulary || 0;
    if (statUsr) statUsr.textContent = s.userAddedTermsCount || 0;

    // Render Corrections Table
    const tbody = document.getElementById('admin-corrections-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const corrections = data.corrections || [];

      if (corrections.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">아직 저장된 AI 오답 교정 지침이 없습니다. 사용자가 수동 보정 후 저장하면 자동 축적됩니다.</td></tr>';
      } else {
        corrections.forEach(cor => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><span style="color: #ef4444; font-weight: 600;"><i class="fa-solid fa-xmark"></i> ${escapeHtml(cor.rawSnippet)}</span></td>
            <td><span style="color: #10b981; font-weight: 600;"><i class="fa-solid fa-check"></i> ${escapeHtml(cor.correctedSnippet)}</span></td>
            <td><span class="badge badge-info" style="font-size: 11px;">${escapeHtml(cor.category)}</span></td>
            <td><span class="badge badge-warning" style="font-size: 11px;">${cor.count}회 적용</span></td>
            <td>
              <button class="btn btn-sm btn-outline btn-delete-correction" data-id="${cor.id}" style="color: #ef4444; border-color: #fca5a5; font-size: 11px;">
                <i class="fa-solid fa-trash-can"></i> 삭제
              </button>
            </td>
          `;

          tr.querySelector('.btn-delete-correction').addEventListener('click', async () => {
            if (confirm(`'${cor.rawSnippet} ➔ ${cor.correctedSnippet}' 교정 지침을 삭제하시겠습니까?`)) {
              await fetch(`/api/admin/corrections/${cor.id}`, { method: 'DELETE' });
              showToast('교정 지침이 삭제되었습니다.', 'success');
              loadAdminLearningData();
            }
          });

          tbody.appendChild(tr);
        });
      }
    }

    // Render Terms Tag Cloud
    const cloud = document.getElementById('admin-terms-cloud');
    if (cloud) {
      cloud.innerHTML = '';
      const terms = data.userGlossary || data.learnedTerms || [];

      if (terms.length === 0) {
        cloud.innerHTML = '<span style="font-size: 12px; color: #94a3b8;">축적된 맞춤 용어가 없습니다.</span>';
      } else {
        terms.forEach(t => {
          const span = document.createElement('span');
          span.className = 'badge badge-outline';
          span.style.cssText = 'background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 12px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px; color: #334155; margin-bottom: 4px;';
          span.innerHTML = `
            <span>${escapeHtml(t)}</span>
            <i class="fa-solid fa-xmark btn-remove-term" style="cursor: pointer; color: #ef4444;" title="용어 삭제"></i>
          `;

          span.querySelector('.btn-remove-term').addEventListener('click', async () => {
            await fetch('/api/admin/terms', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ term: t })
            });
            showToast(`'${t}' 용어가 지식베이스에서 삭제되었습니다.`, 'success');
            loadAdminLearningData();
          });

          cloud.appendChild(span);
        });
      }
    }
  }

  // Admin Actions: Manual Correction Rule Registration
  const btnAddCorrectionRule = document.getElementById('btn-add-correction-rule');
  if (btnAddCorrectionRule) {
    btnAddCorrectionRule.addEventListener('click', async () => {
      const rawSnippet = document.getElementById('admin-raw-snippet')?.value?.trim();
      const correctedSnippet = document.getElementById('admin-corrected-snippet')?.value?.trim();
      const category = document.getElementById('admin-category')?.value || 'GENERAL';

      if (!rawSnippet || !correctedSnippet) {
        showToast('최초 오인식 문구와 사용자의 정답 문구를 모두 입력해 주세요.', 'danger');
        return;
      }

      try {
        const response = await fetch('/api/admin/corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawSnippet, correctedSnippet, category })
        });
        const res = await response.json();
        if (res.success) {
          showToast(res.message, 'success');
          document.getElementById('admin-raw-snippet').value = '';
          document.getElementById('admin-corrected-snippet').value = '';
          loadAdminLearningData();
        } else {
          showToast(res.error || '등록 실패', 'danger');
        }
      } catch (err) {
        showToast('서버 연결 실패: ' + err.message, 'danger');
      }
    });
  }

  // Admin Actions: Custom Term Registration
  const btnAddCustomTerm = document.getElementById('btn-add-custom-term');
  if (btnAddCustomTerm) {
    btnAddCustomTerm.addEventListener('click', async () => {
      const term = document.getElementById('admin-new-term')?.value?.trim();
      if (!term) {
        showToast('등록할 용어를 입력하세요.', 'danger');
        return;
      }

      try {
        const response = await fetch('/api/admin/terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term })
        });
        const res = await response.json();
        if (res.success) {
          showToast(res.message, 'success');
          document.getElementById('admin-new-term').value = '';
          loadAdminLearningData();
        } else {
          showToast(res.error || '등록 실패', 'danger');
        }
      } catch (err) {
        showToast('서버 연결 실패: ' + err.message, 'danger');
      }
    });
  }

  const btnRefreshAdmin = document.getElementById('btn-refresh-admin');
  if (btnRefreshAdmin) {
    btnRefreshAdmin.addEventListener('click', () => loadAdminLearningData());
  }

  // --- UTILS & TOASTS ---
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'circle-check' : 'circle-exclamation'}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function getBadgeClass(grade) {
    const g = (grade || '').toUpperCase();
    if (g === '상' || g === 'HIGH' || g === 'RED') return 'badge-danger';
    if (g === '중' || g === 'MEDIUM' || g === 'YELLOW') return 'badge-warning';
    return 'badge-success';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});

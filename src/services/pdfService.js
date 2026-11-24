const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Service to process uploaded PDF files and extract text/pages safely
 */
class PdfService {
  constructor() {
    this.uploadDir = config.uploadDir;
    this.imagesDir = path.join(this.uploadDir, 'images');

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
  }

  /**
   * Split a multi-page PDF into individual 1-page sub-PDF files using pdf-lib in milliseconds
   * @param {string} filePath Absolute path to source PDF
   * @returns {Promise<{pageCount: number, pages: Array<{pageNumber: number, filePath: string, relPath: string}>}>}
   */
  async splitPdfToSubPdfs(filePath) {
    const { PDFDocument } = require('pdf-lib');
    const pdfBytes = fs.readFileSync(filePath);
    const srcDoc = await PDFDocument.load(pdfBytes);
    const pageCount = srcDoc.getPageCount();

    const pages = [];
    if (pageCount === 1) {
      // Fast zero-copy path when client already split into a 1-page PDF
      pages.push({
        pageNumber: 1,
        filePath,
        relPath: `/uploads/${path.basename(filePath)}`
      });
      return { pageCount: 1, pages };
    }

    for (let i = 0; i < pageCount; i++) {
      const subDoc = await PDFDocument.create();
      const [copiedPage] = await subDoc.copyPages(srcDoc, [i]);
      subDoc.addPage(copiedPage);
      const subBytes = await subDoc.save();

      const pageFileName = `${path.parse(filePath).name}_p${i + 1}.pdf`;
      const pagePath = path.join(this.imagesDir, pageFileName);
      fs.writeFileSync(pagePath, Buffer.from(subBytes));

      pages.push({
        pageNumber: i + 1,
        filePath: pagePath,
        relPath: `/uploads/images/${pageFileName}`
      });
    }

    return { pageCount, pages };
  }

  /**
   * Processes an uploaded file (PDF or Image)
   * @param {Object} file Multer file object
   * @returns {Promise<Object>} Processed file metadata, extracted text, and image paths
   */
  async processUploadedFile(file) {
    if (!file) {
      throw new Error('업로드된 파일이 없습니다.');
    }

    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      return await this.processPdf(file.path, file.filename, file.originalname);
    } else {
      // If it's already an image (PNG, JPG, JPEG)
      const imagePath = path.join(this.imagesDir, file.filename);
      fs.copyFileSync(file.path, imagePath);

      return {
        originalName: file.originalname,
        filename: file.filename,
        isPdf: false,
        pageCount: 1,
        imagePaths: [imagePath],
        relImagePaths: [`/uploads/images/${file.filename}`],
        extractedText: ''
      };
    }
  }

  /**
   * Reads PDF document using pdfjs-dist and extracts digital text safely
   * @param {string} filePath Path to PDF
   * @param {string} filename Filename
   * @param {string} originalName Original Filename
   */
  async processPdf(filePath, filename, originalName) {
    try {
      const { pageCount, pages } = await this.splitPdfToSubPdfs(filePath);

      let fullText = '';
      // Skip heavy pdfjs-dist digital text parsing when Gemini Vision OCR is primary engine
      if (config.ocrProvider && config.ocrProvider.toLowerCase() !== 'gemini') {
        try {
          const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
          const pdfBuffer = fs.readFileSync(filePath);
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(pdfBuffer),
            useSystemFonts: true,
            isEvalSupported: false
          });

          const pdfDoc = await loadingTask.promise;
          for (let i = 1; i <= pageCount; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageStrings = textContent.items.map(item => item.str).filter(Boolean);
            const pageText = pageStrings.join(' ').trim();

            if (pageText.length > 0) {
              fullText += `\n--- [페이지 ${i} 디지털 텍스트] ---\n` + pageText + '\n';
            }
          }
        } catch (textErr) {
          console.warn('[PDF Text Extract Warning]', textErr.message);
        }
      }

      return {
        originalName: originalName || filename,
        filename,
        isPdf: true,
        pageCount,
        imagePaths: pages.map(p => p.filePath),
        relImagePaths: pages.map(p => p.relPath),
        extractedText: fullText.trim()
      };
    } catch (err) {
      console.error('[PDF Service Error]', err);
      throw new Error(`PDF 문서 처리 중 오류가 발생했습니다: ${err.message}`);
    }
  }
}

module.exports = new PdfService();

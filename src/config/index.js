const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const isVercel = Boolean(process.env.VERCEL);
const uploadDir = isVercel
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, '../../uploads');

module.exports = {
  port: process.env.PORT || 3002,
  databaseUrl: process.env.DATABASE_URL || (isVercel ? `file:${path.join(os.tmpdir(), 'dev.db')}` : 'file:./dev.db'),
  ocrProvider: process.env.OCR_PROVIDER || 'auto',
  googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_VISION_API_KEY || '',
  clovaOcrUrl: process.env.CLOVA_OCR_URL || '',
  clovaOcrSecret: process.env.CLOVA_OCR_SECRET || '',
  aiProvider: process.env.AI_PROVIDER || 'auto',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  uploadDir,
};

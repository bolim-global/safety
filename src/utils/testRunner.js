const ocrService = require('../services/ocrService');
const aiService = require('../services/aiService');
const analyticsService = require('../services/analyticsService');

async function testPipeline() {
  console.log('--- Testing Construction Safety OCR & AI Pipeline ---');
  
  // 1. OCR Extraction Test
  const ocrResult = await ocrService.extractText('sample_assessment.png');
  console.log('\n[1. OCR Extraction Result]');
  console.log(`Provider: ${ocrResult.provider}`);
  console.log(`Confidence: ${ocrResult.confidenceScore}`);
  console.log(`Raw Text Preview:\n${ocrResult.rawText.substring(0, 150)}...\n`);

  // 2. AI Structuring Test
  const structured = await aiService.structureSafetyAssessment(ocrResult.rawText);
  console.log('[2. AI Structuring Result]');
  console.log('Site Metadata:', structured.siteMetadata);
  console.log('Risk Items Count:', structured.riskItems.length);
  console.log('First Risk Item:', structured.riskItems[0]);

  // 3. Analytics Insights Test
  const insights = await analyticsService.getPreventiveRiskInsights();
  console.log('\n[3. Preventive Analytics Insights]');
  console.log('Total Assessments:', insights.summary.totalAssessments);
  console.log('High Risk Items Count:', insights.summary.highRiskCount);
  console.log('Top Recurring Hazard #1:', insights.topRecurringRisks[0]);

  console.log('\n✅ Pipeline verification complete!');
}

testPipeline().catch(console.error);

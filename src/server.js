const app = require('./app');
const config = require('./config');

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Construction Safety Risk Assessment Server Running!`);
  console.log(`🔊 Listening on http://localhost:${PORT}`);
  console.log(`📋 OCR Provider: ${config.ocrProvider.toUpperCase()}`);
  console.log(`🤖 AI Engine Provider: ${config.aiProvider.toUpperCase()}`);
  console.log(`=======================================================`);
});

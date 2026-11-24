const express = require('express');
const path = require('path');
const cors = require('cors');

const uploadRoutes = require('./routes/upload');
const assessmentRoutes = require('./routes/assessments');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const config = require('./config');

// Static Asset Directories
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(config.uploadDir));

// API Routes
app.use('/api/assessments', uploadRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', system: 'Construction Safety Risk Assessment OCR & Insight Engine', timestamp: new Date() });
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;

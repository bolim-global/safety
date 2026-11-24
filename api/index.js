const fs = require('fs');
const path = require('path');
const os = require('os');

// On Vercel Serverless (read-only filesystem except /tmp), copy initial SQLite DB to /tmp/dev.db
if (process.env.VERCEL) {
  const tmpDbPath = path.join(os.tmpdir(), 'dev.db');
  const bundledDbPath = path.join(__dirname, '../prisma/dev.db');

  if (!fs.existsSync(tmpDbPath) && fs.existsSync(bundledDbPath)) {
    try {
      fs.copyFileSync(bundledDbPath, tmpDbPath);
    } catch (err) {
      console.warn('[Vercel Init] Could not copy bundled dev.db to /tmp:', err.message);
    }
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:./')) {
    process.env.DATABASE_URL = `file:${tmpDbPath}`;
  }
}

const app = require('../src/app');
module.exports = app;

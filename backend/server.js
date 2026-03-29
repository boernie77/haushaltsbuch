require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { sequelize } = require('./src/models');
const { migrate } = require('./src/utils/migrate');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/households', require('./src/routes/households'));
app.use('/api/transactions', require('./src/routes/transactions'));
app.use('/api/categories', require('./src/routes/categories'));
app.use('/api/budgets', require('./src/routes/budgets'));
app.use('/api/statistics', require('./src/routes/statistics'));
app.use('/api/paperless', require('./src/routes/paperless'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/ocr', require('./src/routes/ocr'));
app.use('/api/backup', require('./src/routes/backup'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Start: run migrations, then listen, then start cron
migrate(sequelize)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Haushaltsbuch API running on port ${PORT}`);
    });
    // Start backup cron job if configured
    const { startCron } = require('./src/services/cronService');
    startCron().catch(e => console.error('[cron]', e.message));
  })
  .catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });

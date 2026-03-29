require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { sequelize } = require('./src/models');

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start
sequelize.sync({ alter: process.env.NODE_ENV !== 'production' }).then(() => {
  app.listen(PORT, () => {
    console.log(`Haushaltsbuch API running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

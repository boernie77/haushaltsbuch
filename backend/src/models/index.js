const { Sequelize, DataTypes } = require('sequelize');
const { encrypt, decrypt } = require('../utils/encrypt');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV !== 'production' ? console.log : false,
  pool: { max: 20, min: 2, acquire: 30000, idle: 10000 }
});

// ── User ────────────────────────────────────────────────────────────────────
const User = sequelize.define('User', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:         { type: DataTypes.STRING, allowNull: false },
  email:        { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  password:     { type: DataTypes.STRING, allowNull: false },
  role:         { type: DataTypes.ENUM('superadmin', 'admin', 'member'), defaultValue: 'member' },
  theme:        { type: DataTypes.ENUM('feminine', 'masculine'), defaultValue: 'feminine' },
  avatar:       { type: DataTypes.STRING, allowNull: true },
  isActive:            { type: DataTypes.BOOLEAN, defaultValue: true },
  lastLoginAt:         { type: DataTypes.DATE, allowNull: true },
  inviteCode:          { type: DataTypes.STRING, allowNull: true },
  aiKeyGranted:        { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'Admin hat diesem User den globalen AI-Key freigegeben' },
}, { tableName: 'users', timestamps: true });

// ── Household ────────────────────────────────────────────────────────────────
const Household = sequelize.define('Household', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:           { type: DataTypes.STRING, allowNull: false },
  description:    { type: DataTypes.TEXT, allowNull: true },
  currency:       { type: DataTypes.STRING(3), defaultValue: 'EUR' },
  monthlyBudget:  { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  budgetWarningAt: { type: DataTypes.INTEGER, defaultValue: 80, comment: 'Warn at X% of budget' },
  isShared:              { type: DataTypes.BOOLEAN, defaultValue: false },
  adminUserId:           { type: DataTypes.UUID, allowNull: false },
  anthropicApiKey:       { type: DataTypes.TEXT, allowNull: true,
    get() { return decrypt(this.getDataValue('anthropicApiKey')); },
    set(v) { this.setDataValue('anthropicApiKey', encrypt(v)); }
  },
  aiEnabled:             { type: DataTypes.BOOLEAN, defaultValue: false },
  emailReportsEnabled:   { type: DataTypes.BOOLEAN, defaultValue: false },
  monthStartDay:         { type: DataTypes.INTEGER, defaultValue: 1, comment: 'Day of month the budget period starts (1-28)' },
}, { tableName: 'households', timestamps: true });

// ── HouseholdMember ──────────────────────────────────────────────────────────
const HouseholdMember = sequelize.define('HouseholdMember', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId: { type: DataTypes.UUID, allowNull: false },
  userId:      { type: DataTypes.UUID, allowNull: false },
  role:        { type: DataTypes.ENUM('admin', 'member', 'viewer'), defaultValue: 'member' },
  joinedAt:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'household_members', timestamps: false });

// ── Category ─────────────────────────────────────────────────────────────────
const Category = sequelize.define('Category', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:         { type: DataTypes.STRING, allowNull: false },
  nameDE:       { type: DataTypes.STRING, allowNull: true },
  icon:         { type: DataTypes.STRING, allowNull: false },
  color:        { type: DataTypes.STRING(7), defaultValue: '#6B7280' },
  isSystem:     { type: DataTypes.BOOLEAN, defaultValue: true },
  householdId:  { type: DataTypes.UUID, allowNull: true, comment: 'null = global system category' },
  sortOrder:    { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'categories', timestamps: true });

// ── Transaction ───────────────────────────────────────────────────────────────
const Transaction = sequelize.define('Transaction', {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  amount:          { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  description:     { type: DataTypes.STRING, allowNull: true },
  note:            { type: DataTypes.TEXT, allowNull: true },
  date:            { type: DataTypes.DATEONLY, allowNull: false },
  type:            { type: DataTypes.ENUM('expense', 'income'), defaultValue: 'expense' },
  categoryId:      { type: DataTypes.UUID, allowNull: true },
  householdId:     { type: DataTypes.UUID, allowNull: false },
  userId:          { type: DataTypes.UUID, allowNull: false },
  receiptImage:    { type: DataTypes.STRING, allowNull: true },
  receiptRaw:      { type: DataTypes.TEXT, allowNull: true, comment: 'Raw OCR text' },
  paperlessDocId:      { type: DataTypes.INTEGER, allowNull: true },
  paperlessMetadata:   { type: DataTypes.TEXT, allowNull: true },
  isConfirmed:     { type: DataTypes.BOOLEAN, defaultValue: true, comment: 'False = OCR suggestion pending review' },
  merchant:        { type: DataTypes.STRING, allowNull: true },
  tags:            { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
  isRecurring:        { type: DataTypes.BOOLEAN, defaultValue: false },
  recurringInterval:  { type: DataTypes.STRING(20), allowNull: true, comment: 'weekly | monthly | yearly' },
  recurringDay:       { type: DataTypes.INTEGER, allowNull: true, comment: 'Day of month (1-28) for monthly' },
  recurringNextDate:  { type: DataTypes.DATEONLY, allowNull: true },
  isPersonal:         { type: DataTypes.BOOLEAN, defaultValue: false },
  targetHouseholdId:  { type: DataTypes.UUID, allowNull: true },
  tip:                { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
}, { tableName: 'transactions', timestamps: true });

// ── Budget ────────────────────────────────────────────────────────────────────
const Budget = sequelize.define('Budget', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId: { type: DataTypes.UUID, allowNull: false },
  categoryId:  { type: DataTypes.UUID, allowNull: true, comment: 'null = total household budget' },
  limitAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  month:       { type: DataTypes.INTEGER, allowNull: true },
  year:        { type: DataTypes.INTEGER, allowNull: false },
  warningAt:   { type: DataTypes.INTEGER, defaultValue: 80 },
}, { tableName: 'budgets', timestamps: true });

// ── PaperlessConfig ────────────────────────────────────────────────────────────
const PaperlessConfig = sequelize.define('PaperlessConfig', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId: { type: DataTypes.UUID, allowNull: false, unique: true },
  baseUrl:     { type: DataTypes.STRING, allowNull: false },
  apiToken:    { type: DataTypes.TEXT, allowNull: false,
    get() { return decrypt(this.getDataValue('apiToken')); },
    set(v) { this.setDataValue('apiToken', encrypt(v)); }
  },
  isActive:    { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'paperless_configs', timestamps: true });

// ── PaperlessDocumentType ────────────────────────────────────────────────────
const PaperlessDocumentType = sequelize.define('PaperlessDocumentType', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId:   { type: DataTypes.UUID, allowNull: false },
  paperlessId:   { type: DataTypes.INTEGER, allowNull: true },
  name:          { type: DataTypes.STRING, allowNull: false },
  isFavorite:    { type: DataTypes.BOOLEAN, defaultValue: false },
  syncedAt:      { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'paperless_document_types', timestamps: true });

// ── PaperlessCorrespondent ───────────────────────────────────────────────────
const PaperlessCorrespondent = sequelize.define('PaperlessCorrespondent', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId:   { type: DataTypes.UUID, allowNull: false },
  paperlessId:   { type: DataTypes.INTEGER, allowNull: true },
  name:          { type: DataTypes.STRING, allowNull: false },
  isFavorite:    { type: DataTypes.BOOLEAN, defaultValue: false },
  syncedAt:      { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'paperless_correspondents', timestamps: true });

// ── PaperlessTag ──────────────────────────────────────────────────────────────
const PaperlessTag = sequelize.define('PaperlessTag', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId:   { type: DataTypes.UUID, allowNull: false },
  paperlessId:   { type: DataTypes.INTEGER, allowNull: true },
  name:          { type: DataTypes.STRING, allowNull: false },
  color:         { type: DataTypes.STRING(7), allowNull: true },
  isFavorite:    { type: DataTypes.BOOLEAN, defaultValue: false },
  syncedAt:      { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'paperless_tags', timestamps: true });

// ── PaperlessUser ─────────────────────────────────────────────────────────────
const PaperlessUser = sequelize.define('PaperlessUser', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId:   { type: DataTypes.UUID, allowNull: false },
  paperlessId:   { type: DataTypes.INTEGER, allowNull: false },
  username:      { type: DataTypes.STRING, allowNull: false },
  fullName:      { type: DataTypes.STRING, allowNull: true },
  isEnabled:     { type: DataTypes.BOOLEAN, defaultValue: true },
  syncedAt:      { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'paperless_users', timestamps: true });

// ── BackupConfig ──────────────────────────────────────────────────────────────
const BackupConfig = sequelize.define('BackupConfig', {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  sftpHost:        { type: DataTypes.STRING, allowNull: true },
  sftpPort:        { type: DataTypes.INTEGER, defaultValue: 22 },
  sftpUser:        { type: DataTypes.STRING, allowNull: true },
  sftpPassword:    { type: DataTypes.TEXT, allowNull: true,
    get() { return decrypt(this.getDataValue('sftpPassword')); },
    set(v) { this.setDataValue('sftpPassword', encrypt(v)); }
  },
  sftpPath:        { type: DataTypes.STRING, defaultValue: '/backups' },
  schedule:        { type: DataTypes.STRING, allowNull: true },
  scheduleLabel:   { type: DataTypes.STRING, allowNull: true },
  isActive:        { type: DataTypes.BOOLEAN, defaultValue: false },
  lastRunAt:       { type: DataTypes.DATE, allowNull: true },
  lastRunStatus:   { type: DataTypes.STRING, allowNull: true },
  lastRunMessage:  { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'backup_configs', timestamps: true });

// ── GlobalSettings ────────────────────────────────────────────────────────────
// Single-row table (id = 'global') for app-wide settings managed by superadmin
const GlobalSettings = sequelize.define('GlobalSettings', {
  id:                  { type: DataTypes.STRING, primaryKey: true, defaultValue: 'global' },
  anthropicApiKey:     { type: DataTypes.TEXT, allowNull: true, comment: 'Central AI key set by superadmin',
    get() { return decrypt(this.getDataValue('anthropicApiKey')); },
    set(v) { this.setDataValue('anthropicApiKey', encrypt(v)); }
  },
  aiKeyPublic:         { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'If true, all users can use it; if false, only granted users' },
}, { tableName: 'global_settings', timestamps: true });

// ── SavingsGoal ───────────────────────────────────────────────────────────────
const SavingsGoal = sequelize.define('SavingsGoal', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  householdId:  { type: DataTypes.UUID, allowNull: false },
  name:         { type: DataTypes.STRING, allowNull: false },
  targetAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  savedAmount:  { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  targetDate:   { type: DataTypes.DATEONLY, allowNull: true },
  icon:         { type: DataTypes.STRING, defaultValue: '🎯' },
  color:        { type: DataTypes.STRING(7), defaultValue: '#E91E8C' },
  isCompleted:  { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'savings_goals', timestamps: true });

// ── TransactionSplit ──────────────────────────────────────────────────────────
const TransactionSplit = sequelize.define('TransactionSplit', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  transactionId: { type: DataTypes.UUID, allowNull: false },
  categoryId:    { type: DataTypes.UUID, allowNull: true },
  amount:        { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  description:   { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'transaction_splits', timestamps: true });

// ── InviteCode ────────────────────────────────────────────────────────────────
const InviteCode = sequelize.define('InviteCode', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code:        { type: DataTypes.STRING, allowNull: false, unique: true },
  // 'new_household' = registrant gets their own new household (admin codes)
  // 'add_member'    = registrant joins this specific household (household codes)
  type:        { type: DataTypes.STRING, defaultValue: 'add_member' },
  householdId: { type: DataTypes.UUID, allowNull: true },
  role:        { type: DataTypes.ENUM('admin', 'member', 'viewer'), defaultValue: 'member' },
  createdById: { type: DataTypes.UUID, allowNull: false },
  usedById:    { type: DataTypes.UUID, allowNull: true },
  usedAt:      { type: DataTypes.DATE, allowNull: true },
  expiresAt:   { type: DataTypes.DATE, allowNull: true },
  maxUses:     { type: DataTypes.INTEGER, defaultValue: 1 },
  useCount:    { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: 'invite_codes', timestamps: true });

// ── Associations ──────────────────────────────────────────────────────────────
Household.hasMany(HouseholdMember, { foreignKey: 'householdId' });
HouseholdMember.belongsTo(Household, { foreignKey: 'householdId' });
User.hasMany(HouseholdMember, { foreignKey: 'userId' });
HouseholdMember.belongsTo(User, { foreignKey: 'userId' });

Household.hasMany(Transaction, { foreignKey: 'householdId' });
Transaction.belongsTo(Household, { foreignKey: 'householdId' });
User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });
Category.hasMany(Transaction, { foreignKey: 'categoryId' });
Transaction.belongsTo(Category, { foreignKey: 'categoryId' });

Household.hasMany(Budget, { foreignKey: 'householdId' });
Budget.belongsTo(Category, { foreignKey: 'categoryId' });
Category.hasMany(Budget, { foreignKey: 'categoryId' });
Household.hasOne(PaperlessConfig, { foreignKey: 'householdId' });
Household.hasMany(PaperlessDocumentType, { foreignKey: 'householdId' });
Household.hasMany(PaperlessCorrespondent, { foreignKey: 'householdId' });
Household.hasMany(PaperlessTag, { foreignKey: 'householdId' });
Household.hasMany(PaperlessUser, { foreignKey: 'householdId' });
Household.hasMany(Category, { foreignKey: 'householdId' });

InviteCode.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });
InviteCode.belongsTo(User, { foreignKey: 'usedById', as: 'usedBy' });

Household.hasMany(SavingsGoal, { foreignKey: 'householdId' });
SavingsGoal.belongsTo(Household, { foreignKey: 'householdId' });

Transaction.hasMany(TransactionSplit, { foreignKey: 'transactionId', as: 'splits' });
TransactionSplit.belongsTo(Transaction, { foreignKey: 'transactionId' });
TransactionSplit.belongsTo(Category, { foreignKey: 'categoryId' });

module.exports = {
  sequelize,
  User,
  Household,
  HouseholdMember,
  Category,
  Transaction,
  TransactionSplit,
  Budget,
  SavingsGoal,
  PaperlessConfig,
  PaperlessDocumentType,
  PaperlessCorrespondent,
  PaperlessTag,
  PaperlessUser,
  GlobalSettings,
  InviteCode,
  BackupConfig,
};

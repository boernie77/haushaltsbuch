const { Sequelize, DataTypes } = require("sequelize");
const { encrypt, decrypt } = require("../utils/encrypt");

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "production" ? false : console.log,
  pool: { max: 20, min: 2, acquire: 30_000, idle: 10_000 },
});

// ── User ────────────────────────────────────────────────────────────────────
const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM("superadmin", "admin", "member"),
      defaultValue: "member",
    },
    theme: {
      type: DataTypes.ENUM(
        "feminine",
        "masculine",
        "professional-light",
        "professional-dark"
      ),
      defaultValue: "feminine",
    },
    avatar: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    inviteCode: { type: DataTypes.STRING, allowNull: true },
    aiKeyGranted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Admin hat diesem User den globalen AI-Key freigegeben",
    },
    subscriptionType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "trial | monthly | null",
    },
    trialStartedAt: { type: DataTypes.DATE, allowNull: true },
    trialEndsAt: { type: DataTypes.DATE, allowNull: true },
    subscriptionActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Superadmin hat Abo manuell aktiviert",
    },
    oidcSubject: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment:
        "OIDC sub claim (z.B. Email aus Authentik) — verlinkt SSO-Identität",
    },
  },
  { tableName: "users", timestamps: true }
);

// ── Household ────────────────────────────────────────────────────────────────
const Household = sequelize.define(
  "Household",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    currency: { type: DataTypes.STRING(3), defaultValue: "EUR" },
    monthlyBudget: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    budgetWarningAt: {
      type: DataTypes.INTEGER,
      defaultValue: 80,
      comment: "Warn at X% of budget",
    },
    isShared: { type: DataTypes.BOOLEAN, defaultValue: false },
    adminUserId: { type: DataTypes.UUID, allowNull: false },
    anthropicApiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        return decrypt(this.getDataValue("anthropicApiKey"));
      },
      set(v) {
        this.setDataValue("anthropicApiKey", encrypt(v));
      },
    },
    aiEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailReportsEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    monthStartDay: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Day of month the budget period starts (1-28)",
    },
    // Bank-Sync: Quellen für die automatische Zuordnung beim Import
    // (siehe utils/bankCategorizer.js). KI standardmäßig aus.
    bankSyncMatchQuickEntries: { type: DataTypes.BOOLEAN, defaultValue: true },
    bankSyncRulesEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    bankSyncAiEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    bankSyncAiModel: {
      type: DataTypes.TEXT,
      defaultValue: "claude-haiku-4-5",
    },
    bankSyncAiDescriptions: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { tableName: "households", timestamps: true }
);

// ── HouseholdMember ──────────────────────────────────────────────────────────
const HouseholdMember = sequelize.define(
  "HouseholdMember",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    role: {
      type: DataTypes.ENUM("admin", "member", "viewer"),
      defaultValue: "member",
    },
    joinedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: "household_members", timestamps: false }
);

// ── Category ─────────────────────────────────────────────────────────────────
const Category = sequelize.define(
  "Category",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    nameDE: { type: DataTypes.STRING, allowNull: true },
    icon: { type: DataTypes.STRING, allowNull: false },
    color: { type: DataTypes.STRING(7), defaultValue: "#6B7280" },
    isSystem: { type: DataTypes.BOOLEAN, defaultValue: true },
    householdId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "null = global system category",
    },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    hasSubAccount: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment:
        "Sammelkonto-Logik: Buchungen excludeFromStats, Settlement-Buchung",
    },
  },
  { tableName: "categories", timestamps: true }
);

// ── Transaction ───────────────────────────────────────────────────────────────
const Transaction = sequelize.define(
  "Transaction",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    type: {
      type: DataTypes.ENUM("expense", "income"),
      defaultValue: "expense",
    },
    categoryId: { type: DataTypes.UUID, allowNull: true },
    householdId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    receiptImage: { type: DataTypes.STRING, allowNull: true },
    receiptRaw: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Raw OCR text",
    },
    paperlessDocId: { type: DataTypes.INTEGER, allowNull: true },
    paperlessMetadata: { type: DataTypes.TEXT, allowNull: true },
    isConfirmed: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "False = OCR suggestion pending review",
    },
    merchant: { type: DataTypes.STRING, allowNull: true },
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    isRecurring: { type: DataTypes.BOOLEAN, defaultValue: false },
    recurringInterval: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "weekly | monthly | yearly",
    },
    recurringDay: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Day of month (1-28) for monthly",
    },
    recurringNextDate: { type: DataTypes.DATEONLY, allowNull: true },
    recurringSourceId: { type: DataTypes.UUID, allowNull: true },
    recurringEndDate: { type: DataTypes.DATEONLY, allowNull: true },
    isPersonal: { type: DataTypes.BOOLEAN, defaultValue: false },
    targetHouseholdId: { type: DataTypes.UUID, allowNull: true },
    tip: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    accountId: { type: DataTypes.UUID, allowNull: true },
    transferTargetAccountId: { type: DataTypes.UUID, allowNull: true },
    // Sub-Account-Felder (z.B. Spesen). subAccountPeriodMonth/Year ordnet
    // die Buchung einem Sammel-Zeitraum zu (kann ≠ Buchungs-Datum sein).
    subAccountPeriodMonth: { type: DataTypes.INTEGER, allowNull: true },
    subAccountPeriodYear: { type: DataTypes.INTEGER, allowNull: true },
    excludeFromStats: { type: DataTypes.BOOLEAN, defaultValue: false },
    isSubAccountSettlement: { type: DataTypes.BOOLEAN, defaultValue: false },
    affectsAccountBalance: { type: DataTypes.BOOLEAN, defaultValue: true },
    externalRef: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Dedup-Hash für Bank-Sync-Importe (siehe bankSync.js)",
    },
    pendingBankMatch: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment:
        "Schnellerfassung, die beim nächsten Bank-Import verschmolzen wird",
    },
  },
  { tableName: "transactions", timestamps: true }
);

// ── Budget ────────────────────────────────────────────────────────────────────
const Budget = sequelize.define(
  "Budget",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "null = total household budget",
    },
    limitAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: true },
    year: { type: DataTypes.INTEGER, allowNull: false },
    warningAt: { type: DataTypes.INTEGER, defaultValue: 80 },
  },
  { tableName: "budgets", timestamps: true }
);

// ── PaperlessConfig ────────────────────────────────────────────────────────────
const PaperlessConfig = sequelize.define(
  "PaperlessConfig",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false, unique: true },
    baseUrl: { type: DataTypes.STRING, allowNull: false },
    apiToken: {
      type: DataTypes.TEXT,
      allowNull: false,
      get() {
        return decrypt(this.getDataValue("apiToken"));
      },
      set(v) {
        this.setDataValue("apiToken", encrypt(v));
      },
    },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { tableName: "paperless_configs", timestamps: true }
);

// ── PaperlessDocumentType ────────────────────────────────────────────────────
const PaperlessDocumentType = sequelize.define(
  "PaperlessDocumentType",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    paperlessId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    isFavorite: { type: DataTypes.BOOLEAN, defaultValue: false },
    syncedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "paperless_document_types", timestamps: true }
);

// ── PaperlessCorrespondent ───────────────────────────────────────────────────
const PaperlessCorrespondent = sequelize.define(
  "PaperlessCorrespondent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    paperlessId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    isFavorite: { type: DataTypes.BOOLEAN, defaultValue: false },
    syncedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "paperless_correspondents", timestamps: true }
);

// ── PaperlessTag ──────────────────────────────────────────────────────────────
const PaperlessTag = sequelize.define(
  "PaperlessTag",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    paperlessId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    color: { type: DataTypes.STRING(7), allowNull: true },
    isFavorite: { type: DataTypes.BOOLEAN, defaultValue: false },
    syncedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "paperless_tags", timestamps: true }
);

// ── PaperlessUser ─────────────────────────────────────────────────────────────
const PaperlessUser = sequelize.define(
  "PaperlessUser",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    paperlessId: { type: DataTypes.INTEGER, allowNull: false },
    username: { type: DataTypes.STRING, allowNull: false },
    fullName: { type: DataTypes.STRING, allowNull: true },
    isEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    syncedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "paperless_users", timestamps: true }
);

// ── BackupConfig ──────────────────────────────────────────────────────────────
const BackupConfig = sequelize.define(
  "BackupConfig",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sftpHost: { type: DataTypes.STRING, allowNull: true },
    sftpPort: { type: DataTypes.INTEGER, defaultValue: 22 },
    sftpUser: { type: DataTypes.STRING, allowNull: true },
    sftpPassword: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        return decrypt(this.getDataValue("sftpPassword"));
      },
      set(v) {
        this.setDataValue("sftpPassword", encrypt(v));
      },
    },
    sftpPath: { type: DataTypes.STRING, defaultValue: "/backups" },
    schedule: { type: DataTypes.STRING, allowNull: true },
    scheduleLabel: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastRunAt: { type: DataTypes.DATE, allowNull: true },
    lastRunStatus: { type: DataTypes.STRING, allowNull: true },
    lastRunMessage: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "backup_configs", timestamps: true }
);

// ── GlobalSettings ────────────────────────────────────────────────────────────
// Single-row table (id = 'global') for app-wide settings managed by superadmin
const GlobalSettings = sequelize.define(
  "GlobalSettings",
  {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: "global" },
    anthropicApiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Central AI key set by superadmin",
      get() {
        return decrypt(this.getDataValue("anthropicApiKey"));
      },
      set(v) {
        this.setDataValue("anthropicApiKey", encrypt(v));
      },
    },
    aiKeyPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "If true, all users can use it; if false, only granted users",
    },
    sshPublicKey: { type: DataTypes.TEXT, allowNull: true },
    sshPrivateKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        return decrypt(this.getDataValue("sshPrivateKey"));
      },
      set(v) {
        this.setDataValue("sshPrivateKey", encrypt(v));
      },
    },
  },
  { tableName: "global_settings", timestamps: true }
);

// ── SavingsGoal ───────────────────────────────────────────────────────────────
const SavingsGoal = sequelize.define(
  "SavingsGoal",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    targetAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    savedAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    targetDate: { type: DataTypes.DATEONLY, allowNull: true },
    icon: { type: DataTypes.STRING, defaultValue: "🎯" },
    color: { type: DataTypes.STRING(7), defaultValue: "#E91E8C" },
    isCompleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { tableName: "savings_goals", timestamps: true }
);

// ── Account ───────────────────────────────────────────────────────────────────
// Konto innerhalb eines Haushaltsbuchs (Girokonto, Kreditkarte, Bargeld, …).
// type: 'asset' (Vermögen, positiver Saldo gut) | 'liability' (Schulden,
// positiver Saldo = offene Verbindlichkeit).
const Account = sequelize.define(
  "Account",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "asset",
      validate: { isIn: [["asset", "liability"]] },
    },
    icon: { type: DataTypes.STRING(50), defaultValue: "💳" },
    color: { type: DataTypes.STRING(7), defaultValue: "#3B82F6" },
    startingBalance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    // Datum, auf das sich startingBalance bezieht (Stand am ...). NULL = alle
    // Buchungen zählen (wie vor dem Kalender-Feature).
    startingBalanceDate: { type: DataTypes.DATEONLY, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: "accounts", timestamps: true }
);

// ── MonthlyFixedSnapshot ──────────────────────────────────────────────────────
const MonthlyFixedSnapshot = sequelize.define(
  "MonthlyFixedSnapshot",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    fixedIncome: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    fixedExpenses: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  },
  {
    tableName: "monthly_fixed_snapshots",
    timestamps: true,
    indexes: [{ unique: true, fields: ["householdId", "year", "month"] }],
  }
);

// ── TransactionSplit ──────────────────────────────────────────────────────────
const TransactionSplit = sequelize.define(
  "TransactionSplit",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    transactionId: { type: DataTypes.UUID, allowNull: false },
    categoryId: { type: DataTypes.UUID, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: "transaction_splits", timestamps: true }
);

// ── InviteCode ────────────────────────────────────────────────────────────────
const InviteCode = sequelize.define(
  "InviteCode",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    // 'new_household' = registrant gets their own new household (admin codes)
    // 'add_member'    = registrant joins this specific household (household codes)
    type: { type: DataTypes.STRING, defaultValue: "add_member" },
    householdId: { type: DataTypes.UUID, allowNull: true },
    role: {
      type: DataTypes.ENUM("admin", "member", "viewer"),
      defaultValue: "member",
    },
    createdById: { type: DataTypes.UUID, allowNull: false },
    usedById: { type: DataTypes.UUID, allowNull: true },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    maxUses: { type: DataTypes.INTEGER, defaultValue: 1 },
    useCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: "invite_codes", timestamps: true }
);

// ── Associations ──────────────────────────────────────────────────────────────
Household.hasMany(HouseholdMember, { foreignKey: "householdId" });
HouseholdMember.belongsTo(Household, { foreignKey: "householdId" });
User.hasMany(HouseholdMember, { foreignKey: "userId" });
HouseholdMember.belongsTo(User, { foreignKey: "userId" });

Household.hasMany(Transaction, { foreignKey: "householdId" });
Transaction.belongsTo(Household, { foreignKey: "householdId" });
User.hasMany(Transaction, { foreignKey: "userId" });
Transaction.belongsTo(User, { foreignKey: "userId" });
Category.hasMany(Transaction, { foreignKey: "categoryId" });
Transaction.belongsTo(Category, { foreignKey: "categoryId" });

Household.hasMany(Budget, { foreignKey: "householdId" });
Budget.belongsTo(Category, { foreignKey: "categoryId" });
Category.hasMany(Budget, { foreignKey: "categoryId" });
Household.hasOne(PaperlessConfig, { foreignKey: "householdId" });
Household.hasMany(PaperlessDocumentType, { foreignKey: "householdId" });
Household.hasMany(PaperlessCorrespondent, { foreignKey: "householdId" });
Household.hasMany(PaperlessTag, { foreignKey: "householdId" });
Household.hasMany(PaperlessUser, { foreignKey: "householdId" });
Household.hasMany(Category, { foreignKey: "householdId" });

InviteCode.belongsTo(User, { foreignKey: "createdById", as: "creator" });
InviteCode.belongsTo(User, { foreignKey: "usedById", as: "usedBy" });

Household.hasMany(SavingsGoal, { foreignKey: "householdId" });
SavingsGoal.belongsTo(Household, { foreignKey: "householdId" });

// ── SubAccountSettlement ──────────────────────────────────────────────────────
// Audit-Trail: welche Sub-Account-Period geschlossen wurde, mit Verweis auf
// die erzeugte Settlement-Buchung. UNIQUE(householdId, categoryId, year, month)
// verhindert mehrfaches Schließen derselben Period.
const SubAccountSettlement = sequelize.define(
  "SubAccountSettlement",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    categoryId: { type: DataTypes.UUID, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    settlementTransactionId: { type: DataTypes.UUID, allowNull: true },
    balance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    settledByUserId: { type: DataTypes.UUID, allowNull: true },
    settledAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "sub_account_settlements",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["householdId", "categoryId", "year", "month"] },
    ],
  }
);

Household.hasMany(MonthlyFixedSnapshot, { foreignKey: "householdId" });
MonthlyFixedSnapshot.belongsTo(Household, { foreignKey: "householdId" });

Household.hasMany(Account, { foreignKey: "householdId" });
Account.belongsTo(Household, { foreignKey: "householdId" });
Account.hasMany(Transaction, { foreignKey: "accountId" });
Transaction.belongsTo(Account, { foreignKey: "accountId", as: "account" });
Transaction.belongsTo(Account, {
  foreignKey: "transferTargetAccountId",
  as: "transferTargetAccount",
});

Transaction.hasMany(TransactionSplit, {
  foreignKey: "transactionId",
  as: "splits",
});
TransactionSplit.belongsTo(Transaction, { foreignKey: "transactionId" });
TransactionSplit.belongsTo(Category, { foreignKey: "categoryId" });

// ── BankImportProfile ─────────────────────────────────────────────────────────
// Merkt sich pro Konto die zuletzt bestätigte CSV-Spalten-Zuordnung für den
// Bank-Sync-Datei-Import (siehe routes/bankSync.js + utils/bankImport.js),
// damit der User sie beim nächsten Import nicht neu eingeben muss.
const BankImportProfile = sequelize.define(
  "BankImportProfile",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    accountId: { type: DataTypes.UUID, allowNull: false },
    format: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "csv | mt940",
    },
    columnMapping: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "JSON: {date, amount, purpose, counterpartyName} → CSV-Header",
    },
  },
  {
    tableName: "bank_import_profiles",
    timestamps: true,
    indexes: [{ unique: true, fields: ["householdId", "accountId"] }],
  }
);

// ── MerchantCategoryMapping ───────────────────────────────────────────────────
// Lernt "Verwendungszweck/Merchant → Kategorie" aus manuellen Zuordnungen
// importierter Bank-Sync-Buchungen (siehe transactions.js PUT-Handler).
const MerchantCategoryMapping = sequelize.define(
  "MerchantCategoryMapping",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    merchantPattern: { type: DataTypes.TEXT, allowNull: false },
    categoryId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    tableName: "merchant_category_mappings",
    timestamps: true,
    indexes: [{ unique: true, fields: ["householdId", "merchantPattern"] }],
  }
);

// ── BankCategorizationRule ────────────────────────────────────────────────────
// Vom User gepflegte Regeln für den Bank-Sync-Import: "Feld enthält Muster
// (+ optional Betragsbereich) → Kategorie/Beschreibung". Greifen vor dem
// gelernten Merchant-Mapping und der KI (siehe utils/bankCategorizer.js).
const BankCategorizationRule = sequelize.define(
  "BankCategorizationRule",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    householdId: { type: DataTypes.UUID, allowNull: false },
    field: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "any",
      comment: "any | counterparty | purpose | iban",
    },
    pattern: { type: DataTypes.TEXT, allowNull: false },
    minAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    maxAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    categoryId: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: "bank_categorization_rules", timestamps: true }
);

Household.hasMany(BankCategorizationRule, { foreignKey: "householdId" });
BankCategorizationRule.belongsTo(Household, { foreignKey: "householdId" });
BankCategorizationRule.belongsTo(Category, { foreignKey: "categoryId" });

Household.hasMany(BankImportProfile, { foreignKey: "householdId" });
BankImportProfile.belongsTo(Household, { foreignKey: "householdId" });
Account.hasMany(BankImportProfile, { foreignKey: "accountId" });
BankImportProfile.belongsTo(Account, { foreignKey: "accountId" });

Household.hasMany(MerchantCategoryMapping, { foreignKey: "householdId" });
MerchantCategoryMapping.belongsTo(Household, { foreignKey: "householdId" });
MerchantCategoryMapping.belongsTo(Category, { foreignKey: "categoryId" });

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
  MonthlyFixedSnapshot,
  Account,
  SubAccountSettlement,
  BankImportProfile,
  MerchantCategoryMapping,
  BankCategorizationRule,
};

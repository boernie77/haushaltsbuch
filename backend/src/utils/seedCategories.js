const { Category } = require('../models');

const SYSTEM_CATEGORIES = [
  { name: 'Groceries',      nameDE: 'Lebensmittel',      icon: '🛒', color: '#22C55E', sortOrder: 1 },
  { name: 'Restaurant',     nameDE: 'Restaurant & Café', icon: '🍽️', color: '#F97316', sortOrder: 2 },
  { name: 'Transport',      nameDE: 'Transport & Auto',  icon: '🚗', color: '#3B82F6', sortOrder: 3 },
  { name: 'Health',         nameDE: 'Gesundheit',        icon: '💊', color: '#EC4899', sortOrder: 4 },
  { name: 'Clothing',       nameDE: 'Kleidung & Mode',   icon: '👗', color: '#A855F7', sortOrder: 5 },
  { name: 'Home',           nameDE: 'Haushalt & Wohnen', icon: '🏠', color: '#14B8A6', sortOrder: 6 },
  { name: 'Entertainment',  nameDE: 'Unterhaltung',      icon: '🎬', color: '#EAB308', sortOrder: 7 },
  { name: 'Sports',         nameDE: 'Sport & Fitness',   icon: '🏋️', color: '#06B6D4', sortOrder: 8 },
  { name: 'Education',      nameDE: 'Bildung & Bücher',  icon: '📚', color: '#8B5CF6', sortOrder: 9 },
  { name: 'Travel',         nameDE: 'Urlaub & Reisen',   icon: '✈️', color: '#0EA5E9', sortOrder: 10 },
  { name: 'Electronics',    nameDE: 'Elektronik',        icon: '💻', color: '#64748B', sortOrder: 11 },
  { name: 'Children',       nameDE: 'Kinder & Familie',  icon: '👶', color: '#F43F5E', sortOrder: 12 },
  { name: 'Beauty',         nameDE: 'Schönheit & Pflege',icon: '💄', color: '#DB2777', sortOrder: 13 },
  { name: 'Insurance',      nameDE: 'Versicherungen',    icon: '🛡️', color: '#6366F1', sortOrder: 14 },
  { name: 'Savings',        nameDE: 'Sparen',            icon: '💰', color: '#10B981', sortOrder: 15 },
  { name: 'Income',         nameDE: 'Einnahmen',         icon: '💵', color: '#059669', sortOrder: 16 },
  { name: 'Other',          nameDE: 'Sonstiges',         icon: '📦', color: '#9CA3AF', sortOrder: 17 },
];

async function seedSystemCategories() {
  const count = await Category.count({ where: { isSystem: true } });
  if (count > 0) return;

  await Category.bulkCreate(
    SYSTEM_CATEGORIES.map(c => ({ ...c, isSystem: true, householdId: null }))
  );
  console.log('System categories seeded.');
}

module.exports = { seedSystemCategories, SYSTEM_CATEGORIES };

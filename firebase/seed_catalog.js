const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const seedPath = path.join(__dirname, '..', 'assets', 'seeds', 'catalog_entries.json');
const entries = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

async function run() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  for (const item of entries) {
    const ref = db.collection('catalog_entries').doc();
    batch.set(ref, {
      id: ref.id,
      name: item.name,
      nameLower: item.name.toLowerCase(),
      unit: item.unit,
      category: item.category || null,
      createdBy: 'seed-script',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();
  console.log(`Seeded ${entries.length} catalog entries.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

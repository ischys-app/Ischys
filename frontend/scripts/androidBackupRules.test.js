/** Run with: npm test */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  BACKUP_RULES,
  EXTRACTION_RULES,
  backupRulesXml,
  dataExtractionRulesXml,
  applyBackupAttributes,
} = require('./androidBackupRules.js');

const DB_INCLUDE = '<include domain="file" path="SQLite/"/>';
const SECURE_EXCLUDE = '<exclude domain="sharedpref" path="SecureStore"/>';

test('Android 11 and lower: backs up the workout databases, never SecureStore', () => {
  const xml = backupRulesXml();
  assert.match(xml, /<full-backup-content>/);
  assert.ok(xml.includes(DB_INCLUDE));
  assert.ok(xml.includes(SECURE_EXCLUDE));
});

test('Android 12 and higher: cloud backup and device transfer both carry the databases', () => {
  const xml = dataExtractionRulesXml();
  for (const section of ['cloud-backup', 'device-transfer']) {
    const body = xml.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`));
    assert.ok(body, `missing <${section}>`);
    assert.ok(body[1].includes(DB_INCLUDE), `${section} leaves out the databases`);
    assert.ok(body[1].includes(SECURE_EXCLUDE), `${section} would back up SecureStore`);
  }
});

test('points the application at our rules, replacing expo-secure-store\'s', () => {
  const app = {
    $: {
      'android:allowBackup': 'true',
      'android:fullBackupContent': '@xml/secure_store_backup_rules',
      'android:dataExtractionRules': '@xml/secure_store_data_extraction_rules',
    },
  };
  applyBackupAttributes(app);
  assert.equal(app.$['android:fullBackupContent'], `@xml/${BACKUP_RULES}`);
  assert.equal(app.$['android:dataExtractionRules'], `@xml/${EXTRACTION_RULES}`);
  assert.equal(app.$['android:allowBackup'], 'true');
});

test('fails loudly when backup is turned off, rather than writing rules nobody reads', () => {
  assert.throws(() => applyBackupAttributes({ $: { 'android:allowBackup': 'false' } }), /allowBackup/);
});

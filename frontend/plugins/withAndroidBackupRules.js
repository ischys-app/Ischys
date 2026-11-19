/**
 * Puts the workout databases in Android's Auto Backup and device transfer.
 * `scripts/androidBackupRules.js` explains the rules. expo-secure-store's own
 * rules are switched off in app.json (configureAndroidBackup: false).
 */
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const {
  BACKUP_RULES,
  EXTRACTION_RULES,
  backupRulesXml,
  dataExtractionRulesXml,
  applyBackupAttributes,
} = require('../scripts/androidBackupRules.js');

function withRulesFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRulesXml());
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), dataExtractionRulesXml());
      return mod;
    },
  ]);
}

module.exports = function withAndroidBackupRules(config) {
  config = withAndroidManifest(config, (mod) => {
    applyBackupAttributes(AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults));
    return mod;
  });
  return withRulesFiles(config);
};

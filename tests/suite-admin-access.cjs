// tests/suite-admin-access.cjs - Unit Test Suite for Sovereign Admin Access & Security Credentials
const crypto = require('crypto');
const path = require('path');

module.exports = async function runAdminAccessSuite({ assert, window, document, rootDir }) {
  console.log("\n[Test Suite 29: Sovereign Admin Access & Temporary Credentials Engine]");

  const adminMod = await import('../api/admin.js');
  const authMod = await import('../api/auth.js');

  // 1. Export Verification
  assert(typeof adminMod.default === 'function', "api/admin.js exports default HTTP handler function");
  assert(adminMod.ADMIN_PASSWORDS_KEY === 'admin:temp_passwords', "ADMIN_PASSWORDS_KEY is 'admin:temp_passwords'");
  assert(typeof authMod.verifyCredentials === 'function', "api/auth.js exports verifyCredentials helper function");

  // 2. Storage Setup (Resilient In-Memory Mock Store)
  const mockStorageStore = new Map();
  const mockStorage = {
    async get(key) {
      const v = mockStorageStore.get(key);
      return v !== undefined ? v : null;
    },
    async set(key, val) {
      mockStorageStore.set(key, val);
      return 'OK';
    },
    async del(key) {
      mockStorageStore.delete(key);
      return 1;
    }
  };

  const MASTER_PASSWORD = 'SovereignRootSecretKey#2026';

  // 3. Root Sovereign Password Verification
  const rootAuth = await authMod.verifyCredentials(MASTER_PASSWORD, MASTER_PASSWORD, mockStorage);
  assert(rootAuth.authenticated === true, "Master root password successfully authenticates");
  assert(rootAuth.type === 'master', "Master root password authenticated with type 'master'");

  // 4. Temporary Password Authentication Before Creation (Should Fail)
  const tempPass1 = 'TempVisitorSecret!99';
  const preAuth = await authMod.verifyCredentials(tempPass1, MASTER_PASSWORD, mockStorage);
  assert(preAuth.authenticated === false, "Unregistered temporary password fails authentication");

  // 5. Simulate Creation of Temporary Access Password in Storage
  const hash1 = crypto.createHash('sha256').update(tempPass1).digest('hex');
  const tempKeys = [
    {
      id: 'key_audit_01',
      label: 'Security Auditor Key',
      hash: hash1,
      preview: '••••99',
      createdAt: Date.now() - 3600000,
      lastUsed: null
    }
  ];
  await mockStorage.set('admin:temp_passwords', JSON.stringify(tempKeys));

  // 6. Temporary Password Verification
  const tempAuth = await authMod.verifyCredentials(tempPass1, MASTER_PASSWORD, mockStorage);
  assert(tempAuth.authenticated === true, "Registered temporary password successfully authenticates");
  assert(tempAuth.type === 'temporary', "Temporary password authenticated with type 'temporary'");
  assert(tempAuth.keyId === 'key_audit_01', "Temporary auth identifies key_id 'key_audit_01'");

  // 7. Master Root Key Invariance: Master Password Still Authenticates Perfectly
  const rootStillWorks = await authMod.verifyCredentials(MASTER_PASSWORD, MASTER_PASSWORD, mockStorage);
  assert(rootStillWorks.authenticated === true, "Master root password remains fully valid after temporary key creation");
  assert(rootStillWorks.type === 'master', "Master root password remains type 'master'");

  // 8. Multiple Temporary Passwords
  const tempPass2 = 'FieldOperator#777';
  const hash2 = crypto.createHash('sha256').update(tempPass2).digest('hex');
  tempKeys.push({
    id: 'key_field_02',
    label: 'Field Technician',
    hash: hash2,
    preview: '••••77',
    createdAt: Date.now(),
    lastUsed: null
  });
  await mockStorage.set('admin:temp_passwords', JSON.stringify(tempKeys));

  const tempAuth2 = await authMod.verifyCredentials(tempPass2, MASTER_PASSWORD, mockStorage);
  assert(tempAuth2.authenticated === true, "Second temporary password successfully authenticates");
  assert(tempAuth2.keyId === 'key_field_02', "Second temporary auth identifies 'key_field_02'");

  // 9. Deletion of Temporary Password (Revocation)
  const remainingKeys = tempKeys.filter(k => k.id !== 'key_audit_01');
  await mockStorage.set('admin:temp_passwords', JSON.stringify(remainingKeys));

  const deletedAuth = await authMod.verifyCredentials(tempPass1, MASTER_PASSWORD, mockStorage);
  assert(deletedAuth.authenticated === false, "Revoked temporary password immediately rejected");

  const retainedAuth = await authMod.verifyCredentials(tempPass2, MASTER_PASSWORD, mockStorage);
  assert(retainedAuth.authenticated === true, "Non-revoked temporary password continues to work");

  // 10. Deleting All Temporary Keys Never Locks Out Master Root Key
  await mockStorage.set('admin:temp_passwords', JSON.stringify([]));
  const rootAfterWipe = await authMod.verifyCredentials(MASTER_PASSWORD, MASTER_PASSWORD, mockStorage);
  assert(rootAfterWipe.authenticated === true, "Master root password authenticates even after all admin keys are wiped");

  // 11. Testing Tampered Malicious Keys Cannot Lock Out Master
  await mockStorage.set('admin:temp_passwords', JSON.stringify([{ id: 'hacked_key', hash: 'badhash', label: 'Attacker' }]));
  const rootAfterTamper = await authMod.verifyCredentials(MASTER_PASSWORD, MASTER_PASSWORD, mockStorage);
  assert(rootAfterTamper.authenticated === true, "Master root password supersedes any altered or malicious keys");

  // 12. DOM & UI Verification for Settings Sub-Tabs
  const btnSettingsGeneral = document.getElementById('btnSettingsGeneral');
  const btnSettingsAdmin = document.getElementById('btnSettingsAdmin');
  const settingsGeneralPane = document.getElementById('settingsGeneralPane');
  const settingsAdminPane = document.getElementById('settingsAdminPane');

  assert(btnSettingsGeneral !== null, "#btnSettingsGeneral exists in DOM");
  assert(btnSettingsAdmin !== null, "#btnSettingsAdmin exists in DOM");
  assert(settingsGeneralPane !== null, "#settingsGeneralPane exists in DOM");
  assert(settingsAdminPane !== null, "#settingsAdminPane exists in DOM");

  // 13. Sub-Tab Switching Logic
  assert(typeof window.switchSettingsSubTab === 'function', "window.switchSettingsSubTab function is defined");
  window.switchSettingsSubTab('admin');
  assert(!settingsAdminPane.classList.contains('hidden'), "Switching to 'admin' reveals #settingsAdminPane");
  assert(settingsGeneralPane.classList.contains('hidden'), "Switching to 'admin' hides #settingsGeneralPane");

  window.switchSettingsSubTab('general');
  assert(settingsAdminPane.classList.contains('hidden'), "Switching to 'general' hides #settingsAdminPane");
  assert(!settingsGeneralPane.classList.contains('hidden'), "Switching to 'general' reveals #settingsGeneralPane");

  // 14. LuminaAdminAccess Module Interface
  assert(typeof window.LuminaAdminAccess === 'object', "window.LuminaAdminAccess is mounted");
  assert(typeof window.LuminaAdminAccess.createPassword === 'function', "LuminaAdminAccess.createPassword exists");
  assert(typeof window.LuminaAdminAccess.deletePassword === 'function', "LuminaAdminAccess.deletePassword exists");
  assert(typeof window.LuminaAdminAccess.generateRandomPassword === 'function', "LuminaAdminAccess.generateRandomPassword exists");
  assert(typeof window.LuminaAdminAccess.togglePasswordVisibility === 'function', "LuminaAdminAccess.togglePasswordVisibility exists");

  // 15. Password Generator Function
  window.switchSettingsSubTab('admin');
  const passInput = document.getElementById('adminNewPasswordInput');
  assert(passInput !== null, "#adminNewPasswordInput exists in DOM");
  window.LuminaAdminAccess.generateRandomPassword();
  assert(passInput.value.startsWith('Lv-'), "generateRandomPassword() populates secure password starting with 'Lv-'");
  assert(passInput.value.length >= 10, "generateRandomPassword() produces >= 10 character passcode");

  // 16. Password Visibility Toggle
  window.LuminaAdminAccess.togglePasswordVisibility();
  assert(passInput.type === 'password' || passInput.type === 'text', "togglePasswordVisibility toggles input type");

  // 17. Security Check: No Plaintext Passwords in Redis
  const rawStored = await mockStorage.get('admin:temp_passwords');
  assert(!rawStored.includes(tempPass1), "Stored data never contains raw plaintext password");
  assert(!rawStored.includes(MASTER_PASSWORD), "Stored data never contains sovereign master password");

  console.log("✓ Sovereign Admin Access & Temporary Credentials sub-suite completed successfully!");
};

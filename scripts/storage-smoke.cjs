const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const storageRoot = path.join(os.tmpdir(), `xacode-storage-smoke-${process.pid}`);
process.env.XACODE_HOME = storageRoot;

const { app } = require('electron');

app.whenReady().then(() => {
  try {
    fs.rmSync(storageRoot, { recursive: true, force: true });
    const { DesktopStore } = require('../dist/desktop/store');
    const store = new DesktopStore();
    const apiKey = 'storage-smoke-secret-value';
    const settings = store.getSettings();
    settings.apiKey = apiKey;
    settings.modelProfiles[0].apiKey = apiKey;
    store.saveSettings(settings);

    const settingsPath = path.join(storageRoot, 'settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf8');
    assert(!raw.includes(apiKey), 'API key was written in plaintext');
    assert(JSON.parse(raw).encryptedApiKey, 'Encrypted API key is missing');
    assert.strictEqual(store.getSettings().apiKey, apiKey, 'Encrypted API key did not round-trip');

    store.saveConversations([]);
    assert(fs.existsSync(path.join(storageRoot, 'conversations.json')));
    console.log(JSON.stringify({ homeDirectory: true, encryptedApiKey: true, atomicJson: true }));
  } finally {
    fs.rmSync(storageRoot, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

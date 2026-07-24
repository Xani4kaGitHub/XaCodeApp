const fs = require('fs');
const code = fs.readFileSync('src/desktop/renderer/renderer.js', 'utf8');

global.window = { xacode: {} };
global.document = { querySelector: () => null, addEventListener: () => {}, documentElement: { style: { setProperty: () => {} } }, querySelectorAll: () => [] };
global.localStorage = { getItem: () => null, removeItem: () => {} };
global.requestAnimationFrame = () => {};

try {
  // Use eval to simulate global script execution
  eval(code);
  console.log("Type of syncHyperagentSecretVisibility:", typeof syncHyperagentSecretVisibility);
} catch (e) {
  console.error("Eval error:", e);
}

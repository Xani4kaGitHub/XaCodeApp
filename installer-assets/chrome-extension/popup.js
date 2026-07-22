document.addEventListener('DOMContentLoaded', () => {
  const dot = document.getElementById('dot');
  const text = document.getElementById('status-text');
  const tokenInput = document.getElementById('token-input');
  const saveBtn = document.getElementById('save-token-btn');

  chrome.storage.local.get(['status', 'xacode_token'], (res) => {
    if (res.xacode_token) {
      tokenInput.value = res.xacode_token;
    }
    if (res.status === 'connected') {
      dot.classList.add('connected');
      text.innerText = 'Подключено к XaCodeApp';
    } else {
      dot.classList.remove('connected');
      text.innerText = 'Отключено (ws://127.0.0.1:9223)';
    }
  });

  saveBtn.addEventListener('click', () => {
    const val = tokenInput.value.trim();
    chrome.storage.local.set({ xacode_token: val }, () => {
      saveBtn.innerText = '✓ Сохранено';
      setTimeout(() => { saveBtn.innerText = 'Сохранить токен'; }, 1500);
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const tokenInput = document.getElementById('token-input');
  const saveBtn = document.getElementById('save-token-btn');
  const saveBtnText = document.getElementById('save-btn-text');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const eyeIcon = document.getElementById('eye-icon');

  // Load status and stored token
  chrome.storage.local.get(['status', 'xacode_token'], (res) => {
    if (res.xacode_token) {
      tokenInput.value = res.xacode_token;
    }
    if (res.status === 'connected') {
      statusCard.classList.remove('disconnected');
      statusText.innerText = 'Подключено';
    } else {
      statusCard.classList.add('disconnected');
      statusText.innerText = 'Отключено';
    }
  });

  // Toggle password visibility
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const show = tokenInput.type === 'password';
      tokenInput.type = show ? 'text' : 'password';
      eyeIcon.innerHTML = show
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    });
  }

  // Save token button
  saveBtn.addEventListener('click', () => {
    const val = tokenInput.value.trim();
    chrome.storage.local.set({ xacode_token: val }, () => {
      saveBtnText.innerText = '✓ Сохранено';
      setTimeout(() => { saveBtnText.innerText = 'Сохранить токен'; }, 1800);
    });
  });
});

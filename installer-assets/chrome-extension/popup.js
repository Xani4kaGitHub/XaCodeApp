document.addEventListener('DOMContentLoaded', () => {
  const dot = document.getElementById('dot');
  const text = document.getElementById('status-text');

  chrome.storage.local.get(['status'], (res) => {
    if (res.status === 'connected') {
      dot.classList.add('connected');
      text.innerText = 'Подключено к XaCodeApp';
    } else {
      dot.classList.remove('connected');
      text.innerText = 'Отключено (ws://127.0.0.1:9223)';
    }
  });
});

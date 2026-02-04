// Popup script (external file — exigido pelo CSP do MV3)
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resumeBtn = document.getElementById('resumeBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const filledCount = document.getElementById('filledCount');
const delayInput = document.getElementById('delay');
const submitDelayInput = document.getElementById('submitDelay');

function updateUIRunning(running, status = 'running') {
  if (running) {
    statusIndicator.classList.add('running');
    statusIndicator.classList.remove('error', 'complete', 'waiting');
    if (status === 'complete') { statusIndicator.classList.add('complete'); statusText.textContent = 'Completo!'; }
    else if (status === 'waiting') { statusIndicator.classList.add('waiting'); statusText.textContent = 'A aguardar...'; }
    else { statusText.textContent = 'A preencher...'; }
    startBtn.disabled = true; stopBtn.disabled = false; resumeBtn.disabled = true;
  } else {
    statusIndicator.classList.remove('running', 'complete', 'waiting');
    statusText.textContent = 'Parado';
    startBtn.disabled = false; stopBtn.disabled = true; resumeBtn.disabled = false;
  }
}

function saveSettings() {
  chrome.storage.local.set({ settings: {
    delay: parseInt(delayInput.value) || 300,
    submitDelay: parseInt(submitDelayInput.value) || 500
  }});
}

delayInput.addEventListener('change', saveSettings);
submitDelayInput.addEventListener('change', saveSettings);

chrome.storage.local.get(['settings', 'stats', 'isRunning'], (data) => {
  if (data.settings) {
    delayInput.value = data.settings.delay || 300;
    submitDelayInput.value = data.settings.submitDelay || 500;
  }
  if (data.stats) filledCount.textContent = data.stats.filledCount || 0;
  if (data.isRunning) updateUIRunning(true);
  checkResumeState();
});

async function checkResumeState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    chrome.tabs.sendMessage(tab.id, { action: 'getState' }, (response) => {
      if (chrome.runtime.lastError) { resumeBtn.style.display = 'none'; return; }
      if (response && response.hasState) {
        resumeBtn.style.display = 'block';
        resumeBtn.title = `Retomar (${response.state.filledCount || 0} páginas)`;
      } else { resumeBtn.style.display = 'none'; }
    });
  } catch (e) { resumeBtn.style.display = 'none'; }
}

startBtn.addEventListener('click', async () => { saveSettings(); await startFilling(false); });
resumeBtn.addEventListener('click', async () => { saveSettings(); await startFilling(true); });

async function startFilling(resume = false) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { statusText.textContent = 'Erro: Nenhuma aba'; statusIndicator.classList.add('error'); return; }
  chrome.storage.local.set({ isRunning: true, stats: resume ? undefined : { filledCount: 0 } });
  updateUIRunning(true);
  chrome.tabs.sendMessage(tab.id, { action: 'start', settings: {
    delay: parseInt(delayInput.value) || 300,
    submitDelay: parseInt(submitDelayInput.value) || 500
  }, resume });
}

stopBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.storage.local.set({ isRunning: false });
  updateUIRunning(false);
  if (tab) chrome.tabs.sendMessage(tab.id, { action: 'stop' });
  setTimeout(checkResumeState, 500);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'statsUpdate') {
    filledCount.textContent = msg.filledCount;
    if (msg.status === 'complete') updateUIRunning(true, 'complete');
    else if (msg.status === 'waiting') updateUIRunning(true, 'waiting');
    chrome.storage.local.set({ stats: { filledCount: msg.filledCount } });
  }
  if (msg.type === 'stopped') { updateUIRunning(false); chrome.storage.local.set({ isRunning: false }); setTimeout(checkResumeState, 500); }
  if (msg.type === 'error') { statusIndicator.classList.add('error'); statusText.textContent = msg.message; }
});

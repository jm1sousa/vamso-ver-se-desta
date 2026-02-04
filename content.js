// Content script — lida com preenchimento e mensagens do popup
(() => {
  let isRunning = false;
  let filledCount = 0;
  let settings = { delay: 300, submitDelay: 500 };
  let savedState = null;

  const fictionNames = ["Harry Potter","Hermione Granger","Ron Weasley","Frodo Baggins","Samwise Gamgee","Gandalf","Aragorn","Legolas","Katniss Everdeen","Peeta Mellark","Tony Stark","Bruce Wayne","Clark Kent","Diana Prince","Peter Parker"];
  function randomName(){ return fictionNames[Math.floor(Math.random()*fictionNames.length)]; }
  function randomEmail(){
    const name = randomName().toLowerCase().replace(/[^a-z]/g,'');
    return `${name}@swordhealth.com`;
  }

  const sleep = ms => new Promise(r=>setTimeout(r, ms));
  const isVisible = el => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null;

  function getLabel(f){
    if (f.id) {
      const l = document.querySelector(`label[for="${f.id}"]`);
      if (l) return l.textContent;
    }
    const p = f.closest('label');
    if (p) return p.textContent;
    return f.getAttribute('aria-label') || '';
  }

  function getValue(f){
    const n = (f.name||'').toLowerCase(), id = (f.id||'').toLowerCase(), t = (f.type||'').toLowerCase(), ph = (f.placeholder||'').toLowerCase(), lb = getLabel(f).toLowerCase();
    const c = `${n} ${id} ${ph} ${lb}`;
    if (t === 'email' || c.includes('email')) return randomEmail();
    if (t === 'tel' || c.includes('phone') || c.includes('telefone') || c.includes('telemóvel')) return '91' + Math.floor(Math.random()*10000000).toString().padStart(7,'0');
    if (c.includes('firstname') || c.includes('primeiro')) return randomName().split(' ')[0];
    if (c.includes('lastname') || c.includes('apelido')) return randomName().split(' ')[1] || 'Smith';
    if (c.includes('name') || c.includes('nome')) return randomName();
    if (c.includes('address') || c.includes('morada')) return `Rua Exemplo ${Math.floor(Math.random()*100)}`;
    if (c.includes('city') || c.includes('cidade')) return ['Lisboa','Porto','Braga','Coimbra','Faro'][Math.floor(Math.random()*5)];
    if (c.includes('postal') || c.includes('zip')) return `${Math.floor(Math.random()*9000)+1000}-${Math.floor(Math.random()*900)+100}`;
    if (c.includes('company') || c.includes('empresa')) return ['Tech','Global','Digital'][Math.floor(Math.random()*3)] + ' Corp';
    if (c.includes('age') || c.includes('idade') || t==='number') return (Math.floor(Math.random()*50)+18).toString();
    if (t==='date' || c.includes('birth') || c.includes('nascimento')) {
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      // HTML date inputs expect YYYY-MM-DD
      return d.toISOString().split('T')[0];
    }
    return "Teste automático";
  }

  function dispatchInput(el){
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } catch(e){
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function fillField(f){
    if (!f) return;
    let v = getValue(f);
    if (!v) return;
    if (f.type === 'number') v = v.replace(/\D/g,'');
    f.focus();
    // Clear then simulate typing
    f.value = '';
    for (let i=0;i<v.length;i++){
      f.value = v.substring(0, i+1);
      dispatchInput(f);
      await sleep(settings.delay || 200);
    }
    f.dispatchEvent(new Event('change', { bubbles: true }));
    f.blur();
  }

  function fillSelect(s){
    if (!s) return;
    const opts = [...s.options].filter(o=>o.value && !o.disabled);
    if (opts.length) {
      // choose first non-empty value (better than index 0 placeholder)
      const idx = [...s.options].findIndex(o=>o.value && !o.disabled);
      if (idx >= 0) s.selectedIndex = idx;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function fillCheckbox(c){
    if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change',{bubbles:true})); c.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
  }

  function fillRadio(radios){
    if (radios.length) {
      const r = radios.find(x=>!x.checked && !x.disabled && isVisible(x));
      if (r){ r.checked = true; r.dispatchEvent(new Event('change',{bubbles:true})); r.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
    }
  }

  function findContinueBtn(){
    const texts = ['continuar','próximo','seguinte','avançar','continue','next','submit','enviar','confirmar','ok'];
    for (const btn of document.querySelectorAll('button,input[type="submit"],[role="button"],a')) {
      if(!isVisible(btn) || btn.disabled) continue;
      const txt = (btn.textContent||btn.value||btn.getAttribute('aria-label')||'').toLowerCase();
      if(texts.some(t=>txt.includes(t))) return btn;
    }
    return null;
  }

  function sendStats(status){
    chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status });
    // persist minimal state so popup can show resume
    savedState = { filledCount, timestamp: Date.now() };
    chrome.storage.local.set({ fillerState: savedState });
  }

  async function fillPage(){
    if (!isRunning) return false;
    const inputs = document.querySelectorAll('input,textarea');
    const selects = document.querySelectorAll('select');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const radioNodes = document.querySelectorAll('input[type="radio"]');
    const radios = {};
    radioNodes.forEach(r=>{ if(!radios[r.name]) radios[r.name]=[]; radios[r.name].push(r); });

    let filled = false;
    for (const f of inputs){
      if (!isRunning) return false;
      if (!isVisible(f) || f.disabled || f.readOnly) continue;
      // don't overwrite inputs that already have values
      if ((f.type !== 'checkbox' && f.type !== 'radio') && f.value) continue;
      await fillField(f);
      filled = true;
      await sleep(settings.delay || 300);
    }
    for (const s of selects){
      if (!isRunning) return false;
      if (isVisible(s) && !s.disabled) { fillSelect(s); filled = true; await sleep(settings.delay || 200); }
    }
    for (const c of checkboxes){
      if (!isRunning) return false;
      if (isVisible(c) && !c.disabled) { fillCheckbox(c); filled = true; await sleep(100); }
    }
    for (const name in radios){
      if (!isRunning) return false;
      const group = radios[name].filter(r=>isVisible(r) && !r.disabled);
      if (group.length && !group.some(r=>r.checked)){ fillRadio(group); filled = true; await sleep(100); }
    }

    if (filled) { filledCount++; sendStats(); }
    return filled;
  }

  async function tryClickContinue(){
    const continueBtn = findContinueBtn();
    if (continueBtn && document.querySelectorAll('input:invalid,input:required:invalid,select:invalid,textarea:invalid').length === 0) {
      try {
        continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // some forms submit on click, others on submit
        if (continueBtn.tagName.toLowerCase() === 'input' && continueBtn.type === 'submit') {
          (continueBtn.form || {}).submit && (continueBtn.form.submit());
        }
        return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  async function runLoop(){
    while (isRunning) {
      try {
        const filled = await fillPage();
        if (!isRunning) break;
        if (filled) {
          // try to submit / go to next step
          const clicked = await tryClickContinue();
          if (clicked) {
            // wait a bit for navigation / UI update
            sendStats('waiting');
            await sleep(settings.submitDelay || 500);
            // after navigation we continue
          } else {
            // no continue button or invalid fields remain — wait and retry
            await sleep(800);
          }
        } else {
          // nothing filled on this page — consider complete
          sendStats('complete');
          isRunning = false;
          chrome.runtime.sendMessage({ type: 'stopped' });
          chrome.storage.local.set({ isRunning: false });
          break;
        }
      } catch (err) {
        chrome.runtime.sendMessage({ type: 'error', message: (err && err.message) ? err.message : 'Erro desconhecido' });
        isRunning = false;
        chrome.storage.local.set({ isRunning: false });
        break;
      }
    }
  }

  // Message handling from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'start') {
      // update settings
      settings = Object.assign({}, settings, msg.settings || {});
      if (msg.resume) {
        chrome.storage.local.get(['fillerState'], (data) => {
          if (data && data.fillerState) {
            savedState = data.fillerState;
            filledCount = savedState.filledCount || 0;
          }
          isRunning = true;
          chrome.storage.local.set({ isRunning: true });
          sendStats('running');
          runLoop();
        });
      } else {
        filledCount = 0;
        isRunning = true;
        chrome.storage.local.set({ isRunning: true });
        sendStats('running');
        runLoop();
      }
      sendResponse({ started: true });
    }

    if (msg.action === 'stop') {
      isRunning = false;
      chrome.storage.local.set({ isRunning: false });
      chrome.runtime.sendMessage({ type: 'stopped' });
      sendResponse({ stopped: true });
    }

    if (msg.action === 'getState') {
      chrome.storage.local.get(['fillerState'], (data) => {
        sendResponse({ hasState: !!(data && data.fillerState), state: data.fillerState || null });
      });
      return true; // will respond asynchronously
    }
  });

  // Inform popup if extension is loaded on this page and if there's a saved state
  chrome.storage.local.get(['fillerState'], (data) => {
    if (data && data.fillerState) {
      chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount: data.fillerState.filledCount || 0, status: 'waiting' });
    }
  });

})();

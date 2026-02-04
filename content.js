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
    if (t==='date') {
      // HTML date inputs expect YYYY-MM-DD
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      return d.toISOString().split('T')[0];
    }
    if (c.includes('birth') || c.includes('nascimento') || c.includes('data')) {
      // For text-based date fields, return numeric DDMMYYYY (user requested numbers)
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = String(d.getFullYear());
      return `${dd}${mm}${yyyy}`; // e.g. 01011990
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

  async function typeValueInto(el, v){
    el.focus();
    if (el.value !== undefined) el.value = '';
    for (let i=0;i<v.length;i++){
      if (el.value !== undefined) el.value = v.substring(0, i+1);
      dispatchInput(el);
      await sleep(settings.delay || 200);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  async function fillField(f){
    if (!f) return;
    // handle inputs that are backed by a datalist (dropdown-like)
    const listId = f.getAttribute && f.getAttribute('list');
    if (listId) {
      const datalist = document.getElementById(listId);
      if (datalist) {
        const opt = datalist.querySelector('option[value]');
        if (opt) { await typeValueInto(f, opt.value); return; }
      }
    }

    let v = getValue(f);
    if (!v) return;
    if (f.type === 'number') v = v.replace(/\D/g,'');

    // For inputs of type date, set directly (better than typing)
    if (f.type === 'date' && f.value !== undefined) {
      f.focus();
      f.value = v; // v already YYYY-MM-DD
      f.dispatchEvent(new Event('input', { bubbles: true }));
      f.dispatchEvent(new Event('change', { bubbles: true }));
      f.blur();
      return;
    }

    await typeValueInto(f, v);
  }

  function fillSelect(s){
    if (!s) return;
    const opts = [...s.options].filter(o=>o.value && !o.disabled);
    if (opts.length) {
      // choose first non-empty value (user requested first option)
      const idx = [...s.options].findIndex(o=>o.value && !o.disabled);
      if (idx >= 0) s.selectedIndex = idx;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      s.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

  function isControlFilled(ctrl){
    if (!isVisible(ctrl) || ctrl.disabled) return true; // ignore invisible or disabled
    if (ctrl.tagName.toLowerCase() === 'select') return !!ctrl.value;
    if (ctrl.type === 'checkbox') return !!ctrl.checked;
    if (ctrl.type === 'radio') return true; // radios handled per-group
    if (ctrl.tagName.toLowerCase() === 'textarea') return !!ctrl.value;
    if (ctrl.type === 'hidden') return true;
    // inputs
    return !!ctrl.value;
  }

  async function fillPage(){
    if (!isRunning) return { filled: false, allFilled: false };
    const inputs = Array.from(document.querySelectorAll('input,textarea'));
    const selects = Array.from(document.querySelectorAll('select'));
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    const radioNodes = Array.from(document.querySelectorAll('input[type="radio"]'));

    const radios = {};
    radioNodes.forEach(r=>{ if(!radios[r.name]) radios[r.name]=[]; radios[r.name].push(r); });

    let filled = false;

    // Fill inputs and textareas (including datalist-backed inputs)
    for (const f of inputs){
      if (!isRunning) return { filled, allFilled: false };
      if (!isVisible(f) || f.disabled || f.readOnly) continue;
      if (f.type === 'checkbox' || f.type === 'radio') continue;
      if (f.value) continue; // don't overwrite
      await fillField(f);
      filled = true;
      await sleep(settings.delay || 300);
    }

    // Selects
    for (const s of selects){
      if (!isRunning) return { filled, allFilled: false };
      if (isVisible(s) && !s.disabled && !s.value) { fillSelect(s); filled = true; await sleep(settings.delay || 200); }
    }

    // Checkboxes
    for (const c of checkboxes){
      if (!isRunning) return { filled, allFilled: false };
      if (isVisible(c) && !c.disabled && !c.checked) { fillCheckbox(c); filled = true; await sleep(100); }
    }

    // Radios
    for (const name in radios){
      if (!isRunning) return { filled, allFilled: false };
      const group = radios[name].filter(r=>isVisible(r) && !r.disabled);
      if (group.length && !group.some(r=>r.checked)){ fillRadio(group); filled = true; await sleep(100); }
    }

    // After filling attempts, determine if all visible controls are filled
    // Gather controls to check: visible selects, inputs (excluding hidden), textareas, checkboxes, radio groups
    const controls = Array.from(document.querySelectorAll('input,textarea,select')).filter(c=>isVisible(c) && !c.disabled);

    // For radios, check that each group has a checked option
    const radioGroups = {};
    controls.forEach(c=>{ if (c.type === 'radio') { if (!radioGroups[c.name]) radioGroups[c.name]=[]; radioGroups[c.name].push(c); } });

    let allFilled = true;
    for (const c of controls){
      if (c.type === 'radio') continue; // skip, handled per group
      if (c.type === 'hidden') continue;
      if (!isControlFilled(c)) { allFilled = false; break; }
    }
    // check radio groups
    for (const name in radioGroups){
      const group = radioGroups[name].filter(r=>isVisible(r) && !r.disabled);
      if (group.length && !group.some(r=>r.checked)) { allFilled = false; break; }
    }

    if (filled) { filledCount++; sendStats(); }
    return { filled, allFilled };
  }

  async function tryClickContinue(force = false){
    const continueBtn = findContinueBtn();
    if (!continueBtn) return false;
    const invalids = document.querySelectorAll('input:invalid,input:required:invalid,select:invalid,textarea:invalid');
    if (!force && invalids.length > 0) return false;
    try {
      continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (continueBtn.tagName.toLowerCase() === 'input' && continueBtn.type === 'submit') {
        (continueBtn.form || {}).submit && (continueBtn.form.submit());
      }
      return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  async function runLoop(){
    while (isRunning) {
      try {
        const { filled, allFilled } = await fillPage();
        if (!isRunning) break;

        if (filled || allFilled) {
          // if all fields are filled, force click continue (user requested)
          const clicked = await tryClickContinue(allFilled);
          if (clicked) {
            sendStats('waiting');
            await sleep(settings.submitDelay || 500);
            continue; // after navigation, continue loop
          } else {
            // no continue button or click didn't happen — wait and retry
            await sleep(800);
            continue;
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
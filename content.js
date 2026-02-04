// Content script — lida com preenchimento e mensagens do popup
(() => {
  let isRunning = false;
  let filledCount = 0;
  let settings = { delay: 300, submitDelay: 500 };
  let savedState = null;

  const fictionNames = ["Harry Potter","Hermione Granger","Ron Weasley","Frodo Baggins","Samwise Gamgae","Gandalf","Aragorn","Legolas","Katniss Everdeen","Peeta Mellark","Tony Stark","Bruce Wayne","Clark Kent","Diana Prince","Peter Parker"];
  function randomName(){ return fictionNames[Math.floor(Math.random()*fictionNames.length)]; }
  function randomEmail(){ const name = randomName().toLowerCase().replace(/[^a-z]/g,''); return `${name}@swordhealth.com`; }

  const sleep = ms => new Promise(r=>setTimeout(r, ms));
  const isVisible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';

  function getLabel(f){
    if (!f) return ''; 
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

    // native date input
    if (t === 'date') {
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      return d.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // If placeholder uses mm/dd or contains '/', produce MM/DD/YYYY for typical US masked fields
    if ((f.placeholder||'').toLowerCase().includes('mm/dd') || (f.placeholder||'').includes('/')) {
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const yyyy = String(d.getFullYear());
      return `${mm}/${dd}/${yyyy}`; // MM/DD/YYYY
    }

    // text-based date fields (labels/placeholders containing date/birth/data) -> numbers DDMMYYYY
    if (c.includes('birth') || c.includes('nascimento') || c.includes('data') || c.includes('date')) {
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = String(d.getFullYear());
      return `${dd}${mm}${yyyy}`; // DDMMYYYY
    }

    return "Teste automático";
  }

  function dispatchInput(el){
    try { el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
    catch(e){ el.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  // Simula typing com eventos de teclado (útil para máscaras que só reagem a key events)
  async function simulateTypingKeys(el, value) {
    el.focus();
    for (let i=0;i<value.length;i++){
      const ch = value[i];
      // keydown / keypress
      const kd = new KeyboardEvent('keydown', { key: ch, char: ch, bubbles: true });
      const kp = new KeyboardEvent('keypress', { key: ch, char: ch, bubbles: true });
      el.dispatchEvent(kd);
      el.dispatchEvent(kp);
      // update value progressively
      if (el.value !== undefined) el.value = (el.value || '') + ch;
      dispatchInput(el);
      const ku = new KeyboardEvent('keyup', { key: ch, char: ch, bubbles: true });
      el.dispatchEvent(ku);
      await sleep(settings.delay || 60); // typing speed
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  async function typeValueInto(el, v){
    // prefer simulateTypingKeys for masked inputs (if mask detected by attribute or pattern)
    const mayNeedMask = (el.getAttribute && (el.getAttribute('data-mask') || (el.placeholder||'').includes('mm') || (el.placeholder||'').includes('/')));
    if (mayNeedMask) {
      // try keyboard simulation first
      await simulateTypingKeys(el, v);
      return;
    }
    el.focus();
    if (el.value !== undefined) el.value = '';
    for (let i=0;i<v.length;i++){ 
      if (el.value !== undefined) el.value = v.substring(0, i+1);
      dispatchInput(el);
      await sleep(settings.delay || 60);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  // Handle datalist-backed input (prefer options)
  async function handleDatalistInput(f) {
    const listId = f.getAttribute && f.getAttribute('list');
    if (!listId) return false;
    const datalist = document.getElementById(listId);
    if (!datalist) return false;
    const opt = datalist.querySelector('option[value]');
    if (opt) {
      await typeValueInto(f, opt.value);
      return true;
    }
    return false;
  }

  // Detect custom dropdown trigger (combobox or clickable element used as select)
  function isCustomSelectTrigger(el) {
    if (!el) return false;
    const role = el.getAttribute && el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox' || el.getAttribute('aria-haspopup') === 'listbox') return true;
    const cls = (el.className||'').toString().toLowerCase();
    if (cls.includes('select') || cls.includes('dropdown') || cls.includes('combobox') || cls.includes('choice')) return true;
    // clickable input-like triggers
    if (el.tagName.toLowerCase() === 'div' || el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'span') {
      if (el.querySelector && el.querySelector('[data-icon], .arrow, .chevron, svg')) return true;
    }
    return false;
  }

  // After opening dropdown, find visible options in overlay and click first one
  function findOpenOptions() {
    const selectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="listitem"]',
      '[role="presentation"] .option',
      '.dropdown-item',
      '.select-option',
      '.option',
      '.rc-select-item',
      '.MuiList-root li',
      'ul[role="listbox"] li',
      '.ant-select-item',
      '.v-select__list li',
      '.chakra-portal *'
    ];
    const candidates = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (isVisible(el)) candidates.push(el);
      });
    }
    document.querySelectorAll('body *').forEach(el => {
      if (isVisible(el) && el.childElementCount === 0 && (el.textContent||'').trim().length > 0) {
        const tag = el.tagName.toLowerCase();
        if (['option','button','input','textarea','select','label'].includes(tag)) return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 30 && rect.height > 10) candidates.push(el);
      }
    });
    return [...new Set(candidates)];
  }

  async function handleCustomSelect(trigger) {
    try {
      trigger.focus();
      trigger.click && trigger.click();
      trigger.dispatchEvent && trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(120);
      const opts = findOpenOptions().filter(o => (o.textContent||'').trim().length > 0);
      if (opts.length) {
        const opt = opts[0];
        opt.scrollIntoView({ block: 'center' });
        await sleep(50);
        opt.click && opt.click();
        opt.dispatchEvent && opt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(60);
        dispatchInput(trigger);
        trigger.dispatchEvent && trigger.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      document.body.click();
    } catch (e) {}
    return false;
  }

  async function fillField(f){
    if (!f) return;
    if (!f.tagName) return;
    const tag = f.tagName.toLowerCase();
    if (tag !== 'select' && isCustomSelectTrigger(f)) {
      const ok = await handleCustomSelect(f);
      if (ok) return;
    }
    const handledDatalist = await handleDatalistInput(f);
    if (handledDatalist) return;
    let v = getValue(f);
    if (!v) return;
    if (f.type === 'number') v = v.replace(/\D/g,'');
    if (f.type === 'date' && f.value !== undefined) {
      f.focus();
      f.value = v;
      dispatchInput(f);
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
      const idx = [...s.options].findIndex(o=>o.value && !o.disabled);
      if (idx >= 0) s.selectedIndex = idx;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      s.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }

  function fillCheckbox(c){ if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change',{bubbles:true})); c.dispatchEvent(new MouseEvent('click',{bubbles:true})); } }
  function fillRadio(radios){ if (radios.length) { const r = radios.find(x=>!x.checked && !x.disabled && isVisible(x)); if (r){ r.checked = true; r.dispatchEvent(new Event('change',{bubbles:true})); r.dispatchEvent(new MouseEvent('click',{bubbles:true})); } } }

  function findContinueBtn(){
    const texts = ['continuar','próximo','seguinte','avançar','continue','next','submit','enviar','confirmar','ok'];
    for (const btn of document.querySelectorAll('button,input[type="submit"],[role="button"],a')) {
      if(!isVisible(btn) || btn.disabled) continue;
      const txt = (btn.textContent||btn.value||btn.getAttribute('aria-label')||'').toLowerCase();
      if(texts.some(t=>txt.includes(t))) return btn;
    }
    return null;
  }

  function sendStats(status){ chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status }); savedState = { filledCount, timestamp: Date.now() }; chrome.storage.local.set({ fillerState: savedState }); }

  function isControlFilled(ctrl){
    if (!isVisible(ctrl) || ctrl.disabled) return true;
    const tag = ctrl.tagName.toLowerCase();
    if (tag === 'select') return !!ctrl.value;
    if (ctrl.type === 'checkbox') return !!ctrl.checked;
    if (ctrl.type === 'radio') return true;
    if (tag === 'textarea') return !!ctrl.value;
    if (ctrl.type === 'hidden') return true;
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
    for (const f of inputs){
      if (!isRunning) return { filled, allFilled: false };
      if (!isVisible(f) || f.disabled || f.readOnly) continue;
      if (f.type === 'checkbox' || f.type === 'radio') continue;
      if (f.value) continue;
      await fillField(f);
      filled = true;
      await sleep(settings.delay || 200);
    }
    for (const s of selects){ if (!isRunning) return { filled, allFilled: false }; if (isVisible(s) && !s.disabled && !s.value) { fillSelect(s); filled = true; await sleep(settings.delay || 150); } }
    for (const c of checkboxes){ if (!isRunning) return { filled, allFilled: false }; if (isVisible(c) && !c.disabled && !c.checked) { fillCheckbox(c); filled = true; await sleep(80); } }
    for (const name in radios){ if (!isRunning) return { filled, allFilled: false }; const group = radios[name].filter(r=>isVisible(r) && !r.disabled); if (group.length && !group.some(r=>r.checked)){ fillRadio(group); filled = true; await sleep(80); } }
    const controls = Array.from(document.querySelectorAll('input,textarea,select')).filter(c=>isVisible(c) && !c.disabled);
    const radioGroups = {};
    controls.forEach(c=>{ if (c.type === 'radio') { if (!radioGroups[c.name]) radioGroups[c.name]=[]; radioGroups[c.name].push(c); } });
    let allFilled = true;
    for (const c of controls){ if (c.type === 'radio') continue; if (c.type === 'hidden') continue; if (!isControlFilled(c)) { allFilled = false; break; } }
    for (const name in radioGroups){ const group = radioGroups[name].filter(r=>isVisible(r) && !r.disabled); if (group.length && !group.some(r=>r.checked)) { allFilled = false; break; } }
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
    } catch (e) { }
    return false;
  }

  async function runLoop(){
    while (isRunning) {
      try {
        const { filled, allFilled } = await fillPage();
        if (!isRunning) break;
        if (filled || allFilled) {
          const clicked = await tryClickContinue(allFilled);
          if (clicked) {
            sendStats('waiting');
            await sleep(settings.submitDelay || 500);
            continue;
          } else {
            await sleep(700);
            continue;
          }
        } else {
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
      settings = Object.assign({}, settings, msg.settings || {});
      if (msg.resume) {
        chrome.storage.local.get(['fillerState'], (data) => {
          if (data && data.fillerState) { savedState = data.fillerState; filledCount = savedState.filledCount || 0; }
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
      return true;
    }
  });

  chrome.storage.local.get(['fillerState'], (data) => {
    if (data && data.fillerState) {
      chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount: data.fillerState.filledCount || 0, status: 'waiting' });
    }
  });

})();
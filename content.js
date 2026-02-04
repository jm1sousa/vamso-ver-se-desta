// Content script — behaviour requested: force dates to '2/22/2000' (native date -> 2000-02-22) and select first dropdown option for
// dropdowns
(() => {
  let isRunning = false;
  let filledCount = 0;
  let settings = { delay: 80, submitDelay: 500 }; // default typing delay small but visible
  let savedState = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isVisible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';

  function dispatchInput(el){
    try { el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
    catch(e){ el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function dispatchChange(el){ el.dispatchEvent(new Event('change', { bubbles: true })); }

  // Heuristics to detect elements that act like custom dropdown triggers (avoid typing into them)
  function isCustomSelectTrigger(el) {
    if (!el) return false;
    const role = el.getAttribute && el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox' || el.getAttribute('aria-haspopup') === 'listbox') return true;
    const cls = (el.className||'').toString().toLowerCase();
    if (cls.includes('select') || cls.includes('dropdown') || cls.includes('combobox') || cls.includes('choice')) return true;
    // clickable input-like triggers
    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'div' || tag === 'button' || tag === 'span' || tag === 'a') {
      if (el.querySelector && (el.querySelector('svg') || el.querySelector('.chevron') || el.querySelector('.arrow') || el.querySelector('[data-icon]'))) return true;
    }
    // input that likely is a dropdown (has list or aria attributes)
    if (tag === 'input') {
      if (el.getAttribute('list')) return true;
      const at = (el.getAttribute('aria-expanded') || '').toLowerCase();
      if (at === 'true' || at === 'false') return true;
    }
    return false;
  }

  // Find visible option elements in overlays/popups
  function findOpenOptions() {
    const selectors = [
      '[role="option"]',
      '[role="menuitem"]',
      'ul[role="listbox"] li',
      '.select-option',
      '.dropdown-item',
      '.option',
      '.rc-select-item',
      '.ant-select-item',
      '.v-select__list li',
      '.MuiList-root li'
    ];
    const found = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el=>{
        if (isVisible(el) && (el.textContent||'').trim()) found.push(el);
      });
    }
    // fallback: any large clickable element with text (avoid form controls)
    if (found.length === 0) {
      document.querySelectorAll('body *').forEach(el=>{
        if (!isVisible(el)) return;
        if (el.childElementCount > 0) return;
        const text = (el.textContent||'').trim();
        if (!text) return;
        const tag = el.tagName.toLowerCase();
        if (['input','textarea','select','label','button'].includes(tag)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.height > 18) found.push(el);
      });
    }
    return [...new Set(found)];
  }

  // Try to open custom dropdown and click first visible option
  async function handleCustomSelect(trigger) {
    if (!trigger) return false;
    try {
      trigger.focus();
      // Click to open
      trigger.click && trigger.click();
      trigger.dispatchEvent && trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(120);
      // Look for options in overlays
      const opts = findOpenOptions();
      if (opts.length) {
        const opt = opts[0];
        try { opt.scrollIntoView({ block:'center' }); } catch(e){};
        await sleep(40);
        opt.click && opt.click();
        opt.dispatchEvent && opt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(60);
        dispatchInput(trigger);
        dispatchChange(trigger);
        return true;
      }
      // fallback: try keyboard navigation (ArrowDown + Enter)
      try {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await sleep(80);
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await sleep(80);
        return true;
      } catch(e){}
    } catch(e){}
    return false;
  }

  // For datalist-backed inputs pick first option value
  async function handleDatalistInput(input) {
    const listId = input.getAttribute && input.getAttribute('list');
    if (!listId) return false;
    const dl = document.getElementById(listId);
    if (!dl) return false;
    const opt = dl.querySelector('option[value]');
    if (!opt) return false;
    // set value directly and dispatch events
    input.focus();
    input.value = opt.value;
    dispatchInput(input);
    dispatchChange(input);
    input.blur();
    return true;
  }

  // For native <select> choose first non-empty option
  function fillSelectNative(s) {
    const opts = [...s.options].filter(o => o.value && !o.disabled);
    if (opts.length) {
      const idx = [...s.options].findIndex(o => o.value && !o.disabled);
      if (idx >= 0) s.selectedIndex = idx;
      dispatchInput(s);
      dispatchChange(s);
      s.dispatchEvent && s.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Type simulation for masked inputs (we'll type '2/22/2000' for textual date fields)
  async function simulateTyping(el, value) {
    el.focus();
    // clear
    if (el.value !== undefined) el.value = '';
    for (let i=0;i<value.length;i++){
      const ch = value[i];
      // fire key events then update value
      try { el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true })); } catch(e){}
      try { el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true })); } catch(e){}
      if (el.value !== undefined) el.value = (el.value || '') + ch;
      dispatchInput(el);
      try { el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true })); } catch(e){}
      await sleep(settings.delay || 80);
    }
    dispatchChange(el);
    el.blur();
  }

  // Determine whether a control is date-like (and not native type=date)
  function isTextDateControl(f) {
    if (!f) return false;
    const ph = (f.placeholder||'').toLowerCase();
    const name = (f.name||'').toLowerCase();
    const id = (f.id||'').toLowerCase();
    const label = ( (f.getAttribute && f.getAttribute('aria-label')) || (f.closest && (f.closest('label') && f.closest('label').textContent)) || '' ).toLowerCase();
    if (ph.includes('mm') || ph.includes('dd') || ph.includes('yyyy') || ph.includes('/')) return true;
    if (name.includes('date') || name.includes('birth') || name.includes('nascimento')) return true;
    if (id.includes('date') || id.includes('birth') || label.includes('date') || label.includes('birth') ) return true;
    return false;
  }

  // Main field filler with the new rules:
  // - All textual/masked date fields -> '2/22/2000' (simulate typing)
  // - input[type="date"] -> '2000-02-22' (set value)
  // - dropdown triggers -> select first option (no typing)
  async function fillField(f) {
    if (!f || !isVisible(f) || f.disabled || f.readOnly) return false;

    const tag = (f.tagName||'').toLowerCase();

    // Native select
    if (tag === 'select') {
      return fillSelectNative(f);
    }

    // If control is custom select trigger, handle as dropdown (do NOT type)
    if (isCustomSelectTrigger(f)) {
      const handled = await handleCustomSelect(f);
      return handled;
    }

    // Datalist
    if (f.getAttribute && f.getAttribute('list')) {
      const ok = await handleDatalistInput(f);
      if (ok) return true;
    }

    // Native date
    if (f.type === 'date') {
      try {
        f.focus();
        f.value = '2000-02-22'; // native format
        dispatchInput(f);
        dispatchChange(f);
        f.blur();
        return true;
      } catch(e){}
    }

    // Textual/masked date fields -> type '2/22/2000'
    if (isTextDateControl(f)) {
      await simulateTyping(f, '2/22/2000');
      return true;
    }

    // Default behavior: type a generic value (keeps previous behavior)
    // simple heuristic value
    const tagName = tag;
    let v = '';
    if (tagName === 'textarea') v = 'Teste automático';
    else {
      const t = (f.type||'').toLowerCase();
      if (t === 'email') v = 'teste@swordhealth.com';
      else if (t === 'tel') v = '912345678';
      else if (t === 'number') v = '42';
      else v = 'Teste automático';
    }
    await simulateTyping(f, v);
    return true;
  }

  function isControlFilled(ctrl){
    if (!ctrl || !isVisible(ctrl) || ctrl.disabled) return true;
    const tag = (ctrl.tagName||'').toLowerCase();
    if (tag === 'select') return !!ctrl.value;
    if (ctrl.type === 'checkbox') return !!ctrl.checked;
    if (ctrl.type === 'radio') return true; // group-level
    if (tag === 'textarea') return !!ctrl.value;
    if (ctrl.type === 'hidden') return true;
    return !!ctrl.value;
  }

  async function fillPage() {
    if (!isRunning) return { filled:false, allFilled:false };
    let filledAny = false;

    // Inputs and textareas
    const inputs = Array.from(document.querySelectorAll('input,textarea'));
    for (const f of inputs) {
      if (!isRunning) return { filled: filledAny, allFilled: false };
      if (!isVisible(f) || f.disabled || f.readOnly) continue;
      if (f.type === 'checkbox' || f.type === 'radio') continue;
      // If already has a value, skip
      if (f.value) continue;
      // Avoid typing into elements that are dropdown triggers: handled inside fillField
      const ok = await fillField(f);
      if (ok) { filledAny = true; await sleep(60); }
    }

    // Native selects
    const selects = Array.from(document.querySelectorAll('select'));
    for (const s of selects) {
      if (!isRunning) return { filled: filledAny, allFilled: false };
      if (!isVisible(s) || s.disabled) continue;
      if (!s.value) {
        const ok = fillSelectNative(s);
        if (ok) { filledAny = true; await sleep(60); }
      }
    }

    // Checkboxes
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    for (const c of checkboxes) {
      if (!isRunning) return { filled: filledAny, allFilled: false };
      if (!isVisible(c) || c.disabled) continue;
      if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); filledAny = true; await sleep(40); }
    }

    // Radios: pick first visible in group
    const radioNodes = Array.from(document.querySelectorAll('input[type="radio"]'));
    const radios = {};
    radioNodes.forEach(r => { if (!radios[r.name]) radios[r.name] = []; radios[r.name].push(r); });
    for (const name in radios) {
      if (!isRunning) return { filled: filledAny, allFilled: false };
      const group = radios[name].filter(r => isVisible(r) && !r.disabled);
      if (group.length && !group.some(r=>r.checked)) {
        const r = group[0];
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        filledAny = true;
        await sleep(40);
      }
    }

    // Determine if all visible controls are filled
    const controls = Array.from(document.querySelectorAll('input,textarea,select')).filter(c => isVisible(c) && !c.disabled);
    const radioGroups = {};
    controls.forEach(c => { if (c.type === 'radio') { if (!radioGroups[c.name]) radioGroups[c.name] = []; radioGroups[c.name].push(c); } });

    let allFilled = true;
    for (const c of controls) {
      if (c.type === 'radio') continue;
      if (c.type === 'hidden') continue;
      if (!isControlFilled(c)) { allFilled = false; break; }
    }
    for (const name in radioGroups) {
      const group = radioGroups[name].filter(r=>isVisible(r) && !r.disabled);
      if (group.length && !group.some(r=>r.checked)) { allFilled = false; break; }
    }

    if (filledAny) {
      filledCount++;
      chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status: allFilled ? 'waiting' : 'running' });
      savedState = { filledCount, timestamp: Date.now() };
      chrome.storage.local.set({ fillerState: savedState });
    }

    return { filled: filledAny, allFilled };
  }

  async function tryClickContinue(force=false){
    const texts = ['continuar','próximo','seguinte','avançar','continue','next','submit','enviar','confirmar','ok'];
    for (const btn of document.querySelectorAll('button,input[type="submit"],[role="button"],a')) {
      if (!isVisible(btn) || btn.disabled) continue;
      const txt = (btn.textContent||btn.value||btn.getAttribute('aria-label')||'').toLowerCase();
      if (texts.some(t => txt.includes(t))) {
        const invalids = document.querySelectorAll('input:invalid,input:required:invalid,select:invalid,textarea:invalid');
        if (!force && invalids.length > 0) return false;
        try {
          btn.click && btn.click();
          btn.dispatchEvent && btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          if (btn.tagName.toLowerCase() === 'input' && btn.type === 'submit') { (btn.form || {}).submit && (btn.form.submit()); }
          return true;
        } catch(e){}
      }
    }
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
            chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status: 'waiting' });
            await sleep(settings.submitDelay || 500);
            continue;
          } else {
            await sleep(700);
            continue;
          }
        } else {
          chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status: 'complete' });
          isRunning = false;
          chrome.runtime.sendMessage({ type: 'stopped' });
          chrome.storage.local.set({ isRunning: false });
          break;
        }
      } catch (err) {
        chrome.runtime.sendMessage({ type: 'error', message: err && err.message ? err.message : 'Erro desconhecido' });
        isRunning = false;
        chrome.storage.local.set({ isRunning: false });
        break;
      }
    }
  }

  // message handlers (popup)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'start') {
      settings = Object.assign({}, settings, msg.settings || {});
      if (msg.resume) {
        chrome.storage.local.get(['fillerState'], (data) => {
          if (data && data.fillerState) { savedState = data.fillerState; filledCount = savedState.filledCount || 0; }
          isRunning = true; chrome.storage.local.set({ isRunning: true }); chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status: 'running' }); runLoop();
        });
      } else {
        filledCount = 0; isRunning = true; chrome.storage.local.set({ isRunning: true }); chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount, status: 'running' }); runLoop();
      }
      sendResponse({ started: true });
    }
    if (msg.action === 'stop') {
      isRunning = false; chrome.storage.local.set({ isRunning: false }); chrome.runtime.sendMessage({ type: 'stopped' }); sendResponse({ stopped: true });
    }
    if (msg.action === 'getState') {
      chrome.storage.local.get(['fillerState'], (data) => { sendResponse({ hasState: !!(data && data.fillerState), state: data.fillerState || null }); });
      return true;
    }
  });

  // notify popup if fillerState exists
  chrome.storage.local.get(['fillerState'], (data) => { if (data && data.fillerState) chrome.runtime.sendMessage({ type: 'statsUpdate', filledCount: data.fillerState.filledCount || 0, status: 'waiting' }); });

})();
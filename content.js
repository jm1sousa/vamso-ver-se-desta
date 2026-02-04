(function() {
  let isRunning = false, filledCount = 0, settings = {}, savedState = null;

  const fictionNames = ["Harry Potter","Hermione Granger","Ron Weasley","Frodo Baggins","Samwise Gamgee","Gandalf","Aragorn","Legolas","Katniss Everdeen","Peeta Mellark","Tony Stark","Bruce Wayne","Clark Kent","Diana Prince","Peter Parker"];
  function randomName() { return fictionNames[Math.floor(Math.random()*fictionNames.length)]; }
  function randomEmail() { 
    const name = randomName().toLowerCase().replace(/[^a-z]/g,''); 
    return `${name}@swordhealth.com`; 
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isVisible = el => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null;

  function getLabel(f) {
    if (f.id) {
      const l = document.querySelector(`label[for="${f.id}"]`);
      if (l) return l.textContent;
    }
    const p = f.closest('label');
    if (p) return p.textContent;
    return f.getAttribute('aria-label') || '';
  }

  function getValue(f) {
    const n = (f.name||'').toLowerCase(), id = (f.id||'').toLowerCase(), t = (f.type||'').toLowerCase(), ph = (f.placeholder||'').toLowerCase(), lb = getLabel(f).toLowerCase(), c = `${n} ${id} ${ph} ${lb}`;
    if (t === 'email' || c.includes('email')) return randomEmail();
    if (t === 'tel' || c.includes('phone') || c.includes('telefone') || c.includes('telemóvel')) return '91'+Math.floor(Math.random()*10000000).toString().padStart(7,'0');
    if (c.includes('firstname') || c.includes('primeiro')) return randomName().split(' ')[0];
    if (c.includes('lastname') || c.includes('apelido')) return randomName().split(' ')[1] || 'Smith';
    if (c.includes('name') || c.includes('nome')) return randomName();
    if (c.includes('address') || c.includes('morada')) return `Rua Exemplo ${Math.floor(Math.random()*100)}`;
    if (c.includes('city') || c.includes('cidade')) return ['Lisboa','Porto','Braga','Coimbra','Faro'][Math.floor(Math.random()*4)];
    if (c.includes('postal') || c.includes('zip')) return `${Math.floor(Math.random()*9000)+1000}-${Math.floor(Math.random()*900)+100}`;
    if (c.includes('company') || c.includes('empresa')) return ['Tech','Global','Digital'][Math.floor(Math.random()*3)] + ' Corp';
    if (c.includes('age') || c.includes('idade') || t==='number') return (Math.floor(Math.random()*50)+18).toString();
    if (t==='date' || c.includes('birth') || c.includes('nascimento')) {
      const d = new Date(1970+Math.floor(Math.random()*50), Math.floor(Math.random()*12), 1+Math.floor(Math.random()*28));
      return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    return "Teste automático";
  }

  async function fillField(f) {
    if (!f) return;
    let v = getValue(f);
    if (!v) return;
    if (f.type === 'number') v = v.replace(/\D/g,''); // números apenas
    f.focus(); f.value = '';
    for (let i=0;i<v.length;i++) { f.value = v.substring(0,i+1); f.dispatchEvent(new Event('input',{bubbles:true})); await sleep(settings.delay||200); }
    f.dispatchEvent(new Event('change',{bubbles:true}));
    f.blur();
  }

  function fillSelect(s) {
    if (!s) return;
    const opts = [...s.options].filter(o=>o.value && !o.disabled);
    if (opts.length) { s.selectedIndex = 0; s.dispatchEvent(new Event('change',{bubbles:true})); }
  }

  function fillCheckbox(c) {
    if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change',{bubbles:true})); c.dispatchEvent(new Event('click',{bubbles:true})); }
  }

  function fillRadio(radios) {
    if (radios.length) {
      const r = radios.find(x=>!x.checked);
      if(r){ r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); }
    }
  }

  function findContinueBtn() {
    const texts = ['continuar','próximo','seguinte','avançar','continue','next','submit','enviar','confirmar'];
    for (const btn of document.querySelectorAll('button,input[type="submit"],[role="button"]')) {
      if(!isVisible(btn)||btn.disabled) continue;
      const txt = (btn.textContent||btn.value||'').toLowerCase();
      if(texts.some(t=>txt.includes(t))) return btn;
    }
    return null;
  }

  async function fillPage() {
    if(!isRunning) return false;
    const inputs = document.querySelectorAll('input,textarea');
    const selects = document.querySelectorAll('select');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const radios = {};
    document.querySelectorAll('input[type="radio"]').forEach(r=>{ if(!radios[r.name]) radios[r.name]=[]; radios[r.name].push(r); });

    let filled=false;
    for(const f of inputs){
      if(!isRunning) return false;
      if(isVisible(f) && !f.disabled && !f.readOnly && !f.value) { await fillField(f); filled=true; await sleep(settings.delay||300); }
    }
    for(const s of selects){
      if(!isRunning) return false;
      if(isVisible(s) && !s.disabled) { fillSelect(s); filled=true; await sleep(settings.delay||200); }
    }
    for(const c of checkboxes){
      if(!isRunning) return false;
      if(isVisible(c)) { fillCheckbox(c); filled=true; await sleep(100); }
    }
    for(const name in radios){
      if(!isRunning) return false;
      const group = radios[name].filter(r=>isVisible(r) && !r.disabled);
      if(group.length && !group.some(r=>r.checked)){ fillRadio(group); filled=true; await sleep(100); }
    }

    if(filled) { filledCount++; sendStats(); }
    return filled;
  }

  async function runFormFiller() {
    if(!isRunning) return;
    await fillPage();

    const continueBtn = findContinueBtn();
    if(continueBtn && document.querySelectorAll('input:invalid,input:required:invalid').length===0) {

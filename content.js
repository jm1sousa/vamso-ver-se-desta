(function() {
  let isRunning = false;
  let filledCount = 0;
  let settings = { delay: 300, submitDelay: 500 };
  let savedState = null;

  // Gerador de dados
  const gen = {
    characters: [
      'Harry Potter','Hermione Granger','Ron Weasley','Frodo Baggins','Gandalf','Aragorn','Legolas','Leia Organa','Luke Skywalker','Darth Vader','Jon Snow','Daenerys Targaryen','Tyrion Lannister','Arya Stark','Bilbo Baggins'
    ],
    firstName: function() { return this.characters[Math.floor(Math.random()*this.characters.length)].split(' ')[0]; },
    lastName: function() { return this.characters[Math.floor(Math.random()*this.characters.length)].split(' ').slice(1).join(''); },
    fullName: function() { return this.characters[Math.floor(Math.random()*this.characters.length)]; },
    email: function() { 
      const c = this.characters[Math.floor(Math.random()*this.characters.length)];
      const email = c.toLowerCase().replace(/[^a-z]/g,'') + '@swordhealth.com';
      return email;
    },
    phone: function() { return ['91','92','93','96'][Math.floor(Math.random()*4)] + Math.floor(Math.random()*10000000).toString().padStart(7,'0'); },
    number: function(min=1,max=100) { return Math.floor(Math.random()*(max-min+1))+min; },
    date: function() {
      const d = new Date();
      const mm = (d.getMonth()+1).toString().padStart(2,'0');
      const dd = d.getDate().toString().padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    },
    sentence: function() { return 'Texto de teste'; },
    paragraph: function() { return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'; }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const isVisible = el => el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;

  function getLabel(f) {
    if (f.id) { const l = document.querySelector(`label[for="${f.id}"]`); if(l) return l.textContent; }
    const p = f.closest('label'); if(p) return p.textContent;
    return f.getAttribute('aria-label') || '';
  }

  function getValue(f) {
    const n = (f.name||'').toLowerCase();
    const t = (f.type||'').toLowerCase();
    const lb = getLabel(f).toLowerCase();

    if(t==='email' || n.includes('email') || lb.includes('email')) return gen.email();
    if(t==='tel' || n.includes('phone') || lb.includes('phone')) return gen.phone();
    if(t==='number') return gen.number(parseInt(f.min)||1, parseInt(f.max)||100).toString();
    if(t==='date' || lb.includes('birth') || lb.includes('data')) return gen.date();
    if(n.includes('firstname') || lb.includes('primeiro')) return gen.firstName();
    if(n.includes('lastname') || lb.includes('apelido')) return gen.lastName();
    if(n.includes('name') || lb.includes('nome')) return gen.fullName();
    if(lb.includes('message') || f.tagName.toLowerCase()==='textarea') return gen.paragraph();
    return gen.sentence();
  }

  async function fillField(f) {
    if(!f || !isVisible(f) || f.disabled || f.readOnly) return;
    const v = getValue(f);
    f.focus();
    f.value = '';
    for(let i=0;i<v.length;i++){
      f.value = v.substring(0,i+1);
      f.dispatchEvent(new Event('input',{bubbles:true}));
      await sleep(settings.delay);
    }
    f.dispatchEvent(new Event('change',{bubbles:true}));
    f.blur();
  }

  function fillSelect(s) {
    if(!s || !isVisible(s) || s.disabled || s.options.length===0) return;
    for(const opt of s.options) {
      if(opt.value && !opt.disabled) { s.value = opt.value; s.dispatchEvent(new Event('change',{bubbles:true})); break; }
    }
  }

  function fillCheckbox(c) { if(isVisible(c) && !c.checked){ c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); } }

  function fillRadio(radios) { if(radios.length){ const r = radios.find(r=>isVisible(r) && !r.checked); if(r){ r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); } } }

  async function fillPage() {
    const inputs = document.querySelectorAll('input,textarea');
    const selects = document.querySelectorAll('select');
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const radioGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(r => { if(!radioGroups[r.name]) radioGroups[r.name]=[]; radioGroups[r.name].push(r); });

    let filled=false;

    for(const f of inputs) { await fillField(f); filled=true; }
    for(const s of selects) { fillSelect(s); filled=true; }
    for(const c of checkboxes) { fillCheckbox(c); filled=true; }
    for(const name in radioGroups) { fillRadio(radioGroups[name]); filled=true; }

    if(filled){ filledCount++; saveState(); sendStats(); }

    return filled;
  }

  function findContinueBtn() {
    const texts = ['continuar','próximo','seguinte','avançar','next','submit','enviar','confirmar'];
    for(const btn of document.querySelectorAll('button,input[type="submit"],[role="button"]')){
      if(!isVisible(btn) || btn.disabled) continue;
      const txt = (btn.textContent||btn.value||'').toLowerCase();
      if(texts.some(t=>txt.includes(t))) return btn;
    }
    return null;
  }

  function saveState() { savedState = { url: location.href, filledCount, timestamp: Date.now() }; chrome.storage.local.set({ formFillerState: savedState }); }
  async function loadState() { return new Promise(r=>chrome.storage.local.get(['formFillerState'],d=>{ savedState=d.formFillerState||null; r(savedState); })); }
  function clearState() { savedState=null; chrome.storage.local.remove(['formFillerState']); }
  function sendStats(status='running'){ chrome.runtime.sendMessage({type:'statsUpdate', filledCount, status}); }

  async function runFiller() {
    if(!isRunning) return;
    await fillPage();

    const btn=findContinueBtn();
    if(btn){ await sleep(settings.submitDelay); btn.click(); await sleep(1000); if(isRunning) runFiller(); }
    else sendStats('waiting');
  }

  function stop() { isRunning=false; saveState(); chrome.runtime.sendMessage({type:'stopped'}); }

  chrome.runtime.onMessage.addListener((msg)=>{
    if(msg.action==='start'){ isRunning=true; settings=msg.settings||settings; if(msg.resume && savedState) filledCount=savedState.filledCount||0; else { filledCount=0; clearState(); } runFiller(); }
    if(msg.action==='stop') stop();
    if(msg.action==='getState') chrome.runtime.sendMessage({type:'statsUpdate', filledCount, status:'waiting'}); 
  });
})();

/* ============================================================
   Dialysis Companion — interactions
   Personal data stays local unless the user explicitly syncs the care card.
   ============================================================ */
(function () {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const bi = (tl, en) => `<span class="tl" lang="tl">${tl}</span><span class="en" lang="en">${en}</span>`;
  const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat('en-PH');

  /* Move settings saved under the old site name, so nothing is lost. */
  const legacyPrefix = 'bato' + 'care-';
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.indexOf(legacyPrefix) !== 0) return;
      const next = 'dc-' + key.slice(legacyPrefix.length);
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key));
      localStorage.removeItem(key);
    });
  } catch (err) { /* storage may be blocked */ }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (err) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage may be blocked */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------
     Language
     ------------------------------------------------------------ */
  const langKey = 'dc-lang-v2';
  const localizeOptions = (mode) => {
    $$('option[data-tl]').forEach((opt) => {
      const text = mode === 'tl' ? opt.getAttribute('data-tl') : opt.getAttribute('data-en');
      if (text) opt.textContent = text;
    });
  };
  const setLanguage = (mode) => {
    if (!['tl', 'en'].includes(mode)) mode = 'tl';
    root.setAttribute('data-lang', mode);
    root.setAttribute('lang', mode === 'en' ? 'en' : 'tl');
    document.title = mode === 'en'
      ? 'Dialysis Companion | A guide for Filipino families'
      : 'Dialysis Companion | Gabay para sa Pamilyang Pilipino';
    localizeOptions(mode);
    $$('[data-set-lang]').forEach((btn) => {
      const on = btn.getAttribute('data-set-lang') === mode;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem(langKey, mode); } catch (err) { /* ignore */ }
  };
  let initialLang = 'tl';
  try { initialLang = localStorage.getItem(langKey) || 'tl'; } catch (err) { /* ignore */ }
  if (initialLang === 'bi') initialLang = 'tl';
  setLanguage(initialLang);
  $$('.tl').forEach((el) => { if (!el.getAttribute('lang')) el.setAttribute('lang', 'tl'); });
  $$('.en').forEach((el) => { if (!el.getAttribute('lang')) el.setAttribute('lang', 'en'); });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set-lang]');
    if (btn) setLanguage(btn.getAttribute('data-set-lang'));
  });

  /* ------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------ */
  const menuToggle = $('#menuToggle');
  const mobileMenu = $('#mobileMenu');
  const closeMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  };
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const open = mobileMenu.hidden;
      mobileMenu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        const first = mobileMenu.querySelector('a');
        if (first) first.focus({ preventScroll: true });
      }
    });
    mobileMenu.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('[data-set-lang]')) closeMenu();
    });
    document.addEventListener('click', (e) => {
      if (mobileMenu.hidden) return;
      if (!mobileMenu.contains(e.target) && !menuToggle.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !mobileMenu.hidden) {
        closeMenu();
        menuToggle.focus();
      }
    });
  }

  /* ------------------------------------------------------------
     Tabs
     ------------------------------------------------------------ */
  $$('[data-tabs]').forEach((group) => {
    const tabs = $$('[role="tab"]', group);
    const panels = $$('[role="tabpanel"]', group);
    if (!tabs.length) return;
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach((p) => { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (e.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') next = tabs[0];
        if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
  });

  /* ------------------------------------------------------------
     Checklists (persisted per group)
     ------------------------------------------------------------ */
  $$('[data-checklist]').forEach((group) => {
    const key = 'dc-check-' + (group.getAttribute('data-check-group') || 'default');
    const boxes = $$('[data-check-id]', group);
    let state = store.get(key, {});
    const bar = $('[data-progress-bar]', group);
    const track = $('[data-progress-track]', group);
    const text = $('[data-progress-text]', group);

    const paint = (box) => {
      const label = box.closest('.check-item');
      if (label) label.classList.toggle('done', box.checked);
    };
    const progress = () => {
      const done = boxes.filter((b) => b.checked).length;
      const total = boxes.length || 1;
      const pct = Math.round((done / total) * 100);
      if (bar) bar.style.width = pct + '%';
      if (text) text.textContent = done + ' / ' + boxes.length;
      if (track) track.setAttribute('aria-valuenow', String(pct));
    };
    boxes.forEach((box) => {
      const id = box.getAttribute('data-check-id');
      box.checked = !!state[id];
      paint(box);
      box.addEventListener('change', () => {
        state[id] = box.checked;
        store.set(key, state);
        paint(box);
        progress();
      });
    });
    progress();
    const reset = $('[data-reset-checklist]', group);
    if (reset) reset.addEventListener('click', () => {
      state = {};
      store.remove(key);
      boxes.forEach((box) => { box.checked = false; paint(box); });
      progress();
      showToast('Na-reset / Reset');
    });
  });

  /* ------------------------------------------------------------
     Toast
     ------------------------------------------------------------ */
  let toastTimer = null;
  const toast = $('#toast');
  function showToast(message) {
    if (!toast) return;
    toast.innerHTML = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  /* ------------------------------------------------------------
     Fluid tracker
     ------------------------------------------------------------ */
  const fluidLimit = $('#fluidLimit');
  const fluidDrinks = $('#fluidDrinks');
  const fluidRemaining = $('#fluidRemaining');
  const fluidSub = $('#fluidSub');
  const fluidMeter = $('#fluidMeter');
  const fluidMeterFill = $('#fluidMeterFill');
  const fluidLimitLabel = $('#fluidLimitLabel');
  const fluidKey = 'dc-fluid';
  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  let fluidState = store.get(fluidKey, { date: todayKey(), limit: '', drinks: 0 });
  if (fluidState.date !== todayKey()) fluidState = { date: todayKey(), limit: fluidState.limit || '', drinks: 0 };
  if (fluidLimit) {
    fluidLimit.value = fluidState.limit || '';
    fluidDrinks.value = fluidState.drinks || 0;
    const update = () => {
      const limit = Math.max(0, Number(fluidLimit.value) || 0);
      const drinks = Math.max(0, Number(fluidDrinks.value) || 0);
      const left = limit - drinks;
      if (fluidRemaining) fluidRemaining.textContent = limit ? num.format(left) : '—';
      if (fluidLimitLabel) fluidLimitLabel.textContent = limit ? num.format(limit) + ' mL' : 'Limit / Limit';
      if (fluidSub) {
        if (!limit) fluidSub.innerHTML = bi('Ilagay ang limit na ibinigay ng team para makita ang natitira.', 'Enter the limit given by your team to see what is left.');
        else if (left < 0) fluidSub.innerHTML = bi('Lampas na ng ' + num.format(Math.abs(left)) + ' mL. Ipaalam sa nurse o dietitian.', 'Over by ' + num.format(Math.abs(left)) + ' mL. Tell your nurse or dietitian.');
        else fluidSub.innerHTML = bi('Natitira pang likido ngayong araw. Kasama ang sabaw, kape, at yelo.', 'Fluid left for today. This includes soup, coffee, and ice.');
      }
      if (fluidMeter && fluidMeterFill) {
        const pct = limit ? Math.min(100, (drinks / limit) * 100) : 0;
        fluidMeterFill.style.width = pct + '%';
        fluidMeter.classList.toggle('over', limit > 0 && drinks > limit);
      }
      fluidState = { date: todayKey(), limit: fluidLimit.value, drinks: fluidDrinks.value };
      store.set(fluidKey, fluidState);
    };
    fluidLimit.addEventListener('input', update);
    fluidDrinks.addEventListener('input', update);
    $$('[data-add-fluid]').forEach((btn) => btn.addEventListener('click', () => {
      const add = Number(btn.getAttribute('data-add-fluid')) || 0;
      fluidDrinks.value = (Number(fluidDrinks.value) || 0) + add;
      update();
      showToast('+' + add + ' mL');
    }));
    const reset = $('#resetFluid');
    if (reset) reset.addEventListener('click', () => {
      fluidDrinks.value = 0;
      update();
      showToast(bi('Na-reset ang nainom ngayong araw.', 'Today’s drinks were reset.'));
    });
    update();
  }

  /* ------------------------------------------------------------
     Weight / fluid gain
     ------------------------------------------------------------ */
  const dryWeight = $('#dryWeight');
  const preWeight = $('#preWeight');
  const weightResult = $('#weightResult');
  if (dryWeight && preWeight && weightResult) {
    const updateWeight = () => {
      const dry = Number(dryWeight.value) || 0;
      const pre = Number(preWeight.value) || 0;
      if (!dry || !pre) {
        weightResult.className = 'result-box';
        weightResult.innerHTML = '<strong>—</strong><p>' + bi('Ilagay ang dry weight at timbang pagdating upang makita ang agwat. Ipaalam sa nurse ang resulta; hindi ito diagnosis.', 'Enter your dry weight and arrival weight to see the difference. Share the result with your nurse; it is not a diagnosis.') + '</p>';
        return;
      }
      const diff = pre - dry;
      const pct = dry ? (diff / dry) * 100 : 0;
      const sign = diff > 0 ? '+' : '';
      weightResult.className = 'result-box' + (Math.abs(pct) >= 4 ? ' warning' : '');
      weightResult.innerHTML = '<strong>' + sign + diff.toFixed(1) + ' kg</strong><p>' +
        bi('Agwat ng timbang pagdating mula sa dry weight: ' + Math.abs(diff).toFixed(1) + ' kg (' + Math.abs(pct).toFixed(1) + '%). Ipaalam sa nurse/dietitian; hindi ito diagnosis.', 'Arrival weight difference from dry weight: ' + Math.abs(diff).toFixed(1) + ' kg (' + Math.abs(pct).toFixed(1) + '%). Share with your nurse/dietitian; this is not a diagnosis.') + '</p>';
    };
    dryWeight.addEventListener('input', updateWeight);
    preWeight.addEventListener('input', updateWeight);
  }

  /* ------------------------------------------------------------
     Medicine notes
     ------------------------------------------------------------ */
  const medNotes = $('#medNotes');
  if (medNotes) {
    const saved = store.get('dc-mednotes', '');
    if (saved) medNotes.value = saved;
    const save = $('#saveMedNotes');
    if (save) save.addEventListener('click', () => {
      store.set('dc-mednotes', medNotes.value);
      showToast(bi('Naka-save sa device.', 'Saved on this device.'));
    });
  }

  /* ------------------------------------------------------------
     Food finder
     ------------------------------------------------------------ */
  const foods = [
    { nTl: 'Kanin (puting bigas)', nEn: 'White rice', tags: [], noteTl: 'Pangunahing enerhiya. Sukatin ang serving ayon sa plano ng dietitian.', noteEn: 'Main energy source. Measure the portion per your dietitian’s plan.', swapTl: 'Isang tasa, kaunting sabaw at mantika.', swapEn: 'One cup, little broth or oil.' },
    { nTl: 'Pandesal', nEn: 'Pandesal', tags: ['high-na'], noteTl: 'May asin at madaling maubos. Limitahan ang dami.', noteEn: 'Contains salt and is easy to overeat. Limit the amount.', swapTl: 'Isang piraso na may itlog o maliit na isda.', swapEn: 'One piece with egg or small fish.' },
    { nTl: 'Instant noodles', nEn: 'Instant noodles', tags: ['high-na', 'high-p'], noteTl: 'Mataas sa sodium at phosphate additives. Itapon ang sabaw at bawasan ang seasoning.', noteEn: 'High in sodium and phosphate additives. Discard the broth and use less seasoning.', swapTl: 'Kanin, itlog, at sariwang gulay.', swapEn: 'Rice, egg, and fresh vegetables.' },
    { nTl: 'Tuyo at daing', nEn: 'Dried fish', tags: ['high-na'], noteTl: 'Napakataas sa asin; nagpapataas ng BP at uhaw. Limitahan o iwasan.', noteEn: 'Very high in salt; raises BP and thirst. Limit or avoid.', swapTl: 'Sariwang isda na may calamansi at bawang.', swapEn: 'Fresh fish with calamansi and garlic.' },
    { nTl: 'Sariwang bangus', nEn: 'Fresh milkfish', tags: ['protein'], noteTl: 'Magandang protein. Iwasan ang sobrang mantika at dagdag na toyo o patis.', noteEn: 'Good protein. Avoid excess oil and added soy or fish sauce.', swapTl: 'Inihaw o nilaga na may calamansi.', swapEn: 'Grilled or steamed with calamansi.' },
    { nTl: 'Galunggong', nEn: 'Round scad', tags: ['protein'], noteTl: 'Murang protein. Ihaw o pakuluan at bawasan ang asin.', noteEn: 'Affordable protein. Grill or boil and reduce salt.', swapTl: 'Nilaga na may luya at pechay.', swapEn: 'Boiled with ginger and pechay.' },
    { nTl: 'Manok (hindi balat)', nEn: 'Chicken without skin', tags: ['protein'], noteTl: 'Magandang protein. Alisin ang balat at iwasan ang breading.', noteEn: 'Good protein. Remove the skin and avoid breading.', swapTl: 'Nilaga o inihaw na may herbs.', swapEn: 'Boiled or grilled with herbs.' },
    { nTl: 'Itlog', nEn: 'Egg', tags: ['protein', 'high-p'], noteTl: 'Magandang protein; may phosphorus ang yolk. Sundin ang dami sa plano.', noteEn: 'Good protein; the yolk has phosphorus. Follow the amount in your plan.', swapTl: 'Isang itlog na may kanin at gulay.', swapEn: 'One egg with rice and vegetables.' },
    { nTl: 'Monggo', nEn: 'Mung beans', tags: ['high-k', 'high-p'], noteTl: 'Mataas sa potassium at phosphorus. Maliit na serving lamang at itapon ang sabaw.', noteEn: 'High in potassium and phosphorus. Small serving only; discard the broth.', swapTl: 'Maliit na serving na may maraming gulay.', swapEn: 'Small serving with more vegetables.' },
    { nTl: 'Kangkong', nEn: 'Water spinach', tags: ['high-k'], noteTl: 'Mataas sa potassium. Pakuluan sa maraming tubig at itapon ang tubig.', noteEn: 'High in potassium. Boil in plenty of water and discard the water.', swapTl: 'Maliit na serving ng leached kangkong.', swapEn: 'Small serving of leached water spinach.' },
    { nTl: 'Kamote', nEn: 'Sweet potato', tags: ['high-k'], noteTl: 'Mataas sa potassium. Hatiin, banlawan, pakuluan, at itapon ang tubig.', noteEn: 'High in potassium. Slice, rinse, boil, and discard the water.', swapTl: 'Maliit na serving ng leached kamote.', swapEn: 'Small serving of leached sweet potato.' },
    { nTl: 'Saging', nEn: 'Banana', tags: ['high-k'], noteTl: 'Mataas sa potassium. Depende sa lab at serving; itanong kung gaano karami.', noteEn: 'High in potassium. Depends on labs and serving; ask how much is safe.', swapTl: 'Maliit na hiwa ng papaya kung payag.', swapEn: 'A small slice of papaya if allowed.' },
    { nTl: 'Papaya', nEn: 'Papaya', tags: ['high-k'], noteTl: 'May potassium at fiber. Maliit na serving lamang.', noteEn: 'Contains potassium and fiber. Small serving only.', swapTl: 'Maliit na hiwa pagkatapos ng pagkain.', swapEn: 'A small slice after a meal.' },
    { nTl: 'Buko juice', nEn: 'Coconut water', tags: ['high-k', 'fluid'], noteTl: 'Mataas sa potassium at likido. Hindi ito “natural na gamot.”', noteEn: 'High in potassium and fluid. It is not a “natural cure.”', swapTl: 'Tubig sa loob ng limit.', swapEn: 'Water within your limit.' },
    { nTl: 'Softdrinks at cola', nEn: 'Soft drinks and cola', tags: ['high-p', 'fluid'], noteTl: 'May phosphate additives, asukal, at likido. Ang cola ay lalong mataas sa phosphorus.', noteEn: 'Contains phosphate additives, sugar, and fluid. Cola is especially high in phosphorus.', swapTl: 'Tubig o calamansi water sa loob ng limit.', swapEn: 'Water or calamansi water within your limit.' },
    { nTl: 'Hotdog, ham, at processed meat', nEn: 'Hotdog, ham, and processed meat', tags: ['high-na', 'high-p'], noteTl: 'Mataas sa sodium at phosphate additives. Limitahan o iwasan.', noteEn: 'High in sodium and phosphate additives. Limit or avoid.', swapTl: 'Sariwang manok, isda, o lean pork.', swapEn: 'Fresh chicken, fish, or lean pork.' },
    { nTl: 'Salt substitute', nEn: 'Salt substitute', tags: ['high-k'], noteTl: 'Kadalasan potassium chloride — mapanganib sa dialysis. Iwasan.', noteEn: 'Often potassium chloride — dangerous on dialysis. Avoid.', swapTl: 'Calamansi, bawang, luya, at herbs.', swapEn: 'Calamansi, garlic, ginger, and herbs.' },
    { nTl: 'Bawang, luya, at calamansi', nEn: 'Garlic, ginger, and calamansi', tags: [], noteTl: 'Mababang sodium na pampalasa. Gamiting kapalit ng asin.', noteEn: 'Low-sodium flavoring. Use instead of salt.', swapTl: 'Gawing marinade o sawsawan.', swapEn: 'Use as a marinade or dip.' }
  ];

  const foodSearch = $('#foodCheckerInput');
  const foodGrid = $('#foodGrid');
  const foodCount = $('#foodCount');
  if (foodSearch && foodGrid) {
    const tagLabel = { 'high-k': 'High Potassium', 'high-p': 'High Phosphorus', 'high-na': 'High Sodium', protein: 'Protein', fluid: 'Fluid' };
    const renderFoods = () => {
      const q = foodSearch.value.trim().toLowerCase();
      const list = foods.filter((f) => {
        const hay = (f.nTl + ' ' + f.nEn + ' ' + f.noteTl + ' ' + f.noteEn + ' ' + f.swapTl + ' ' + f.swapEn).toLowerCase();
        return !q || hay.includes(q);
      });
      foodGrid.innerHTML = list.length ? list.map((f) => {
        const badges = f.tags.map((t) => '<span class="badge ' + t + '">' + tagLabel[t] + '</span>').join('');
        return '<article class="food-card">' +
          '<h3>' + bi(f.nTl, f.nEn) + '</h3>' +
          (badges ? '<div class="food-badges">' + badges + '</div>' : '') +
          '<p>' + bi(f.noteTl, f.noteEn) + '</p>' +
          '<p class="swap"><strong>' + bi('Mas mabuti', 'Better') + ':</strong> ' + bi(f.swapTl, f.swapEn) + '</p>' +
          '</article>';
      }).join('') : '<div class="food-empty">' + bi('Walang nahanap. Subukan ang ibang salita.', 'No results. Try another word.') + '</div>';
      if (foodCount) foodCount.textContent = list.length + ' / ' + foods.length + ' ' + (list.length === 1 ? 'pagkain / food' : 'pagkain / foods');
    };
    foodSearch.addEventListener('input', renderFoods);
    renderFoods();
  }

  /* ------------------------------------------------------------
     Symptom guide
     ------------------------------------------------------------ */
  const symptomData = {
    breathing: { level: 'red', titleTl: 'Pumunta sa ER ngayon', titleEn: 'Go to the ER now', textTl: 'Maaaring may tubig sa baga o kakulangan sa oxygen. Tumawag sa 911. Huwag maghintay at huwag uminom ng maraming tubig.', textEn: 'There may be fluid in the lungs or low oxygen. Call 911. Do not wait and do not drink a lot of water.' },
    chest: { level: 'red', titleTl: 'Pumunta sa ER ngayon', titleEn: 'Go to the ER now', textTl: 'Sakit ng dibdib, mabigat na dibdib, o sakit na dumadaloy sa braso ay emergency. Tumawag sa 911; huwag magmaneho.', textEn: 'Chest pain, chest heaviness, or pain spreading to the arm is an emergency. Call 911; do not drive yourself.' },
    faint: { level: 'red', titleTl: 'Pumunta sa ER ngayon', titleEn: 'Go to the ER now', textTl: 'Nahimatay, seizure, o pagkalito ay emergency. Ilagay sa ligtas na posisyon kung may seizure at tumawag sa 911.', textEn: 'Fainting, seizure, or confusion is an emergency. Keep the person safe if seizing and call 911.' },
    bleeding: { level: 'red', titleTl: 'Pigilan ang pagdurugo at tumawag', titleEn: 'Stop the bleeding and call', textTl: 'Idiin nang malinis at tuloy-tuloy sa access site nang 10–15 minuto. Kung ayaw tumigil, tumawag sa 911 o pumunta sa ER.', textEn: 'Apply clean, continuous pressure to the access site for 10–15 minutes. If it will not stop, call 911 or go to the ER.' },
    access: { level: 'red', titleTl: 'Tumawag agad sa unit o ER', titleEn: 'Call the unit or ER now', textTl: 'Nawawalang thrill/bruit, malamig at masakit na braso, o namamagang access ay maaaring blood clot o infection. Huwag hintayin.', textEn: 'A missing thrill/bruit, cold and painful arm, or swollen access may be a clot or infection. Do not wait.' },
    fever: { level: 'red', titleTl: 'Tumawag agad sa unit o ER', titleEn: 'Call the unit or ER now', textTl: 'Lagnat at panginginig na may catheter o access ay maaaring infection sa dugo. Huwag maghintay ng susunod na session.', textEn: 'Fever and chills with a catheter or access may be a bloodstream infection. Do not wait for the next session.' },
    pd: { level: 'red', titleTl: 'Tumawag agad sa PD unit', titleEn: 'Call the PD unit now', textTl: 'Malabong drain fluid, sakit ng tiyan, lagnat, o pagsusuka ay maaaring peritonitis. Itago ang bag at tumawag agad.', textEn: 'Cloudy drain fluid, abdominal pain, fever, or vomiting may be peritonitis. Keep the bag and call immediately.' },
    weak: { level: 'red', titleTl: 'Pumunta sa ER ngayon', titleEn: 'Go to the ER now', textTl: 'Malubhang panghihina, paralisis, o iregular na tibok ay maaaring senyales ng mataas na potassium. Emergency ito.', textEn: 'Severe weakness, paralysis, or irregular heartbeat may be a sign of high potassium. This is an emergency.' },
    dizzy: { level: 'amber', titleTl: 'Sabihin sa nurse ngayon', titleEn: 'Tell the nurse now', textTl: 'Umupo o humiga, iangat ang binti, at huwag tumayo agad. Sabihin sa nurse; maaaring kailangan ng fluid adjustment. Kung nahimatay, tumawag sa 911.', textEn: 'Sit or lie down, raise your legs, and do not stand quickly. Tell the nurse; fluid adjustment may be needed. If you faint, call 911.' },
    cramps: { level: 'amber', titleTl: 'Sabihin sa nurse ngayon', titleEn: 'Tell the nurse now', textTl: 'Huwag i-adjust ang machine. Sabihin sa nurse; maaaring baguhin ang ultrafiltration o bigyan ng payo. Kung may sakit ng dibdib, i-escalate agad.', textEn: 'Do not adjust the machine. Tell the nurse; ultrafiltration may need adjustment or advice may be given. If there is chest pain, escalate immediately.' },
    nausea: { level: 'amber', titleTl: 'Sabihin sa nurse ngayon', titleEn: 'Tell the nurse now', textTl: 'Humiga nang patag at iwasan ang mabilis na paggalaw. Kung paulit-ulit ang pagsusuka o may dugo, pumunta sa ER.', textEn: 'Lie flat and avoid quick movements. If vomiting is repeated or contains blood, go to the ER.' },
    swelling: { level: 'amber', titleTl: 'Ipaalam sa team ngayon', titleEn: 'Tell the team today', textTl: 'Pamamaga ng binti, mukha, o biglaang pagtaba ng timbang ay senyales ng sobrang tubig. Kung may hirap huminga, pumunta sa ER.', textEn: 'Leg or face swelling or sudden weight gain is a sign of extra fluid. If there is trouble breathing, go to the ER.' },
    itch: { level: 'green', titleTl: 'Ipaalam sa susunod na check-up', titleEn: 'Mention at the next check-up', textTl: 'Maaaring dahil sa phosphorus o dry skin. Mag-moisturize ng fragrance-free at iwasan ang mainit na paligo. Kung may rash o infection, tumawag.', textEn: 'It may be due to phosphorus or dry skin. Use fragrance-free moisturizer and avoid hot baths. If there is a rash or infection, call.' },
    missed: { level: 'red', titleTl: 'Tumawag sa unit ngayon', titleEn: 'Call the unit today', textTl: 'Huwag hintayin ang susunod na schedule. Kung may hirap huminga, sakit ng dibdib, matinding panghihina, o palpitations, pumunta sa ER.', textEn: 'Do not wait for the next schedule. If there is trouble breathing, chest pain, severe weakness, or palpitations, go to the ER.' }
  };
  const symptomGrid = $('#symptomGrid');
  const symptomResult = $('#symptomResult');
  if (symptomGrid && symptomResult) {
    symptomGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-symptom]');
      if (!btn) return;
      const data = symptomData[btn.getAttribute('data-symptom')];
      if (!data) return;
      $$('[data-symptom]', symptomGrid).forEach((b) => b.classList.toggle('active', b === btn));
      const labels = { red: 'Emergency / Agaran', amber: 'Ipaalam ngayon / Tell the team today', green: 'Sa susunod na check-up / At next check-up' };
      symptomResult.className = 'triage-result ' + data.level;
      symptomResult.innerHTML = '<div class="triage-level">' + (labels[data.level] || '') + '</div>' +
        '<h3>' + bi(data.titleTl, data.titleEn) + '</h3>' +
        '<p>' + bi(data.textTl, data.textEn) + '</p>' +
        '<div class="actions">' +
          (data.level === 'red' ? '<a class="btn btn-danger btn-small" href="tel:911">' + bi('Tumawag sa 911', 'Call 911') + '</a>' : '') +
          '<a class="btn btn-secondary btn-small" href="support.html#care-plan">' + bi('Buksan ang aking card', 'Open my card') + '</a>' +
        '</div>';
      symptomResult.focus({ preventScroll: true });
    });
  }

  /* ------------------------------------------------------------
     PhilHealth calculator
     ------------------------------------------------------------ */
  const phSessions = $('#phSessions');
  const phMember = $('#phMember');
  const phResult = $('#phResult');
  if (phSessions && phResult) {
    const updatePhilhealth = () => {
      const sessions = Math.max(0, Math.min(260, Number(phSessions.value) || 0));
      const covered = Math.min(sessions, 90);
      const beyond = Math.max(0, sessions - 90);
      const value = covered * 6350;
      const member = phMember ? phMember.value : 'yes';
      phResult.className = 'result-box' + (member === 'no' ? ' warning' : '');
      let html = '<strong>' + peso.format(value) + '</strong><p>' + bi(
        covered + ' sessions ang nasa loob ng 90-session package. ' + (beyond ? beyond + ' session ang lampas sa package at mangangailangan ng ibang tulong.' : 'Wala pang lampas sa package.'),
        covered + ' sessions fall within the 90-session package. ' + (beyond ? beyond + ' sessions are beyond the package and will need other help.' : 'No sessions beyond the package yet.')
      ) + '</p>';
      if (member === 'no') html += '<p>' + bi('Hindi kumpirmadong aktibo ang membership. I-check ito sa PhilHealth bago umasa sa package.', 'Membership is not confirmed active. Check with PhilHealth before relying on the package.') + '</p>';
      if (member === 'unsure') html += '<p>' + bi('I-check ang MDR at membership sa PhilHealth Member Portal o facility.', 'Check your MDR and membership on the PhilHealth Member Portal or at the facility.') + '</p>';
      phResult.innerHTML = html;
    };
    phSessions.addEventListener('input', updatePhilhealth);
    if (phMember) phMember.addEventListener('change', updatePhilhealth);
    $$('[data-set-sessions]').forEach((btn) => btn.addEventListener('click', () => {
      phSessions.value = btn.getAttribute('data-set-sessions');
      updatePhilhealth();
    }));
    updatePhilhealth();
  }

  /* ------------------------------------------------------------
     Care plan
     ------------------------------------------------------------ */
  const careForm = $('#carePlanForm');
  if (careForm) {
    const planKey = 'dc-plan';
    const fields = $$('input, select, textarea', careForm).filter((el) => el.name);
    let plan = store.get(planKey, {});
    fields.forEach((field) => { if (plan[field.name]) field.value = plan[field.name]; });
    const preview = (data) => {
      $$('[data-plan-preview]').forEach((el) => {
        const val = data[el.getAttribute('data-plan-preview')];
        el.textContent = val && String(val).trim() ? val : '—';
      });
      $$('[data-id-preview]').forEach((el) => {
        const key = el.getAttribute('data-id-preview');
        if (key === 'dry') {
          el.textContent = data.dry && String(data.dry).trim() ? data.dry + ' kg' : '—';
          return;
        }
        const val = data[key];
        el.textContent = val && String(val).trim() ? val : '—';
      });
    };
    const collect = () => {
      const data = {};
      fields.forEach((field) => { data[field.name] = field.value.trim(); });
      return data;
    };
    const savePlan = (quiet) => {
      plan = collect();
      store.set(planKey, plan);
      preview(plan);
      const status = $('#planStatus');
      if (status) status.innerHTML = bi('Naka-save sa device na ito.', 'Saved on this device.');
      if (!quiet) showToast(bi('Naka-save ang card.', 'Card saved.'));
    };
    fields.forEach((field) => field.addEventListener('input', () => {
      plan = collect();
      store.set(planKey, plan);
      preview(plan);
      const status = $('#planStatus');
      if (status) status.innerHTML = bi('Naka-save habang nagta-type.', 'Saving as you type.');
    }));
    preview(plan);
    careForm.addEventListener('submit', (e) => { e.preventDefault(); savePlan(false); });
    const clear = $('#clearCarePlan');
    if (clear) clear.addEventListener('click', () => {
      if (!window.confirm('Burahin ang lahat ng detalye sa card? / Clear all card details?')) return;
      careForm.reset();
      plan = {};
      store.remove(planKey);
      preview(plan);
      const status = $('#planStatus');
      if (status) status.innerHTML = bi('Nabura ang card.', 'Card cleared.');
      showToast(bi('Nabura ang card.', 'Card cleared.'));
    });
    const printCard = $('#printCareCard');
    if (printCard) printCard.addEventListener('click', () => {
      const data = collect();
      const esc = (v) => String(v || '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const rows = [
        ['Pangalan / Name', data.name], ['Uri ng dialysis / Type', data.type], ['Access', data.access],
        ['Dry weight', data.dry ? data.dry + ' kg' : ''], ['Fluid limit', data.limit ? data.limit + ' mL/day' : ''],
        ['Iskedyul / Schedule', data.schedule], ['Nephrologist / Doctor', data.doctor],
        ['Unit phone', data.unit], ['Emergency contact', data.emergency], ['Allergies', data.allergy],
        ['Mga gamot / Medicines', data.meds], ['Notes', data.notes]
      ];
      const printArea = $('#printArea');
      const rows = [
        ['Pangalan / Name', data.name], ['Uri / Type', data.type], ['Access', data.access],
        ['Dry weight', data.dry ? data.dry + ' kg' : ''], ['Fluid limit', data.limit ? data.limit + ' mL/day' : ''],
        ['Iskedyul / Schedule', data.schedule], ['Doctor', data.doctor], ['Unit phone', data.unit],
        ['Emergency', data.emergency], ['Allergy', data.allergy],
        ['Gamot / Meds', data.meds], ['Notes', data.notes]
      ];
      const cell = ([k, v]) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
      const half = Math.ceil(rows.length / 2);
      printArea.innerHTML = '<div class="dc-card">' +
        '<div class="dc-head"><strong>Dialysis Card</strong><span>Aking Dialysis Card</span></div>' +
        '<div class="dc-cols">' +
          '<div class="dc-col">' + rows.slice(0, half).map(cell).join('') + '</div>' +
          '<div class="dc-col">' + rows.slice(half).map(cell).join('') + '</div>' +
        '</div>' +
        '<div class="dc-foot">EMERGENCY: 911 — sabihin ang uri ng dialysis, huling session, access, dry weight, gamot, at allergy.</div>' +
        '</div>';
      const cardHtml = document.querySelector('#printArea').innerHTML;
      let modal = document.querySelector('#cardPreviewModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cardPreviewModal';
        modal.className = 'card-preview';
        modal.innerHTML = '<div class="card-preview-sheet"><div class="card-preview-bar">' +
          '<button type="button" class="btn btn-primary btn-small" id="cardPreviewPrint">Print / Save as PDF</button>' +
          '<button type="button" class="btn btn-secondary btn-small" id="cardPreviewClose">Close</button>' +
          '</div><div class="card-preview-body"></div></div>';
        document.body.appendChild(modal);
        modal.querySelector('#cardPreviewClose').addEventListener('click', () => {
          modal.remove();
          document.body.classList.remove('print-card-mode');
        });
        modal.querySelector('#cardPreviewPrint').addEventListener('click', () => {
          document.body.classList.add('print-card-mode');
          window.print();
        });
      }
      modal.querySelector('.card-preview-body').innerHTML = cardHtml;
      modal.hidden = false;
    });
  }

  /* ------------------------------------------------------------
     Quiz
     ------------------------------------------------------------ */
  const quizForm = $('#quizForm');
  if (quizForm) {
    const quizResult = $('#quizResult');
    quizForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const questions = $$('.quiz-question', quizForm);
      let score = 0;
      let answered = 0;
      questions.forEach((q) => {
        const selected = $('input:checked', q);
        const correct = q.getAttribute('data-answer');
        q.classList.remove('correct', 'incorrect');
        if (!selected) return;
        answered++;
        if (selected.value === correct) { score++; q.classList.add('correct'); }
        else q.classList.add('incorrect');
      });
      if (answered < questions.length) {
        quizResult.innerHTML = bi('Sagutin ang lahat ng tanong bago tingnan ang score.', 'Answer all questions before checking your score.');
        return;
      }
      const message = score === questions.length
        ? bi('Napakagaling! Alam mo ang mahahalagang paalala.', 'Excellent! You know the key safety points.')
        : score >= 3
          ? bi('Maganda ang simula. Balikan ang mga maling sagot at itanong sa team kung may duda.', 'Good start. Review the missed answers and ask your team if unsure.')
          : bi('Balikan ang mga seksyon at pag-usapan sa care team. Mahalaga ang bawat paalala.', 'Review the sections and talk with your care team. Every safety point matters.');
      quizResult.innerHTML = '<strong>' + score + ' / ' + questions.length + '</strong><p>' + message + '</p>';
      quizResult.focus({ preventScroll: true });
    });
    const reset = $('#resetQuiz');
    if (reset) reset.addEventListener('click', () => {
      quizForm.reset();
      $$('.quiz-question', quizForm).forEach((q) => q.classList.remove('correct', 'incorrect'));
      if (quizResult) quizResult.innerHTML = '';
    });
  }

  /* ------------------------------------------------------------
     Scroll spy, back to top, print
     ------------------------------------------------------------ */
  const sections = $$('main section[id]');
  const navLinks = $$('.section-nav a');
  let ticking = false;
  const updateScroll = () => {
    const pos = window.scrollY + 160;
    let current = sections[0];
    sections.forEach((s) => { if (s.offsetTop <= pos) current = s; });
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + current.id));
    const back = $('#backToTop');
    if (back) back.classList.toggle('show', window.scrollY > 800);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateScroll); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', updateScroll);
  updateScroll();

  const back = $('#backToTop');
  if (back) back.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const printGuide = $('#printGuide');
  if (printGuide) printGuide.addEventListener('click', () => window.print());
  window.addEventListener('afterprint', () => document.body.classList.remove('print-card-mode'));

  /* Make newly rendered bilingual content accessible */
  const labelNew = (node) => {
    $$('.tl', node).forEach((el) => { if (!el.getAttribute('lang')) el.setAttribute('lang', 'tl'); });
    $$('.en', node).forEach((el) => { if (!el.getAttribute('lang')) el.setAttribute('lang', 'en'); });
  };
  const markSame = (scope) => {
    $$('.tl', scope).forEach((tl) => {
      const en = tl.nextElementSibling;
      if (!en || !en.classList.contains('en')) return;
      const a = tl.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      const b = en.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (a && a === b) { tl.classList.add('same'); en.classList.add('same'); }
    });
  };
  labelNew(document);
  markSame(document);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { labelNew(n); markSame(n); } }));
  });
  observer.observe(document.body, { childList: true, subtree: true });

  /* Active HD records census (counts only; no patient details) */
  const censusKey = 'dc-records-census';
  const loadCensus = () => {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(censusKey) || 'null'); } catch (err) { data = null; }
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = Number(value) || 0;
    };
    set('censusOpd', data && data.opd);
    set('censusIp', data && data.ip);
    set('censusOthers', data && data.others);
  };
  loadCensus();
  window.addEventListener('storage', (event) => { if (event.key === censusKey) loadCensus(); });
  window.addEventListener('pageshow', loadCensus);
})();

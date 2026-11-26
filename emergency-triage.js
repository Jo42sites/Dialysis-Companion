(function () {
  'use strict';

  const form = document.querySelector('#emergencyCheckerForm');
  if (!form) return;

  const input = document.querySelector('#emergencyDescription');
  const result = document.querySelector('#emergencyCheckerResult');
  const levelTl = document.querySelector('#emergencyCheckerLevelTl');
  const levelEn = document.querySelector('#emergencyCheckerLevelEn');
  const adviceTl = document.querySelector('#emergencyCheckerAdviceTl');
  const adviceEn = document.querySelector('#emergencyCheckerAdviceEn');
  const callLink = document.querySelector('#emergencyCheckerCall');

  const redTerms = [
    'chest pain', 'chest pressure', 'sakit ng dibdib', 'bigat ng dibdib',
    'hirap huminga', 'nahihirapang huminga', 'hindi makahinga',
    'shortness of breath', 'cant breathe', "can't breathe",
    'nahimatay', 'fainted', 'unconscious', 'walang malay', 'seizure',
    'pangingisay', 'stroke', 'tabingi ang mukha', 'tabingi mukha',
    'slurred speech', 'hirap magsalita bigla', 'biglaang pamamanhid',
    'biglaang panghihina', 'sudden numbness', 'sudden weakness',
    'biglaang pagkalito', 'sudden confusion', 'hindi tumitigil ang pagdurugo',
    'pagdurugong ayaw tumigil', 'bleeding will not stop', 'bleeding wont stop',
    'heavy bleeding', 'malakas na pagdurugo', 'blue lips', 'nangingitim ang labi',
    'severe abdominal pain', 'matinding sakit ng tiyan', 'heart attack',
    'atake sa puso', 'swollen tongue', 'swollen throat', 'namamaga ang dila',
    'namamaga ang lalamunan', 'severe allergic reaction'
  ];
  const yellowTerms = [
    'nahihilo', 'hilo', 'dizzy', 'dizziness', 'lagnat', 'fever', 'panginginig',
    'chills', 'catheter', 'access', 'pamumula', 'redness', 'nana', 'pus',
    'cloudy pd', 'malabong pd', 'malabong peritoneal', 'cloudy peritoneal',
    'pagsusuka', 'vomit', 'nausea', 'pagduduwal', 'pulikat', 'cramps',
    'pamamaga', 'swelling', 'biglang pagtaba', 'sudden weight gain',
    'palpitations', 'iregular na tibok', 'mabilis na tibok', 'pagtatae',
    'diarrhea', 'sakit', 'pain', 'panghihina', 'weakness', 'pagkalito',
    'confusion', 'pamamanhid', 'numbness', 'sugat', 'wound', 'pantal', 'rash',
    'hindi makakain', 'cannot eat', 'hindi makainom', 'cannot keep'
  ];
  const greenTerms = [
    'pangangati', 'itching', 'dry skin', 'tuyong balat', 'constipation',
    'hirap matulog', 'trouble sleeping', 'sleep difficulty'
  ];
  const severeOrNewTerms = [
    'bago', 'bagong', 'new', 'lumalala', 'lumala', 'worsening', 'matindi', 'severe',
    'hindi nawawala', 'persistent', 'dugo', 'blood'
  ];

  function normalize(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function hasAny(text, terms) {
    return terms.some((term) => text.includes(term));
  }

  function classify(text) {
    const normalized = normalize(text);
    if (hasAny(normalized, redTerms) ||
      ((hasAny(normalized, ['lagnat', 'fever', 'panginginig', 'chills'])) &&
        hasAny(normalized, ['catheter', 'dialysis line']))) {
      return 'red';
    }
    if (hasAny(normalized, yellowTerms)) return 'yellow';
    if (
      hasAny(normalized, greenTerms) &&
      hasAny(normalized, ['banayad', 'mild', 'kaunti', 'konting']) &&
      !hasAny(normalized, severeOrNewTerms)
    ) {
      return 'green';
    }
    return 'yellow';
  }

  const guidance = {
    red: {
      levelTl: 'PULA: 911 / ER ngayon',
      levelEn: 'RED: 911 / ER now',
      adviceTl: 'Maaaring emergency ito. Tumawag sa 911 o pumunta agad sa ER. Huwag magmaneho; magpasama habang naghihintay ng tulong.',
      adviceEn: 'This may be an emergency. Call 911 or go to an ER now. Do not drive yourself; have someone stay with you while help is coming.'
    },
    yellow: {
      levelTl: 'DILAW: Ipaalam sa healthcare worker',
      levelEn: 'YELLOW: Tell a healthcare worker',
      adviceTl: 'Makipag-ugnayan sa dialysis team o healthcare worker ngayon para sa payo. Kung lumala, naging matindi, o may red-flag na sintomas, tumawag sa 911.',
      adviceEn: 'Contact your dialysis team or a healthcare worker today for advice. If it worsens, becomes severe, or red-flag symptoms appear, call 911.'
    },
    green: {
      levelTl: 'BERDE: Ipaalam sa susunod na check-up',
      levelEn: 'GREEN: Mention it at your next check-up',
      adviceTl: 'Batay lamang ito sa banayad na sintomas na inilagay. Ipaalam ito sa susunod na check-up; kung lumala, bago, o may ibang sintomas, makipag-ugnayan agad sa healthcare worker.',
      adviceEn: 'This applies only to the mild symptom you entered. Mention it at your next check-up; if it worsens, is new, or comes with other symptoms, contact a healthcare worker promptly.'
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const description = input.value.trim();
    if (!description) {
      input.focus();
      return;
    }
    const level = classify(description);
    const copy = guidance[level];
    levelTl.textContent = copy.levelTl;
    levelEn.textContent = copy.levelEn;
    adviceTl.textContent = copy.adviceTl;
    adviceEn.textContent = copy.adviceEn;
    result.dataset.level = level;
    result.hidden = false;
    callLink.hidden = level !== 'red';
  });
})();

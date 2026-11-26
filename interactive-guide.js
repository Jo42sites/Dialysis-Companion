(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const unitSelect = $('#labUnit');
  const labTest = $('#labTest');
  const labResult = $('#labResult');
  const symptomResult = $('#symptomResult');
  const unitsByLab = {
    hemoglobin: [['g/dL', 'g/L']],
    potassium: [['mmol/L']],
    phosphorus: [['mg/dL', 'mmol/L']],
    calcium: [['mg/dL', 'mmol/L']],
    albumin: [['g/dL', 'g/L']],
    ktv: [['No unit']]
  };
  const labGuidance = {
    hemoglobin: {
      label: ['Hemoglobin (Hb)', 'Hemoglobin (Hb)'],
      context: [
        'Ang target na Hb ay indibidwal. Itanong sa dialysis team kung paano ito nauugnay sa iron tests, posibleng pagkawala ng dugo, at planong iron o epoetin na sila ang nagtakda.',
        'Hemoglobin targets are individualized. Ask your dialysis team how this relates to iron tests, possible blood loss, and any iron or epoetin plan they prescribed.'
      ],
      question: [
        'Mga tanong: Ano ang target ko? Kailangan bang tingnan ang trend o iba pang blood tests? Huwag magdagdag o magbago ng iron o epoetin nang walang payo nila.',
        'Questions: What is my target? Should we review the trend or other blood tests? Do not start or change iron or epoetin without their advice.'
      ]
    },
    potassium: {
      label: ['Potassium', 'Potassium'],
      context: [
        'Maaaring makaapekto ang potassium sa tibok ng puso. Ang kahulugan nito ay nakadepende sa resulta, sintomas, at iyong care plan; ang critical na resulta ay dapat ipaalam agad sa dialysis team.',
        'Potassium can affect heart rhythm. Its meaning depends on the result, symptoms, and your care plan; promptly report a critical result to your dialysis team.'
      ],
      question: [
        'Mga tanong: May kailangan bang baguhin sa aking pagkain, gamot, o dialysis plan? Huwag baguhin ang mga ito nang mag-isa.',
        'Questions: Does anything need to change in my diet, medicines, or dialysis plan? Do not change them on your own.'
      ]
    },
    phosphorus: {
      label: ['Phosphorus', 'Phosphorus'],
      context: [
        'Isinasaalang-alang ng dialysis team ang trend at iba pang resulta. Maaari mong itanong kung paano naaangkop sa iyo ang mga pagkain at ang timing ng binder na nireseta na.',
        'Your dialysis team considers the trend and other results. Ask how food choices and the timing of any already-prescribed binder apply to you.'
      ],
      question: [
        'Mga tanong: Aling pagkain o binder instructions ang mahalaga sa aking plano? Huwag magbago ng binder o diet nang walang gabay ng team.',
        'Questions: Which food choices or binder instructions matter for my plan? Do not change binders or diet without your team’s guidance.'
      ]
    },
    calcium: {
      label: ['Calcium', 'Calcium'],
      context: [
        'Karaniwang binibigyang-kahulugan ang calcium kasama ng albumin at iba pang mineral/bone tests. Ipaubaya sa clinician ang pag-interpret ng resulta at trend.',
        'Calcium is often interpreted alongside albumin and other mineral/bone tests. Let your clinician interpret the result and trend.'
      ],
      question: [
        'Mga tanong: Kailangan bang tingnan ito kasama ng ibang resulta o gamot? Huwag magsimula o magbago ng supplement o gamot nang walang payo.',
        'Questions: Should this be reviewed alongside other results or medicines? Do not start or change a supplement or medicine without advice.'
      ]
    },
    albumin: {
      label: ['Albumin', 'Albumin'],
      context: [
        'Maaaring maapektuhan ang albumin ng maraming bagay, kaya hindi ito simpleng sukatan ng pagkain lamang. Ipa-review ang trend at pangkalahatang kalusugan sa care team.',
        'Albumin can be affected by many factors, so it is not a simple measure of food intake alone. Ask your care team to review the trend and overall health.'
      ],
      question: [
        'Mga tanong: Ano ang maaaring dahilan ng pagbabago? Kailangan ba ng dietitian o karagdagang pagsusuri? Huwag basta dagdagan ang protein nang walang payo.',
        'Questions: What might explain the change? Would a dietitian or further review help? Do not increase protein without advice.'
      ]
    },
    ktv: {
      label: ['Kt/V', 'Kt/V'],
      context: [
        'Ginagamit ang Kt/V bilang isa sa mga sukatan ng dialysis adequacy. I-interpret ito kasama ng iyong treatment history at iba pang clinical details.',
        'Kt/V is one measure used to assess dialysis adequacy. Interpret it alongside your treatment history and other clinical details.'
      ],
      question: [
        'Mga tanong: Tugma ba ito sa aking target? Kailangan bang suriin ang access, oras, o schedule ng dialysis? Huwag baguhin ang schedule nang walang team.',
        'Questions: Is this in line with my target? Should access, treatment time, or schedule be reviewed? Do not change your schedule without your team.'
      ]
    }
  };
  const symptomLabels = {
    emergency: ['malubhang sintomas', 'severe symptoms'],
    confusion: ['biglaang pagkalito o hirap gisingin', 'sudden confusion or difficult to wake'],
    access: ['lagnat/panginginig o pagbabago sa access', 'fever/chills or access changes'],
    palpitations: ['bagong iregular o mabilis na tibok ng puso', 'new irregular or racing heartbeat'],
    missed: ['hindi nakadalo o hindi natapos ang dialysis', 'missed or incomplete dialysis'],
    swelling: ['bagong pamamaga o mabilis na pagbigat', 'new swelling or rapid weight gain'],
    common: ['pulikat, pagkahilo, pagduduwal, pangangati, o pagkapagod', 'cramps, dizziness, nausea, itching, or fatigue']
  };
  const text = {
    tl: {
      labTitle: 'Gabay para sa',
      symptomMissing: 'Pumili muna ng sintomas para makita ang susunod na hakbang.',
      emergencyTitle: 'Kailangan ng agarang tulong',
      emergencyText: 'Tumawag sa 911 o pumunta sa pinakamalapit na emergency department ngayon. Huwag maghintay ng sagot mula sa online guide. Kung maaari, magpasama sa isang tao.',
      sameDayTitle: 'Makipag-ugnayan agad sa dialysis team',
      sameDayText: 'Tawagan ang dialysis unit ngayon para sa payo. Kung malubha o mabilis lumalala, pumunta sa emergency department o tumawag sa 911.',
      usualTitle: 'Ibahagi ito sa iyong care team',
      usualText: 'Maraming posibleng sanhi ang mga sintomas. Itala kung kailan nagsimula at kung may kaugnayan sa dialysis, saka talakayin sa team kung bago, nagpapatuloy, o lumalala. Sundin ang kasalukuyang plano; huwag magdagdag ng gamot o magbago ng fluid, pagkain, o dialysis nang walang payo.'
    },
    en: {
      labTitle: 'Guide for',
      symptomMissing: 'Select at least one symptom to see suggested next steps.',
      emergencyTitle: 'Get emergency help now',
      emergencyText: 'Call 911 or go to the nearest emergency department now. Do not wait for an online guide. If possible, have someone stay with you.',
      sameDayTitle: 'Contact your dialysis team promptly',
      sameDayText: 'Call your dialysis unit today for advice. If symptoms are severe or getting worse quickly, go to the emergency department or call 911.',
      usualTitle: 'Share this with your care team',
      usualText: 'Symptoms can have many causes. Note when they started and whether they relate to dialysis, then discuss them with your team if new, ongoing, or worsening. Follow your current plan; do not add medicine or change fluids, diet, or dialysis without advice.'
    }
  };

  function currentLanguage() {
    return document.documentElement.dataset.lang === 'en' ? 'en' : 'tl';
  }

  function setLanguage(language) {
    const selected = language === 'en' ? 'en' : 'tl';
    document.documentElement.dataset.lang = selected;
    document.documentElement.lang = selected;
    try {
      localStorage.setItem('dc-lang-v2', selected);
    } catch (_error) {
      // The guide remains usable when browser storage is unavailable.
    }
    document.querySelectorAll('[data-guide-lang]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.guideLang === selected));
    });
    updateUnits();
    renderLabResult();
    renderSymptomResult();
    if (!latestSymptoms.length && !symptomResult.hidden) {
      $('#symptomResultTitle').textContent = text[selected].symptomMissing;
    }
  }

  function updateUnits() {
    const options = unitsByLab[labTest.value][0];
    const previous = unitSelect.value;
    unitSelect.replaceChildren();
    options.forEach((unit) => {
      const option = document.createElement('option');
      option.value = unit;
      option.textContent = unit;
      unitSelect.append(option);
    });
    if (options.includes(previous)) unitSelect.value = previous;
  }

  let latestLab = null;
  function renderLabResult() {
    if (!latestLab) return;
    const language = currentLanguage();
    const guidance = labGuidance[latestLab.test];
    const index = language === 'tl' ? 0 : 1;
    $('#labResultTitle').textContent =
      `${text[language].labTitle} ${guidance.label[index]}: ${latestLab.displayValue} ${latestLab.unit}`;
    $('#labResultText').textContent = guidance.context[index];
    $('#labResultQuestions').textContent = guidance.question[index];
    labResult.hidden = false;
  }

  $('#labTest').addEventListener('change', updateUnits);
  $('#labForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number($('#labValue').value);
    if (!Number.isFinite(value)) return;
    latestLab = {
      test: labTest.value,
      displayValue: value.toLocaleString(currentLanguage() === 'tl' ? 'tl-PH' : 'en-PH', {
        maximumFractionDigits: 4
      }),
      unit: unitSelect.value
    };
    renderLabResult();
  });

  let latestSymptoms = [];
  function renderSymptomResult() {
    if (!latestSymptoms.length) return;
    const language = currentLanguage();
    const index = language === 'tl' ? 0 : 1;
    const checkedLabels = latestSymptoms
      .map((symptom) => symptomLabels[symptom][index])
      .join(', ');
    const hasEmergency = latestSymptoms.some((symptom) =>
      ['emergency', 'confusion'].includes(symptom)
    );
    const hasSameDay = latestSymptoms.some((symptom) =>
      ['access', 'palpitations', 'missed', 'swelling'].includes(symptom)
    );
    const level = hasEmergency ? 'urgent' : hasSameDay ? 'same-day' : 'general';
    const title = hasEmergency
      ? text[language].emergencyTitle
      : hasSameDay
        ? text[language].sameDayTitle
        : text[language].usualTitle;
    const message = hasEmergency
      ? text[language].emergencyText
      : hasSameDay
        ? text[language].sameDayText
        : text[language].usualText;
    symptomResult.dataset.level = level;
    $('#symptomResultTitle').textContent = title;
    $('#symptomResultText').textContent = `${checkedLabels}. ${message}`;
    symptomResult.hidden = false;
  }

  $('#symptomForm').addEventListener('submit', (event) => {
    event.preventDefault();
    latestSymptoms = Array.from(
      document.querySelectorAll('input[name="symptom"]:checked'),
      (input) => input.value
    );
    if (!latestSymptoms.length) {
      symptomResult.dataset.level = 'general';
      $('#symptomResultTitle').textContent = text[currentLanguage()].symptomMissing;
      $('#symptomResultText').textContent = '';
      symptomResult.hidden = false;
      return;
    }
    renderSymptomResult();
  });

  document.querySelectorAll('[data-guide-lang]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.guideLang));
  });
  let initialLanguage = 'tl';
  try {
    initialLanguage = localStorage.getItem('dc-lang-v2') || 'tl';
  } catch (_error) {
    // The guide defaults to Tagalog when browser storage is unavailable.
  }
  setLanguage(initialLanguage);

  window.addEventListener('pagehide', () => {
    $('#labForm').reset();
    $('#symptomForm').reset();
    latestLab = null;
    latestSymptoms = [];
    labResult.hidden = true;
    symptomResult.hidden = true;
  });
})();

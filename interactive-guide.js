(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const unitSelect = $('#labUnit');
  const labTest = $('#labTest');
  const labResult = $('#labResult');
  const symptomResult = $('#symptomResult');
  const labFlag = $('#labFlag');
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
      ],
      recommendations: [
        [
          'Itanong kung may ibang posibleng sanhi ng anemia, gaya ng inflammation, impeksiyon, o pagdurugo.',
          'Ipaalam sa care team ang pagkapagod, panghihina, hilo, o hirap huminga; ang matinding hirap huminga o pananakit ng dibdib ay nangangailangan ng agarang tulong.'
        ],
        [
          'Ask whether other causes of anemia, such as inflammation, infection, or blood loss, should be reviewed.',
          'Tell your care team about fatigue, weakness, dizziness, or trouble breathing; severe trouble breathing or chest pain needs urgent help.'
        ]
      ],
      lowRecommendations: [
        [
          'Kung mababa o pababa ang Hb, itanong kung dapat suriin ang iron stores (ferritin/TSAT), B12/folate, at posibleng pagkawala ng dugo.',
          'Kung pinapayagan ng renal meal plan mo, maaaring pumili ng pagkaing may iron tulad ng lean beef/karne, manok, o isda. Tanungin ang renal dietitian kung anong portion ang angkop.',
          'Magtanong muna kung pasok sa potassium/phosphorus plan mo ang monggo/beans o fortified cereal; hindi pare-pareho ang angkop na pagkain sa dialysis.',
          'Makakatulong ang pagkain sa nutrisyon pero maaaring hindi nito maitama nang mag-isa ang anemia na kaugnay ng kidney failure. Iron o epoetin lamang kung iniutos ng team; huwag magsimula ng over-the-counter iron.'
        ],
        [
          'If Hb is low or falling, ask whether iron stores (ferritin/TSAT), B12/folate, and possible blood loss should be checked.',
          'If they fit your renal meal plan, iron-containing choices may include lean beef/meat, poultry, or fish. Ask a renal dietitian what portions are suitable.',
          'Ask first whether beans or fortified cereal fit your potassium/phosphorus plan; suitable foods differ among people on dialysis.',
          'Food can support nutrition but may not correct kidney-failure-related anemia by itself. Use iron or epoetin only if your team prescribes it; do not start over-the-counter iron.'
        ]
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
      ],
      recommendations: [
        [
          'Kung minarkahang mataas o mababa, tawagan ang dialysis team para sa payo; maaaring makaapekto ang potassium sa tibok ng puso.',
          'Ihanda ang resulta, petsa, sintomas, at listahan ng gamot. Huwag magdagdag o magtanggal ng pagkain nang maramihan.',
          'Iwasan ang salt substitute o “low-sodium salt” na may potassium chloride maliban kung inaprubahan ng team.',
          'Bagong iregular na tibok, matinding panghihina, pananakit ng dibdib, o hirap huminga: emergency help ngayon.'
        ],
        [
          'If flagged high or low, contact your dialysis team for advice; potassium can affect heart rhythm.',
          'Have the result, date, symptoms, and medicine list ready. Do not make major food changes on your own.',
          'Avoid salt substitutes or “low-sodium salt” containing potassium chloride unless your team approves them.',
          'New irregular heartbeat, severe weakness, chest pain, or trouble breathing: get emergency help now.'
        ]
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
      ],
      recommendations: [
        [
          'Tingnan ang ingredient list para sa phosphate additives (madalas may “phos” sa pangalan); itanong sa renal dietitian kung aling pamalit ang angkop.',
          'Kung may phosphate binder ka, inumin lamang ayon sa eksaktong instructions ng team, kabilang ang timing sa pagkain.',
          'Huwag mag-skip, magdoble, o magpalit ng binder o pagkain batay lamang sa isang resulta.'
        ],
        [
          'Check ingredient lists for phosphate additives (often containing “phos”); ask a renal dietitian which swaps fit your plan.',
          'If you have a phosphate binder, take it only as your care team directed, including its timing with food.',
          'Do not skip, double, or change binders or foods based only on one result.'
        ]
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
      ],
      recommendations: [
        [
          'Itanong kung dapat itong basahin kasama ng albumin, phosphorus, at iba pang resulta.',
          'Huwag magsimula, huminto, o magbago ng calcium/vitamin D supplement o gamot nang walang payo.',
          'Ibahagi ang bago o lumalalang pamamanhid, pangingilig, pulikat, o pagkalito sa care team.'
        ],
        [
          'Ask whether this should be interpreted alongside albumin, phosphorus, and other results.',
          'Do not start, stop, or change calcium/vitamin D supplements or medicines without advice.',
          'Tell your care team about new or worsening numbness, tingling, cramps, or confusion.'
        ]
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
      ],
      recommendations: [
        [
          'Hindi albumin lang ang sukatan ng nutrisyon; itanong kung may ibang sanhi gaya ng impeksiyon o inflammation.',
          'Kung nahihirapan kumain o pumapayat, humingi ng tulong sa renal dietitian para makahanap ng pagkaing tugma sa iyong kidney meal plan.',
          'Huwag basta dagdagan ang protein o gumamit ng nutrition supplement nang walang payo.'
        ],
        [
          'Albumin alone does not measure nutrition; ask whether other causes such as infection or inflammation need review.',
          'If eating is difficult or you are losing weight, ask a renal dietitian for foods that fit your kidney meal plan.',
          'Do not simply increase protein or start nutrition supplements without advice.'
        ]
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
      ],
      recommendations: [
        [
          'Itanong sa team kung naaayon ito sa iyong personal na target at kung dapat suriin ang access o treatment plan.',
          'Subukang dumalo at tapusin ang buong dialysis session ayon sa iskedyul; ipaalam agad kung may naputol o hindi natapos na session.',
          'Huwag baguhin o dagdagan ang dialysis schedule nang walang instructions.'
        ],
        [
          'Ask your team whether this matches your personal target and whether your access or treatment plan should be reviewed.',
          'Attend and complete each dialysis session as scheduled; tell the team promptly about any shortened or missed session.',
          'Do not change or add dialysis sessions without instructions.'
        ]
      ]
    }
  };
  const symptomGuidance = {
    chest: {
      level: 'urgent', label: ['pananakit o bigat ng dibdib', 'chest pain or pressure'],
      steps: [
        ['Tumawag sa 911 ngayon; huwag magmaneho. Magpasama habang naghihintay ng tulong.', 'Call 911 now; do not drive yourself. Have someone stay with you while help is coming.'],
        ['Huwag hintayin kung kusa itong mawawala o maghintay ng sagot mula sa online guide.', 'Do not wait to see if it passes or wait for an online guide response.']
      ]
    },
    breathing: {
      level: 'urgent', label: ['matinding hirap huminga', 'severe trouble breathing'],
      steps: [
        ['Tumawag sa 911 o pumunta agad sa emergency department; huwag magmaneho.', 'Call 911 or go to an emergency department now; do not drive yourself.'],
        ['Umupo nang tuwid kung mas komportable sa paghinga. Huwag piliting uminom ng dagdag na fluid.', 'Sit upright if that makes breathing easier. Do not force extra fluids.']
      ]
    },
    faint: {
      level: 'urgent', label: ['nahimatay, seizure, o biglaang pagkalito', 'fainting, seizure, or sudden confusion'],
      steps: [
        ['Tumawag sa 911 ngayon. Kung seizure, alisin ang mga bagay na maaaring makasakit at huwag pigilan ang galaw o maglagay ng anuman sa bibig.', 'Call 911 now. During a seizure, move nearby hazards away; do not restrain movement or put anything in the person’s mouth.'],
        ['Huwag magbigay ng pagkain o inumin sa taong walang malay o hindi lubos na gising.', 'Do not give food or drink to someone who is unconscious or not fully alert.']
      ]
    },
    bleeding: {
      level: 'urgent', label: ['matinding o hindi humihintong pagdurugo', 'severe or ongoing bleeding'],
      steps: [
        ['Tumawag sa 911 kung matindi ang pagdurugo, nanghihina, o hindi ito tumitigil.', 'Call 911 for heavy bleeding, weakness, or bleeding that will not stop.'],
        ['Habang may tumatawag, idiin nang tuloy-tuloy ang malinis na gauze o tela sa lugar kung ligtas gawin. Huwag balutan nang mahigpit ang buong braso.', 'While someone calls, apply steady pressure with clean gauze or cloth if safe. Do not tightly wrap the whole arm.']
      ]
    },
    dizzy: {
      level: 'same-day', label: ['pagkahilo o pakiramdam na mahihimatay', 'dizziness or feeling faint'],
      steps: [
        ['Umupo o humiga nang ligtas para hindi matumba; kung hirap huminga, umupo nang tuwid. Huwag tumayo o magmaneho habang nahihilo. Magpasama kung maaari.', 'Sit or lie down somewhere safe to prevent a fall; if you are short of breath, sit upright. Do not stand or drive while dizzy. Ask someone to stay with you if possible.'],
        ['Kung may BP monitor at ligtas itong gawin, sukatin ayon sa tamang paraan at itala ang reading, oras, pulso, at kung kailan ito kaugnay ng dialysis.', 'If you have a BP monitor and can use it safely, check it as instructed and record the reading, time, pulse, and relation to dialysis.'],
        ['Tawagan ang dialysis team ngayon kung bago, nagpapatuloy, o kaugnay ng session. Huwag uminom o kumain ng dagdag, o magpalit ng gamot, maliban kung iyon mismo ang nasa iyong care plan.', 'Call your dialysis team today if this is new, ongoing, or related to a session. Do not add fluids or food or change medicines unless your own care plan specifically tells you to.'],
        ['Kung nahimatay, may sakit ng dibdib, hirap huminga, biglang panghihina/pamamanhid, o pagkalito, tumawag sa 911.', 'If you faint, have chest pain, trouble breathing, sudden weakness/numbness, or confusion, call 911.']
      ]
    },
    highBP: {
      level: 'same-day', label: ['mataas na blood pressure ayon sa care plan', 'blood pressure high according to your care plan'],
      steps: [
        ['Umupo nang tahimik at magpahinga. Kung walang emergency na sintomas, ulitin ang sukat ayon sa instructions ng monitor o care team at itala ang resulta.', 'Sit quietly and rest. If there are no emergency symptoms, repeat the measurement as directed by your monitor or care team and record it.'],
        ['Kung nananatiling lampas sa personal mong limit o may nararamdaman, tawagan ang dialysis team/clinician para sa instructions.', 'If it remains above your personal limit or you have symptoms, contact your dialysis team/clinician for instructions.'],
        ['Huwag uminom ng dagdag na dose o magdagdag ng asin, pagkain, o fluid para gamutin ito nang walang instructions.', 'Do not take an extra dose or add salt, food, or fluids to treat it without instructions.'],
        ['Sakit ng dibdib, hirap huminga, biglang pamamanhid/panghihina, pagbabago ng paningin, o matinding sakit ng ulo: tumawag sa 911.', 'Chest pain, trouble breathing, sudden numbness/weakness, vision changes, or a severe headache: call 911.']
      ]
    },
    access: {
      level: 'same-day', label: ['lagnat/panginginig o pagbabago sa dialysis access', 'fever/chills or a change at dialysis access'],
      steps: [
        ['Tawagan ang dialysis unit ngayon at ilarawan ang temperatura at pagbabago. Huwag hintayin ang susunod na session.', 'Call your dialysis unit now and describe your temperature and the change. Do not wait for the next session.'],
        ['Huwag pisilin, kamutin, o lagyan ng cream ang access; sundin ang access-care instructions ng unit.', 'Do not squeeze, scratch, or apply cream to the access; follow your unit’s access-care instructions.'],
        ['Kung mabilis lumala, nalilito, nahihirapang huminga, o matindi ang pakiramdam na may sakit, tumawag sa 911.', 'If rapidly worsening, confused, short of breath, or severely unwell, call 911.']
      ]
    },
    palpitations: {
      level: 'same-day', label: ['bagong iregular o mabilis na tibok ng puso', 'new irregular or racing heartbeat'],
      steps: [
        ['Umupo at iwasan muna ang mabigat na gawain. Tawagan ang dialysis team/clinician ngayon at sabihin kung kailan nagsimula.', 'Sit down and avoid strenuous activity. Contact your dialysis team/clinician now and say when it started.'],
        ['Huwag magdagdag o magpalit ng gamot o supplement. Itala ang pulso kung kaya nang hindi naaantala ang paghingi ng tulong.', 'Do not add or change medicines or supplements. Note your pulse if you can do so without delaying care.'],
        ['May sakit ng dibdib, hirap huminga, nahimatay, o matinding panghihina? Tumawag sa 911.', 'Chest pain, trouble breathing, fainting, or severe weakness? Call 911.']
      ]
    },
    missed: {
      level: 'same-day', label: ['hindi nakadalo o hindi natapos ang dialysis', 'missed or incomplete dialysis'],
      steps: [
        ['Tawagan ang dialysis unit ngayon para sa tiyak na payo kung kailan at paano babalik sa schedule.', 'Call your dialysis unit now for specific instructions on when and how to resume your schedule.'],
        ['Huwag magdoble o mag-extend ng treatment nang kusa. Sundin ang kasalukuyang fluid at pagkain plan habang naghihintay ng payo.', 'Do not double or extend a treatment on your own. Follow your current fluid and food plan while waiting for advice.'],
        ['Kung may hirap huminga, sakit ng dibdib, bagong palpitations, o matinding panghihina, tumawag sa 911.', 'If you have trouble breathing, chest pain, new palpitations, or severe weakness, call 911.']
      ]
    },
    swelling: {
      level: 'same-day', label: ['bagong pamamaga o mabilis na pagbigat', 'new swelling or rapid weight gain'],
      steps: [
        ['Itala ang timbang at kung kailan nagsimula ang pamamaga; tawagan ang dialysis team ngayon para sa payo.', 'Record your weight and when the swelling started; call your dialysis team today for advice.'],
        ['Sundin ang sarili mong fluid at sodium plan. Huwag magbawas o magdagdag ng fluid, asin, o gamot nang kusa.', 'Follow your own fluid and sodium plan. Do not change fluids, salt, or medicines on your own.'],
        ['Kung nahihirapang huminga o may sakit ng dibdib, tumawag sa 911.', 'If you have trouble breathing or chest pain, call 911.']
      ]
    },
    cramps: {
      level: 'same-day', label: ['pulikat habang o pagkatapos ng dialysis', 'cramps during or after dialysis'],
      steps: [
        ['Kung nasa dialysis, sabihin agad sa nurse; huwag galawin ang machine o linya.', 'If you are at dialysis, tell the nurse right away; do not adjust the machine or lines.'],
        ['Kung ligtas at komportable, dahan-dahang iunat ang kalamnan. Tawagan ang team kung matindi o paulit-ulit.', 'If safe and comfortable, gently stretch the muscle. Contact your team if severe or recurring.'],
        ['Huwag uminom ng dagdag na fluid o kumain ng maalat na pagkain para sa pulikat maliban kung bahagi iyon ng iyong care plan.', 'Do not add fluids or eat salty food for cramps unless that is part of your care plan.']
      ]
    },
    nausea: {
      level: 'same-day', label: ['pagduduwal o pagsusuka', 'nausea or vomiting'],
      steps: [
        ['Umupo nang tuwid at magpahinga. Kung kaya mong kumain at pasok sa meal plan, subukan ang kaunting pagkain sa halip na pilitin ang malaking meal.', 'Sit upright and rest. If you can eat and it fits your meal plan, try a small amount rather than forcing a large meal.'],
        ['Tawagan ang care team kung paulit-ulit ang pagsusuka, hindi makainom ng gamot, o nagpapatuloy ang sintomas. Huwag piliting uminom ng dagdag na fluid.', 'Contact your care team for repeated vomiting, inability to keep medicines down, or ongoing symptoms. Do not force extra fluids.'],
        ['Dugo sa suka, matinding sakit, pagkalito, o hirap huminga: humingi agad ng emergency help.', 'Blood in vomit, severe pain, confusion, or trouble breathing: get emergency help now.']
      ]
    },
    itch: {
      level: 'general', label: ['pangangati', 'itching'],
      steps: [
        ['Subukan ang maligamgam, hindi mainit na paligo at fragrance-free moisturizer sa tuyong balat; iwasang kamutin o magasgasan.', 'Try a lukewarm—not hot—shower and fragrance-free moisturizer for dry skin; avoid scratching or breaking the skin.'],
        ['Ipaalam sa team kung nagpapatuloy, nakakaistorbo sa tulog, may pantal/sugat, o bagong nagsimula. Huwag ipagpalagay na phosphorus lang ang sanhi.', 'Tell your team if it persists, disrupts sleep, causes a rash/wound, or is new. Do not assume phosphorus is the only cause.'],
        ['Huwag magsimula ng antihistamine, cream na may gamot, o supplement nang walang payo.', 'Do not start an antihistamine, medicated cream, or supplement without advice.']
      ]
    },
    fatigue: {
      level: 'general', label: ['hindi pangkaraniwang pagkapagod o panghihina', 'unusual tiredness or weakness'],
      steps: [
        ['Itala kung kailan ito nangyayari, gaano katagal, tulog, at kaugnayan sa dialysis; magpahinga at magplano ng magagaang gawain.', 'Note when it happens, how long it lasts, sleep, and relation to dialysis; rest and pace activities.'],
        ['Ipaalam sa team kung bago, lumalala, o nakakaapekto sa gawain. Itanong kung dapat repasuhin ang Hb/iron, nutrisyon, gamot, tulog, o ibang sanhi.', 'Tell your team if it is new, worsening, or affecting daily activities. Ask whether Hb/iron, nutrition, medicines, sleep, or other causes should be reviewed.'],
        ['Bigla o matinding panghihina, sakit ng dibdib, hirap huminga, o pagkalito: humingi agad ng emergency help.', 'Sudden or severe weakness, chest pain, trouble breathing, or confusion: get emergency help now.']
      ]
    }
  };
  const text = {
    tl: {
      labTitle: 'Gabay para sa',
      labFlagLow: 'Minarkahan mong mababa / below target',
      labFlagHigh: 'Minarkahan mong mataas / above target',
      labFlagTarget: 'Minarkahan mong nasa target',
      labFlagUnsure: 'Hindi sigurado sa target o kahulugan',
      flagReminder: 'I-verify ang flag, yunit, at personal na target sa report o care team; hindi ito ini-interpret ng gabay.',
      flagActions: {
        low: 'Ipa-review ito sa care team para malaman ang susunod na hakbang; huwag magbago ng pagkain o gamot nang mag-isa.',
        high: 'Ipa-review ito sa care team para malaman ang susunod na hakbang; huwag magbago ng pagkain o gamot nang mag-isa.',
        target: 'Ituloy ang kasalukuyang plano at itanong kung paano ito ikinukumpara sa mga naunang resulta.',
        unsure: 'Tingnan ang reference range at yunit sa report at itanong sa care team kung ano ang personal mong target.'
      },
      symptomMissing: 'Pumili muna ng sintomas para makita ang mga mungkahing hakbang.',
      emergencyTitle: 'Kailangan ng agarang tulong',
      emergencyText: 'Tumawag sa 911 o pumunta sa pinakamalapit na emergency department ngayon. Huwag maghintay ng sagot mula sa online guide. Kung maaari, magpasama sa isang tao.',
      sameDayTitle: 'Makipag-ugnayan agad sa dialysis team',
      sameDayText: 'Tawagan ang dialysis unit ngayon para sa payo. Kung malubha o mabilis lumalala, pumunta sa emergency department o tumawag sa 911.',
      generalTitle: 'Mga praktikal na hakbang at paalala',
      generalText: 'Sundin ang mga hakbang sa ibaba at ipaalam sa care team kung nagpapatuloy o lumalala ang sintomas. Huwag baguhin ang gamot, fluid, pagkain, o dialysis nang walang payo.',
      urgency: { urgent: 'Emergency', 'same-day': 'Tawagan ang care team ngayon', general: 'Ipaalam sa care team kung nagpapatuloy' }
    },
    en: {
      labTitle: 'Guide for',
      labFlagLow: 'You marked this low / below target',
      labFlagHigh: 'You marked this high / above target',
      labFlagTarget: 'You marked this within target',
      labFlagUnsure: 'Target or meaning is unclear',
      flagReminder: 'Verify the flag, unit, and personal target with the report or care team; this guide does not interpret it.',
      flagActions: {
        low: 'Ask your care team to review it and advise on next steps; do not change food or medicines on your own.',
        high: 'Ask your care team to review it and advise on next steps; do not change food or medicines on your own.',
        target: 'Continue your current plan and ask how this compares with earlier results.',
        unsure: 'Check the report’s reference range and unit, and ask your care team about your personal target.'
      },
      symptomMissing: 'Select at least one symptom to see suggested steps.',
      emergencyTitle: 'Get emergency help now',
      emergencyText: 'Call 911 or go to the nearest emergency department now. Do not wait for an online guide. If possible, have someone stay with you.',
      sameDayTitle: 'Contact your dialysis team promptly',
      sameDayText: 'Call your dialysis unit today for advice. If symptoms are severe or getting worse quickly, go to the emergency department or call 911.',
      generalTitle: 'Practical steps and reminders',
      generalText: 'Follow the steps below and tell your care team if symptoms persist or worsen. Do not change medicines, fluids, diet, or dialysis without advice.',
      urgency: { urgent: 'Emergency', 'same-day': 'Contact your care team today', general: 'Tell your care team if it persists' }
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
    document.querySelectorAll('#labFlag option').forEach((option) => {
      option.textContent = option.dataset[selected];
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
    const flagLabels = {
      low: text[language].labFlagLow,
      high: text[language].labFlagHigh,
      target: text[language].labFlagTarget,
      unsure: text[language].labFlagUnsure
    };
    $('#labResultTitle').textContent =
      `${text[language].labTitle} ${guidance.label[index]}: ${latestLab.displayValue} ${latestLab.unit}`;
    $('#labFlagText').textContent =
      `${flagLabels[latestLab.flag]}. ${text[language].flagActions[latestLab.flag]} ${text[language].flagReminder}`;
    $('#labResultText').textContent = guidance.context[index];
    $('#labResultQuestions').textContent = guidance.question[index];
    const recommendations = guidance.recommendations[index].slice();
    if (latestLab.test === 'hemoglobin' && latestLab.flag === 'low') {
      recommendations.push(...guidance.lowRecommendations[index]);
    }
    $('#labRecommendations').replaceChildren(
      ...recommendations.map((recommendation) => {
        const item = document.createElement('li');
        item.textContent = recommendation;
        return item;
      })
    );
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
      unit: unitSelect.value,
      flag: labFlag.value
    };
    renderLabResult();
  });

  let latestSymptoms = [];
  function renderSymptomResult() {
    if (!latestSymptoms.length) return;
    const language = currentLanguage();
    const index = language === 'tl' ? 0 : 1;
    const urgencyRank = { urgent: 3, 'same-day': 2, general: 1 };
    const selected = latestSymptoms
      .map((symptom) => ({ key: symptom, guidance: symptomGuidance[symptom] }))
      .filter(({ guidance }) => guidance)
      .sort((a, b) => urgencyRank[b.guidance.level] - urgencyRank[a.guidance.level]);
    const level = selected[0].guidance.level;
    const title = level === 'urgent'
      ? text[language].emergencyTitle
      : level === 'same-day'
        ? text[language].sameDayTitle
        : text[language].generalTitle;
    const message = level === 'urgent'
      ? text[language].emergencyText
      : level === 'same-day'
        ? text[language].sameDayText
        : text[language].generalText;
    symptomResult.dataset.level = level;
    $('#symptomResultTitle').textContent = title;
    $('#symptomResultText').textContent = message;
    $('#symptomDetails').replaceChildren(
      ...selected.map(({ guidance }) => {
        const detail = document.createElement('article');
        detail.className = 'symptom-detail';
        const heading = document.createElement('div');
        heading.className = 'symptom-detail-heading';
        const label = document.createElement('h4');
        label.textContent = guidance.label[index];
        const urgency = document.createElement('span');
        urgency.className = `urgency-pill urgency-${guidance.level}`;
        urgency.textContent = text[language].urgency[guidance.level];
        heading.append(label, urgency);
        const steps = document.createElement('ul');
        steps.className = 'recommendation-list';
        guidance.steps.forEach((step) => {
          const item = document.createElement('li');
          item.textContent = step[index];
          steps.append(item);
        });
        detail.append(heading, steps);
        return detail;
      })
    );
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
      $('#symptomDetails').replaceChildren();
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

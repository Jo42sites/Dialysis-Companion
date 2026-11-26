(function () {
  'use strict';

  const form = document.querySelector('#foodCheckerForm');
  if (!form) return;

  const input = document.querySelector('#foodCheckerInput');
  const result = document.querySelector('#foodCheckerResult');
  const name = document.querySelector('#foodCheckerName');
  const flagsList = document.querySelector('#foodCheckerFlags');
  const betterTl = document.querySelector('#foodCheckerBetterTl');
  const betterEn = document.querySelector('#foodCheckerBetterEn');

  const categories = [
    { key: 'highK', labelTl: 'High K', labelEn: 'High K', type: 'risk' },
    { key: 'highP', labelTl: 'High P', labelEn: 'High P', type: 'risk' },
    { key: 'highNa', labelTl: 'High Na', labelEn: 'High Na', type: 'risk' },
    { key: 'protein', labelTl: 'Pinagmumulan ng protein', labelEn: 'Protein source', type: 'protein' },
    { key: 'fluid', labelTl: 'Fluid / likido', labelEn: 'Fluid', type: 'fluid' }
  ];
  const terms = {
    highK: [
      'banana', 'saging', 'coconut water', 'buko juice', 'buko', 'kamote',
      'sweet potato', 'potato', 'patatas', 'tomato', 'kamatis', 'avocado',
      'abokado', 'kangkong', 'water spinach', 'spinach', 'malunggay', 'monggo',
      'mung bean', 'beans', 'orange', 'dalandan', 'papaya', 'salt substitute',
      'low sodium salt', 'potassium chloride'
    ],
    highP: [
      'cola', 'soft drink', 'soft drinks', 'soda', 'instant noodle', 'instant noodles', 'hotdog', 'hot dog', 'ham',
      'sausage', 'processed meat', 'processed meats', 'bacon', 'milk', 'cheese', 'yogurt', 'dairy',
      'monggo', 'mung bean', 'beans', 'nuts', 'peanut', 'seed', 'egg', 'yolk',
      'organ meat', 'atay', 'phosphate', 'phosphate additive', 'phos additive', 'dark cola'
    ],
    highNa: [
      'tuyo', 'daing', 'dried fish', 'salted fish', 'hotdog', 'hot dog', 'ham',
      'sausage', 'bacon', 'processed meat', 'processed meats', 'instant noodle', 'instant noodles', 'seasoning packet',
      'canned', 'canned food', 'patis', 'fish sauce', 'bagoong', 'toyo',
      'soy sauce', 'salt', 'maalat', 'chips', 'fries', 'fast food', 'pizza',
      'burger', 'broth cube', 'bouillon', 'adobo', 'processed'
    ],
    protein: [
      'chicken', 'manok', 'fish', 'isda', 'bangus', 'galunggong', 'pork', 'baboy',
      'beef', 'karne', 'meat', 'egg', 'itlog', 'tofu', 'tokwa', 'monggo',
      'mung bean', 'beans', 'milk', 'cheese', 'yogurt', 'peanut', 'nuts',
      'hotdog', 'ham', 'sausage', 'bacon', 'seafood', 'hipon', 'shrimp'
    ],
    fluid: [
      'water', 'tubig', 'juice', 'buko', 'coconut water', 'soft drink', 'soda',
      'cola', 'coffee', 'kape', 'tea', 'tsaa', 'milk', 'soup', 'sabaw', 'broth',
      'ice', 'yelo', 'gelatin', 'jelly', 'popsicle', 'ice cream', 'shake',
      'smoothie', 'drink', 'inumin', 'lugaw'
    ]
  };
  const knownFoods = [
    'rice', 'kanin', 'pandesal', 'bread', 'apple', 'mansanas', 'grapes', 'ubas',
    'cabbage', 'repolyo', 'cucumber', 'pipino', 'lettuce', 'carrot', 'carrots',
    'pechay', 'cauliflower', 'upo', 'sayote', 'pear', 'peras', 'adobo',
    'noodles', 'pasta', 'corn', 'mais', 'oatmeal', 'cereal', 'sugar', 'asukal',
    'oil', 'mantika', 'vegetable', 'gulay', 'fruit', 'prutas', 'food'
  ];
  const advice = {
    highK: [
      'Itanong sa renal dietitian ang mas mababang-potassium na pamalit at ligtas na serving; nakadepende ito sa labs mo.',
      'Ask your renal dietitian for a lower-potassium alternative and safe portion; this depends on your labs.'
    ],
    highP: [
      'Pumili kung maaari ng sariwa at hindi processed na pamalit; tingnan ang sangkap na may “phos” at itanong sa dietitian ang binder.',
      'Choose a fresh, less-processed alternative when possible; check for “phos” ingredients and ask your dietitian about binders.'
    ],
    highNa: [
      'Mas mabuti ang sariwa at hindi maalat na luto; gumamit ng calamansi, bawang, luya o herbs sa halip na patis, toyo o dagdag na asin.',
      'A fresh, unsalted preparation is a better choice; use calamansi, garlic, ginger, or herbs instead of fish sauce, soy sauce, or added salt.'
    ],
    protein: [
      'Kailangan pa rin ng maraming pasyente sa hemodialysis ang protein. Huwag itong alisin; piliin ang uri at serving ayon sa renal meal plan.',
      'Many people on hemodialysis still need protein. Do not remove it; choose the type and portion in your renal meal plan.'
    ],
    fluid: [
      'Bilangin ang serving ayon sa fluid limit mo; isama ang inumin, sabaw at pagkaing natutunaw o likido sa room temperature kung iyon ang bilin ng team.',
      'Count the portion toward your fluid limit; include drinks, soup, and foods that melt or are liquid at room temperature if your team instructs you to.'
    ],
    general: [
      'Kung walang natukoy na karaniwang flag, hindi ito garantiya na ligtas. Ibigay sa dietitian ang brand, sangkap at serving para sa mas tiyak na payo.',
      'If no common flag was identified, that does not guarantee it is safe. Share the brand, ingredients, and portion with your dietitian for specific advice.'
    ],
    unknown: [
      'Hindi matukoy ang pagkain sa pangalan lamang. Ilagay ang pangunahing sangkap o brand, o itanong sa renal dietitian.',
      'The food cannot be identified from its name alone. Add the main ingredients or brand, or ask your renal dietitian.'
    ]
  };

  function normalize(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function includesAny(text, words) {
    const paddedText = ` ${text} `;
    return words.some((word) => paddedText.includes(` ${word} `));
  }

  function analyze(value) {
    const text = normalize(value);
    const detected = Object.fromEntries(
      Object.entries(terms).map(([category, words]) => [category, includesAny(text, words)])
    );
    return {
      detected,
      recognized: Object.values(detected).some(Boolean) || includesAny(text, knownFoods)
    };
  }

  function renderFlag(category, detected, recognized) {
    const item = document.createElement('li');
    item.className = 'food-checker-flag';
    const positive = detected[category.key];
    if (positive) {
      item.classList.add(category.type === 'risk' ? 'flagged' : `${category.type}-flagged`);
    }
    let textTl;
    let textEn;
    if (positive) {
      textTl = category.type === 'protein' ? 'May protein' : category.type === 'fluid' ? 'Bilangin sa fluid' : 'Posibleng mataas';
      textEn = category.type === 'protein' ? 'Protein source' : category.type === 'fluid' ? 'Count as fluid' : 'Potentially high';
    } else if (recognized) {
      textTl = 'Walang natukoy';
      textEn = 'None detected';
    } else {
      textTl = 'Hindi matukoy';
      textEn = 'Unknown';
    }
    const tagalog = document.createElement('span');
    tagalog.className = 'tl';
    tagalog.textContent = `${category.labelTl}: ${textTl}`;
    const english = document.createElement('span');
    english.className = 'en';
    english.textContent = `${category.labelEn}: ${textEn}`;
    item.append(tagalog, english);
    return item;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }

    const analysis = analyze(value);
    name.textContent = value;
    flagsList.replaceChildren(...categories.map((category) =>
      renderFlag(category, analysis.detected, analysis.recognized)
    ));

    const matchedAdvice = Object.keys(advice)
      .filter((key) => key !== 'general' && key !== 'unknown' && analysis.detected[key])
      .map((key) => advice[key]);
    const selectedAdvice = matchedAdvice.length ? matchedAdvice : [advice[analysis.recognized ? 'general' : 'unknown']];
    betterTl.textContent = selectedAdvice.map((entry) => entry[0]).join(' ');
    betterEn.textContent = selectedAdvice.map((entry) => entry[1]).join(' ');
    result.hidden = false;
  });
})();

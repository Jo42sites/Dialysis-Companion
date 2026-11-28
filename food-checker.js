(function () {
  'use strict';

  const form = document.querySelector('#foodCheckerForm');
  if (!form) return;

  const input = document.querySelector('#foodCheckerInput');
  const result = document.querySelector('#foodCheckerResult');
  const name = document.querySelector('#foodCheckerName');
  const flagsList = document.querySelector('#foodCheckerFlags');

  const categories = [
    { key: 'highK', labelTl: 'High K', labelEn: 'High K', type: 'risk' },
    { key: 'highP', labelTl: 'High P', labelEn: 'High P', type: 'risk' },
    { key: 'highNa', labelTl: 'High NA', labelEn: 'High NA', type: 'risk' },
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
    return detected;
  }

  function renderFlag(category, detected) {
    if (category.type !== 'risk' || !detected[category.key]) return null;

    const item = document.createElement('li');
    item.className = 'food-checker-flag flagged';
    const tagalog = document.createElement('span');
    tagalog.className = 'tl';
    tagalog.textContent = category.labelTl;
    const english = document.createElement('span');
    english.className = 'en';
    english.textContent = category.labelEn;
    item.append(tagalog, english);
    return item;
  }

  // Typing (or clearing) makes the previous answer stale.
  input.addEventListener('input', () => {
    result.hidden = true;
    flagsList.replaceChildren();
    name.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }

    const analysis = analyze(value);
    name.textContent = value;
    flagsList.replaceChildren(...categories
      .map((category) => renderFlag(category, analysis))
      .filter(Boolean));
    result.hidden = false;
  });
})();

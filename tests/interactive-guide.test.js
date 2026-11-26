'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Element {
  constructor() {
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.hidden = true;
    this.textContent = '';
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  reset() {}
}

function createGuide() {
  const ids = ['symptomResult', 'symptomForm', 'symptomResultTitle', 'symptomResultText', 'symptomDetails'];
  const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
  const languageButtons = ['tl', 'en'].map((language) => {
    const button = new Element();
    button.dataset.guideLang = language;
    return button;
  });
  const checkedSymptoms = [];
  const document = {
    documentElement: { dataset: {} },
    querySelector: (selector) => elements[selector],
    querySelectorAll(selector) {
      if (selector === '[data-guide-lang]') return languageButtons;
      if (selector === 'input[name="symptom"]:checked') return checkedSymptoms;
      return [];
    },
    createElement: () => new Element()
  };
  const window = { addEventListener() {} };
  const localStorage = { getItem: () => 'tl', setItem() {} };
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'interactive-guide.js'),
    'utf8'
  );
  vm.runInNewContext(script, { document, window, localStorage });
  return { elements, languageButtons, checkedSymptoms };
}

function submit(elements) {
  elements['#symptomForm'].listeners.submit({ preventDefault() {} });
}

function selectAllAdvice(elements) {
  return elements['#symptomDetails'].children
    .flatMap((detail) => detail.children[1].children)
    .map((item) => item.textContent)
    .join(' ');
}

test('low hemoglobin suggests renal-plan-compatible iron foods and avoids self-treatment', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'lowHb' });
  submit(elements);

  const advice = selectAllAdvice(elements);
  assert.match(advice, /lean meat, poultry, or fish/i);
  assert.match(advice, /renal dietitian/i);
  assert.match(advice, /do not start iron, vitamins, or epoetin/i);
  assert.equal(elements['#symptomResult'].dataset.level, 'general');
});

test('high hemoglobin does not suggest diet restriction or extra water', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'highHb' });
  submit(elements);

  const advice = selectAllAdvice(elements);
  assert.match(advice, /repeat CBC/i);
  assert.match(advice, /no food that safely and reliably lowers Hb/i);
  assert.match(advice, /do not.*add water/i);
});

test('high uric acid suggests reasonable food limits without excessive fluid advice', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'highUric' });
  submit(elements);

  const advice = selectAllAdvice(elements);
  assert.match(advice, /organ meats/i);
  assert.match(advice, /sardines/i);
  assert.match(advice, /sugary drinks/i);
  assert.match(advice, /do not eliminate protein or increase water/i);
});

test('dizziness suggests safe BP checking without recommending extra food or fluids', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'dizzy' });
  submit(elements);

  const advice = selectAllAdvice(elements);
  assert.match(advice, /record the reading/i);
  assert.match(advice, /do not add fluids or food/i);
  assert.match(advice, /call your dialysis team today/i);
  assert.equal(elements['#symptomResult'].dataset.level, 'same-day');
});

test('high blood pressure guidance recommends rest and rechecking, not self-treatment', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'highBP' });
  submit(elements);

  const advice = selectAllAdvice(elements);
  assert.match(advice, /sit quietly and rest/i);
  assert.match(advice, /repeat the measurement/i);
  assert.match(advice, /do not take an extra dose/i);
  assert.doesNotMatch(advice, /lie down/i);
});

test('multiple symptoms show emergency guidance before less urgent suggestions', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'itch' }, { value: 'chest' });
  submit(elements);

  assert.equal(elements['#symptomResult'].dataset.level, 'urgent');
  assert.match(elements['#symptomResultTitle'].textContent, /emergency/i);
  assert.match(elements['#symptomDetails'].children[0].children[0].children[0].textContent, /chest/i);
});

test('every selectable symptom or lab finding has a recommendation', () => {
  const { elements, checkedSymptoms } = createGuide();
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const values = Array.from(html.matchAll(/name="symptom" value="([^"]+)"/g), (match) => match[1]);
  checkedSymptoms.push(...values.map((value) => ({ value })));
  submit(elements);

  assert.equal(elements['#symptomDetails'].children.length, values.length);
});

test('the separate lab guide has been removed', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  assert.doesNotMatch(html, /GABAY SA LAB|LAB GUIDE|id="labForm"/i);
  assert.match(html, /GABAY SA SINTOMAS/);
});

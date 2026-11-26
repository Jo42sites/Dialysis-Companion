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
    this.value = '';
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
  const ids = [
    'labUnit', 'labTest', 'labResult', 'symptomResult', 'labFlag', 'labForm',
    'labValue', 'labResultTitle', 'labFlagText', 'labResultText',
    'labResultQuestions', 'labRecommendations', 'symptomForm',
    'symptomResultTitle', 'symptomResultText', 'symptomDetails'
  ];
  const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
  elements['#labTest'].value = 'hemoglobin';
  elements['#labFlag'].value = 'unsure';
  elements['#labFlag'].options = ['unsure', 'low', 'high', 'target'].map((value) => {
    const option = new Element();
    option.value = value;
    option.dataset.tl = value;
    option.dataset.en = value;
    return option;
  });
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
      if (selector === '#labFlag option') return elements['#labFlag'].options;
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

function submit(elements, formSelector) {
  elements[formSelector].listeners.submit({ preventDefault() {} });
}

test('low hemoglobin suggests renal-plan-compatible iron foods and avoids self-treatment', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#labValue'].value = '9.2';
  elements['#labFlag'].value = 'low';
  submit(elements, '#labForm');

  const recommendations = elements['#labRecommendations'].children
    .map((item) => item.textContent)
    .join(' ');
  assert.match(recommendations, /lean beef/i);
  assert.match(recommendations, /renal dietitian/i);
  assert.match(recommendations, /do not start over-the-counter iron/i);
  assert.match(elements['#labFlagText'].textContent, /below target/i);
});

test('dizziness suggests safe BP checking without recommending extra food or fluids', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'dizzy' });
  submit(elements, '#symptomForm');

  const advice = elements['#symptomDetails'].children[0].children[1].children
    .map((item) => item.textContent)
    .join(' ');
  assert.match(advice, /record the reading/i);
  assert.match(advice, /do not add fluids or food/i);
  assert.match(advice, /call your dialysis team today/i);
  assert.equal(elements['#symptomResult'].dataset.level, 'same-day');
});

test('high blood pressure guidance recommends rest and rechecking, not self-treatment', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'highBP' });
  submit(elements, '#symptomForm');

  const advice = elements['#symptomDetails'].children[0].children[1].children
    .map((item) => item.textContent)
    .join(' ');
  assert.match(advice, /sit quietly and rest/i);
  assert.match(advice, /repeat the measurement/i);
  assert.match(advice, /do not take an extra dose/i);
  assert.doesNotMatch(advice, /lie down/i);
});

test('multiple symptoms show emergency guidance before less urgent suggestions', () => {
  const { elements, checkedSymptoms, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  checkedSymptoms.push({ value: 'itch' }, { value: 'chest' });
  submit(elements, '#symptomForm');

  assert.equal(elements['#symptomResult'].dataset.level, 'urgent');
  assert.match(elements['#symptomResultTitle'].textContent, /emergency/i);
  assert.match(elements['#symptomDetails'].children[0].children[0].children[0].textContent, /chest/i);
  assert.equal(elements['#symptomDetails'].children.length, 2);
});

test('every symptom choice has a rendered recommendation', () => {
  const { elements, checkedSymptoms } = createGuide();
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const values = Array.from(html.matchAll(/name="symptom" value="([^"]+)"/g), (match) => match[1]);
  checkedSymptoms.push(...values.map((value) => ({ value })));
  submit(elements, '#symptomForm');

  assert.equal(elements['#symptomDetails'].children.length, values.length);
});

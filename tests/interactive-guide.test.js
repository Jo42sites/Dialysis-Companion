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
    'labForm', 'labTest', 'labRange', 'labResult', 'labResultTitle',
    'labResultText', 'labResultDetails', 'symptomResult', 'symptomForm',
    'symptomResultTitle', 'symptomResultText', 'symptomDetails', 'otherSymptom'
  ];
  const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
  elements['#labTest'].value = 'hemoglobin';
  elements['#labTest'].options = [
    'hemoglobin', 'potassium', 'phosphorus', 'calcium',
    'albumin', 'uricAcid', 'bun', 'glucose'
  ].map((value) => {
    const option = new Element();
    option.value = value;
    option.dataset.tl = value;
    option.dataset.en = value;
    return option;
  });
  elements['#labRange'].value = 'below';
  elements['#labRange'].options = ['below', 'within', 'above'].map((value) => {
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
      if (selector === '#labTest option') return elements['#labTest'].options;
      if (selector === '#labRange option') return elements['#labRange'].options;
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

function submitLab(elements) {
  elements['#labForm'].listeners.submit({ preventDefault() {} });
}

function selectAllAdvice(elements) {
  return elements['#symptomDetails'].children
    .flatMap((detail) => detail.children[1].children)
    .map((item) => item.textContent)
    .join(' ');
}

function selectLabAdvice(elements) {
  return elements['#labResultDetails'].children
    .flatMap((detail) => detail.children[1].children)
    .map((item) => item.textContent)
    .join(' ');
}

test('low hemoglobin range suggests renal-plan-compatible iron foods and avoids self-treatment', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#labTest'].value = 'hemoglobin';
  elements['#labRange'].value = 'below';
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /lean meat, poultry, or fish/i);
  assert.match(advice, /renal dietitian/i);
  assert.match(advice, /do not start iron, vitamins, or epoetin/i);
  assert.equal(elements['#labResult'].dataset.level, 'general');
});

test('high hemoglobin range does not suggest diet restriction or extra water', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#labTest'].value = 'hemoglobin';
  elements['#labRange'].value = 'above';
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /repeat CBC/i);
  assert.match(advice, /no food that safely and reliably lowers Hb/i);
  assert.match(advice, /do not.*add water/i);
});

test('high uric acid range suggests food limits without excessive fluid advice', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#labTest'].value = 'uricAcid';
  elements['#labRange'].value = 'above';
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /organ meats/i);
  assert.match(advice, /sardines/i);
  assert.match(advice, /sugary drinks/i);
  assert.match(advice, /do not eliminate protein or increase water/i);
});

test('high potassium range avoids a home food fix and flags emergency symptoms', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#labTest'].value = 'potassium';
  elements['#labRange'].value = 'above';
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /potassium can affect heart rhythm/i);
  assert.match(advice, /avoid salt substitutes/i);
  assert.match(advice, /do not make major diet changes/i);
  assert.match(advice, /call 911/i);
});

test('low dialysis adequacy is not offered as a normal-range laboratory option', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const testOptions = Array.from(html.matchAll(/<option value="([^"]+)"/g), (match) => match[1]);
  assert.equal(testOptions.some((value) => /ktv|urr|adequacy/i.test(value)), false);
});

test('low glucose guidance follows the personal plan and protects someone unable to swallow', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#labTest'].value = 'glucose';
  elements['#labRange'].value = 'below';
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /follow its written low-sugar steps/i);
  assert.match(advice, /give nothing by mouth/i);
  assert.match(advice, /call 911/i);
});

test('every listed laboratory has below, within, and above range guidance', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const testSelect = html.match(/<select id="labTest"[^>]*>([\s\S]*?)<\/select>/)[1];
  const tests = Array.from(testSelect.matchAll(/<option value="([^"]+)"/g), (match) => match[1])
    .filter(Boolean);

  for (const testName of tests) {
    for (const range of ['below', 'within', 'above']) {
      const { elements } = createGuide();
      elements['#labTest'].value = testName;
      elements['#labRange'].value = range;
      submitLab(elements);
      assert.equal(elements['#labResult'].hidden, false, `${testName} ${range}`);
      assert.ok(elements['#labResultDetails'].children[0].children[1].children.length, `${testName} ${range}`);
    }
  }
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

test('custom symptom gets safe general guidance and is rendered as plain text', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  elements['#otherSymptom'].value = '<img src=x onerror=alert(1)>';
  submit(elements);

  assert.equal(elements['#symptomResult'].dataset.level, 'general');
  assert.match(elements['#symptomDetails'].children[0].children[0].children[0].textContent, /<img/);
  const advice = selectAllAdvice(elements);
  assert.match(advice, /check and record blood pressure or temperature/i);
  assert.match(advice, /call your dialysis team today/i);
  assert.match(advice, /call 911/i);
});

test('custom symptom text alone is enough to get guidance', () => {
  const { elements } = createGuide();
  elements['#otherSymptom'].value = 'itchy skin';
  submit(elements);

  assert.equal(elements['#symptomDetails'].children.length, 1);
  assert.match(elements['#symptomResultText'].textContent, /Sundin|Follow/);
});

test('the separate lab-guide heading is absent while lab-range selection remains in symptom guide', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  assert.doesNotMatch(html, /GABAY SA LAB|LAB GUIDE/i);
  assert.match(html, /id="labForm"/);
  assert.match(html, /value="below"/);
  assert.match(html, /value="above"/);
  assert.match(html, /GABAY SA SINTOMAS/);
});

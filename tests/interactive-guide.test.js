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
    this.checked = false;
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
    'labForm', 'labResult', 'labResultTitle',
    'labResultText', 'labResultDetails', 'symptomResult', 'symptomForm',
    'symptomResultTitle', 'symptomResultText', 'symptomDetails', 'otherSymptom'
  ];
  const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
  const labInputs = [
    'hemoglobin', 'potassium', 'phosphorus', 'calcium',
    'albumin', 'uricAcid', 'bun', 'glucose'
  ].flatMap((test) => ['below', 'above'].map((range) => {
    const input = new Element();
    input.type = 'checkbox';
    input.value = range;
    input.dataset.test = test;
    return input;
  }));
  const clearButtons = [
    'hemoglobin', 'potassium', 'phosphorus', 'calcium',
    'albumin', 'uricAcid', 'bun', 'glucose'
  ].map((test) => {
    const button = new Element();
    button.dataset.clearLab = test;
    return button;
  });
  elements.labInputs = labInputs;
  elements.clearButtons = clearButtons;
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
      if (selector === '[data-clear-lab]') return clearButtons;
      if (selector === '#labForm input[type="checkbox"][data-test]') return labInputs;
      if (selector === '#labForm input[type="checkbox"]:checked') {
        return labInputs.filter((input) => input.checked);
      }
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

function selectLab(elements, testName, range) {
  const input = elements.labInputs.find(
    (candidate) => candidate.dataset.test === testName && candidate.value === range
  );
  assert.ok(input, `${testName} ${range} option exists`);
  input.checked = true;
  elements['#labForm'].listeners.change({ target: input });
}

function toggleLab(elements, testName, range) {
  const input = elements.labInputs.find(
    (candidate) => candidate.dataset.test === testName && candidate.value === range
  );
  assert.ok(input, `${testName} ${range} option exists`);
  input.checked = !input.checked;
  elements['#labForm'].listeners.change({ target: input });
}

function clearLab(elements, testName) {
  const button = elements.clearButtons.find(
    (candidate) => candidate.dataset.clearLab === testName
  );
  assert.ok(button, `${testName} clear control exists`);
  button.listeners.click();
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
  selectLab(elements, 'hemoglobin', 'below');
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
  selectLab(elements, 'hemoglobin', 'above');
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /repeat CBC/i);
  assert.match(advice, /no food that safely and reliably lowers Hb/i);
  assert.match(advice, /do not.*add water/i);
});

test('high uric acid range suggests food limits without excessive fluid advice', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  selectLab(elements, 'uricAcid', 'above');
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
  selectLab(elements, 'potassium', 'above');
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /potassium can affect heart rhythm/i);
  assert.match(advice, /avoid salt substitutes/i);
  assert.match(advice, /do not make major diet changes/i);
  assert.match(advice, /call 911/i);
});

test('low dialysis adequacy is not offered as a normal-range laboratory option', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const labNames = Array.from(html.matchAll(/data-lab="([^"]+)"/g), (match) => match[1]);
  assert.equal(labNames.some((name) => /ktv|urr|adequacy/i.test(name)), false);
});

test('low glucose guidance follows the personal plan and protects someone unable to swallow', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  selectLab(elements, 'glucose', 'below');
  submitLab(elements);

  const advice = selectLabAdvice(elements);
  assert.match(advice, /follow its written low-sugar steps/i);
  assert.match(advice, /give nothing by mouth/i);
  assert.match(advice, /call 911/i);
});

test('every listed laboratory has below and above range guidance', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const tests = Array.from(html.matchAll(/data-lab="([^"]+)"/g), (match) => match[1]);

  for (const testName of tests) {
    for (const range of ['below', 'above']) {
      const { elements, languageButtons } = createGuide();
      languageButtons[1].listeners.click({});
      selectLab(elements, testName, range);
      submitLab(elements);
      assert.equal(elements['#labResult'].hidden, false, `${testName} ${range}`);
      assert.match(
        elements['#labResultDetails'].children[0].children[0].children[0].textContent,
        new RegExp(range, 'i')
      );
      assert.ok(elements['#labResultDetails'].children[0].children[1].children.length, `${testName} ${range}`);
    }
  }
});

test('multiple abnormal lab results show recommendations together', () => {
  const { elements } = createGuide();
  selectLab(elements, 'hemoglobin', 'below');
  selectLab(elements, 'hemoglobin', 'above');
  selectLab(elements, 'potassium', 'above');
  assert.equal(elements.labInputs.find((input) =>
    input.dataset.test === 'hemoglobin' && input.value === 'below'
  ).checked, false);
  submitLab(elements);

  assert.equal(elements['#labResultDetails'].children.length, 2);
  assert.equal(elements['#labResult'].dataset.level, 'same-day');
});

test('a selected lab choice can be toggled off before submitting', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  toggleLab(elements, 'hemoglobin', 'below');
  assert.equal(elements.labInputs[0].checked, true);
  toggleLab(elements, 'hemoglobin', 'below');
  assert.equal(elements.labInputs[0].checked, false);
  submitLab(elements);

  assert.match(elements['#labResultTitle'].textContent, /select a result/i);
  assert.equal(elements['#labResultDetails'].children.length, 0);
});

test('the per-lab clear control removes a submitted selection and its recommendations', () => {
  const { elements } = createGuide();
  selectLab(elements, 'hemoglobin', 'below');
  submitLab(elements);
  clearLab(elements, 'hemoglobin');

  assert.equal(elements.labInputs[0].checked, false);
  assert.match(elements['#labResultTitle'].textContent, /pumili muna ng resulta/i);
  assert.equal(elements['#labResultDetails'].children.length, 0);
});

test('submitting with no abnormal lab selection prompts the user', () => {
  const { elements, languageButtons } = createGuide();
  languageButtons[1].listeners.click({});
  submitLab(elements);

  assert.equal(elements['#labResult'].hidden, false);
  assert.match(elements['#labResultTitle'].textContent, /select a result/i);
  assert.equal(elements['#labResultDetails'].children.length, 0);
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

test('the labs and symptoms heading labels the guide with lab-range selection', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  assert.match(html, /Gabay sa Labs at Sintomas/i);
  assert.match(html, /id="labForm"/);
  assert.match(html, /value="below"/);
  assert.match(html, /value="above"/);
  assert.match(html, /GABAY SA SINTOMAS/);
});

test('the guide keeps the standard sticky navigation and mobile menu available', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const guideStyles = fs.readFileSync(path.join(__dirname, '..', 'interactive-guide.css'), 'utf8');
  const desktopNav = html.match(/<nav class="main-nav"[\s\S]*?<\/nav>/)?.[0];
  const mobileMenu = html.match(/<div class="mobile-menu"[\s\S]*?<\/div>\s*<div class="mobile-menu-foot"/)?.[0];

  assert.match(html, /<div class="utility-bar">/);
  assert.match(styles, /\.site-header\s*\{[^}]*position:\s*sticky;/);
  assert.match(guideStyles, /@media\s*\(max-width:\s*1080px\)\s*\{[\s\S]*?\.interactive-guide-page \.main-nav\s*\{[^}]*display:\s*flex;[\s\S]*?overflow-x:\s*auto;/);
  assert.ok(desktopNav, 'standard desktop navigation exists');
  assert.ok(mobileMenu, 'mobile navigation exists');
  assert.match(desktopNav, /href="daily-care\.html"/);
  assert.match(desktopNav, /href="emergency\.html"/);
  assert.match(desktopNav, /href="account\.html" aria-current="page"/);
  assert.match(html, /id="menuToggle"[^>]*aria-controls="mobileMenu"/);
  assert.match(mobileMenu, /href="daily-care\.html"/);
  assert.match(mobileMenu, /href="emergency\.html"/);
});

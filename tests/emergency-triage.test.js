'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Element {
  constructor() {
    this.dataset = {};
    this.hidden = true;
    this.listeners = {};
    this.textContent = '';
    this.value = '';
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  focus() {
    this.focused = true;
  }
}

function createChecker() {
  const ids = [
    'emergencyCheckerForm', 'emergencyDescription', 'emergencyCheckerResult',
    'emergencyCheckerLevelTl', 'emergencyCheckerLevelEn',
    'emergencyCheckerAdviceTl', 'emergencyCheckerAdviceEn', 'emergencyCheckerCall'
  ];
  const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
  const document = { querySelector: (selector) => elements[selector] };
  const source = fs.readFileSync(path.join(__dirname, '..', 'emergency-triage.js'), 'utf8');
  vm.runInNewContext(source, { document });
  return elements;
}

function check(description) {
  const elements = createChecker();
  elements['#emergencyDescription'].value = description;
  elements['#emergencyCheckerForm'].listeners.submit({ preventDefault() {} });
  return elements;
}

test('red flags trigger immediate 911 guidance and a call link', () => {
  const result = check('May sakit ng dibdib at nahihilo ako');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'red');
  assert.equal(result['#emergencyCheckerCall'].hidden, false);
  assert.match(result['#emergencyCheckerAdviceTl'].textContent, /Tumawag sa 911/);
});

test('fever with a dialysis catheter is classified as red', () => {
  const result = check('Lagnat at panginginig habang may catheter');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'red');
});

test('concerning but not obviously life-threatening symptoms are yellow', () => {
  const result = check('Paulit-ulit ang pagsusuka');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'yellow');
  assert.equal(result['#emergencyCheckerCall'].hidden, true);
});

test('only clearly mild familiar symptoms are green', () => {
  const result = check('Banayad na pangangati');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'green');
});

test('a new or worsening mild symptom is escalated to yellow', () => {
  const result = check('Bagong banayad na pangangati');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'yellow');
});

test('unknown symptoms are directed to a healthcare worker rather than reassured', () => {
  const result = check('May kakaiba akong nararamdaman');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'yellow');
});

test('user-entered text is never inserted as markup', () => {
  const result = check('<img src=x onerror=alert(1)>');
  assert.equal(result['#emergencyCheckerResult'].dataset.level, 'yellow');
  assert.equal(result['#emergencyCheckerLevelTl'].textContent, 'DILAW: Ipaalam sa healthcare worker');
});

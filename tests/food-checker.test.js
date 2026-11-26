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
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.className = '';
    this.classList = {
      add: (name) => {
        this.className = `${this.className} ${name}`.trim();
      }
    };
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  focus() {
    this.focused = true;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  append(...children) {
    this.children.push(...children);
  }
}

function createChecker(food) {
  const ids = [
    'foodCheckerForm', 'foodCheckerInput', 'foodCheckerResult',
    'foodCheckerName', 'foodCheckerFlags', 'foodCheckerBetterTl',
    'foodCheckerBetterEn'
  ];
  const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
  elements['#foodCheckerInput'].value = food;
  const document = {
    querySelector: (selector) => elements[selector],
    createElement: () => new Element()
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'food-checker.js'), 'utf8');
  vm.runInNewContext(source, { document });
  elements['#foodCheckerForm'].listeners.submit({ preventDefault() {} });
  return elements;
}

function flagText(item) {
  return item.children[0]?.textContent || '';
}

test('instant noodles flag sodium and phosphorus and suggest a fresh alternative', () => {
  const result = createChecker('Instant noodles');
  const flags = result['#foodCheckerFlags'].children.map(flagText);
  assert.deepEqual(flags, ['High P', 'High NA']);
  assert.match(result['#foodCheckerBetterTl'].textContent, /sariwa at hindi maalat/);
});

test('banana flags potassium in Tagalog', () => {
  const result = createChecker('Saging');
  assert.deepEqual(result['#foodCheckerFlags'].children.map(flagText), ['High K']);
  assert.match(result['#foodCheckerBetterTl'].textContent, /lower-potassium|mababang-potassium/);
});

test('recognized foods show only high nutrient flags without claiming no flag means safe', () => {
  const result = createChecker('Rice');
  const flags = result['#foodCheckerFlags'].children.map(flagText);
  assert.deepEqual(flags, []);
  assert.match(result['#foodCheckerBetterEn'].textContent, /does not guarantee it is safe/);
});

test('protein and fluid matches do not create non-high badges', () => {
  const result = createChecker('Egg');
  assert.deepEqual(result['#foodCheckerFlags'].children.map(flagText), ['High P']);
});

test('unknown foods do not get uncertainty badges', () => {
  const result = createChecker('Mystery dish');
  assert.deepEqual(result['#foodCheckerFlags'].children, []);
  assert.match(result['#foodCheckerBetterEn'].textContent, /cannot be identified/);
});

test('user-entered food text is rendered as text, not markup', () => {
  const result = createChecker('<img src=x>');
  assert.equal(result['#foodCheckerName'].textContent, '<img src=x>');
  assert.equal(result['#foodCheckerFlags'].children.length, 0);
});

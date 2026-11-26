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
  return item.children.map((child) => child.textContent).join(' ');
}

test('instant noodles flag sodium and phosphorus and suggest a fresh alternative', () => {
  const result = createChecker('Instant noodles');
  const flags = result['#foodCheckerFlags'].children.map(flagText).join('\n');
  assert.match(flags, /High P: Potentially high/);
  assert.match(flags, /High Na: Potentially high/);
  assert.match(result['#foodCheckerBetterTl'].textContent, /sariwa at hindi maalat/);
});

test('banana flags potassium in Tagalog', () => {
  const result = createChecker('Saging');
  assert.match(flagText(result['#foodCheckerFlags'].children[0]), /Posibleng mataas/);
  assert.match(result['#foodCheckerBetterTl'].textContent, /lower-potassium|mababang-potassium/);
});

test('known foods show all requested categories and do not claim no flag means safe', () => {
  const result = createChecker('Rice');
  const flags = result['#foodCheckerFlags'].children.map(flagText);
  assert.equal(flags.length, 5);
  assert.ok(flags.every((item) => item.includes('None detected')));
  assert.ok(flags.every((item) => !item.includes('No common flag identified')));
  assert.match(result['#foodCheckerBetterEn'].textContent, /does not guarantee it is safe/);
});

test('unknown foods are not assigned false low-risk results', () => {
  const result = createChecker('Mystery dish');
  const flags = result['#foodCheckerFlags'].children.map(flagText);
  assert.ok(flags.every((item) => item.includes('Unknown')));
  assert.match(result['#foodCheckerBetterEn'].textContent, /cannot be identified/);
});

test('user-entered food text is rendered as text, not markup', () => {
  const result = createChecker('<img src=x>');
  assert.equal(result['#foodCheckerName'].textContent, '<img src=x>');
  assert.equal(result['#foodCheckerFlags'].children.length, 5);
});

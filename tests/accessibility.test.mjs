import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindKeyboard,
  isButtonElement,
  isTextEntryElement,
  keyToAction
} from '../src/accessibility.mjs';

function keyEvent(overrides = {}) {
  return {
    key: '',
    code: '',
    target: { tagName: 'DIV' },
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides
  };
}

function fakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
    dispatch(event) {
      const handler = listeners.get('keydown');
      if (handler) {
        handler(event);
      }
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

test('Space toggles start/pause/resume', () => {
  assert.deepEqual(keyToAction(keyEvent({ key: ' ', code: 'Space' })), { type: 'toggle' });
  assert.deepEqual(keyToAction(keyEvent({ key: 'Spacebar', code: 'Space' })), { type: 'toggle' });
  assert.deepEqual(keyToAction(keyEvent({ key: '', code: 'Space' })), { type: 'toggle' });
});

test('Escape cancels', () => {
  assert.deepEqual(keyToAction(keyEvent({ key: 'Escape', code: 'Escape' })), { type: 'cancel' });
  assert.deepEqual(keyToAction(keyEvent({ key: 'Esc', code: 'Escape' })), { type: 'cancel' });
});

test('Digit1/2/3 select the 25/50/90 minute presets', () => {
  assert.deepEqual(keyToAction(keyEvent({ key: '1', code: 'Digit1' })), { type: 'preset', minutes: 25 });
  assert.deepEqual(keyToAction(keyEvent({ key: '2', code: 'Digit2' })), { type: 'preset', minutes: 50 });
  assert.deepEqual(keyToAction(keyEvent({ key: '3', code: 'Digit3' })), { type: 'preset', minutes: 90 });
  assert.deepEqual(keyToAction(keyEvent({ key: '1', code: 'Numpad1' })), { type: 'preset', minutes: 25 });
});

test('unrelated and empty keys produce no action', () => {
  assert.equal(keyToAction(keyEvent({ key: 'a', code: 'KeyA' })), null);
  assert.equal(keyToAction(keyEvent({ key: 'Enter', code: 'Enter' })), null);
  assert.equal(keyToAction(keyEvent({ key: '4', code: 'Digit4' })), null);
  assert.equal(keyToAction(null), null);
  assert.equal(keyToAction('space'), null);
  assert.equal(keyToAction(undefined), null);
});

test('key repeat is ignored', () => {
  assert.equal(keyToAction(keyEvent({ key: ' ', code: 'Space', repeat: true })), null);
  assert.equal(keyToAction(keyEvent({ key: 'Escape', code: 'Escape', repeat: true })), null);
  assert.equal(keyToAction(keyEvent({ key: '1', code: 'Digit1', repeat: true })), null);
});

test('modifier chords are ignored', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    assert.equal(keyToAction(keyEvent({ key: ' ', code: 'Space', [modifier]: true })), null, modifier);
    assert.equal(keyToAction(keyEvent({ key: '1', code: 'Digit1', [modifier]: true })), null, modifier);
    assert.equal(keyToAction(keyEvent({ key: 'Escape', code: 'Escape', [modifier]: true })), null, modifier);
  }
});

test('events already handled elsewhere are ignored', () => {
  assert.equal(keyToAction(keyEvent({ key: ' ', code: 'Space', defaultPrevented: true })), null);
});

test('typing inside inputs, textareas, selects and contenteditable is never hijacked', () => {
  const targets = [
    { tagName: 'INPUT', type: 'text' },
    { tagName: 'INPUT', type: 'search' },
    { tagName: 'INPUT', type: 'number' },
    { tagName: 'INPUT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'div', isContentEditable: true }
  ];
  for (const target of targets) {
    assert.equal(isTextEntryElement(target), true, JSON.stringify(target));
    assert.equal(keyToAction(keyEvent({ key: ' ', code: 'Space', target })), null);
    assert.equal(keyToAction(keyEvent({ key: 'Escape', code: 'Escape', target })), null);
    assert.equal(keyToAction(keyEvent({ key: '1', code: 'Digit1', target })), null);
  }
});

test('Space on a focused button is left to the native click handler', () => {
  const button = { tagName: 'BUTTON' };
  assert.equal(isButtonElement(button), true);
  assert.equal(keyToAction(keyEvent({ key: ' ', code: 'Space', target: button })), null);
  assert.deepEqual(keyToAction(keyEvent({ key: 'Escape', code: 'Escape', target: button })), { type: 'cancel' });
  assert.deepEqual(keyToAction(keyEvent({ key: '2', code: 'Digit2', target: button })), { type: 'preset', minutes: 50 });
});

test('button-like inputs share the native Space behavior', () => {
  for (const type of ['button', 'submit', 'reset', 'checkbox', 'radio']) {
    const target = { tagName: 'INPUT', type };
    assert.equal(isButtonElement(target), true, type);
    assert.equal(keyToAction(keyEvent({ key: ' ', code: 'Space', target })), null, type);
  }
});

test('explicit context overrides target inspection', () => {
  const event = keyEvent({ key: ' ', code: 'Space', target: { tagName: 'DIV' } });
  assert.deepEqual(keyToAction(event, { isButton: true }), null);
  assert.equal(keyToAction(event, { isTextEntry: true }), null);
  assert.deepEqual(keyToAction({ ...event, target: { tagName: 'BUTTON' } }, { isButton: false }), {
    type: 'toggle'
  });
});

test('bindKeyboard wires handlers and returns a cleanup that unbinds them', () => {
  const target = fakeTarget();
  const calls = [];
  const cleanup = bindKeyboard(target, {
    onToggle: () => calls.push('toggle'),
    onCancel: () => calls.push('cancel'),
    onPreset: (minutes) => calls.push(`preset:${minutes}`)
  });

  assert.equal(target.listenerCount(), 1);

  const space = keyEvent({ key: ' ', code: 'Space' });
  target.dispatch(space);
  target.dispatch(keyEvent({ key: 'Escape', code: 'Escape' }));
  target.dispatch(keyEvent({ key: '3', code: 'Digit3' }));
  assert.deepEqual(calls, ['toggle', 'cancel', 'preset:90']);
  assert.equal(space.defaultPrevented, true);

  cleanup();
  assert.equal(target.listenerCount(), 0);
  target.dispatch(keyEvent({ key: ' ', code: 'Space' }));
  assert.deepEqual(calls, ['toggle', 'cancel', 'preset:90']);
});

test('bindKeyboard ignores keys while typing in an injected input', () => {
  const target = fakeTarget();
  const calls = [];
  bindKeyboard(target, { onToggle: () => calls.push('toggle'), onCancel: () => calls.push('cancel') });
  target.dispatch(keyEvent({ key: ' ', code: 'Space', target: { tagName: 'INPUT', type: 'text' } }));
  target.dispatch(keyEvent({ key: 'Escape', code: 'Escape', target: { tagName: 'TEXTAREA' } }));
  assert.deepEqual(calls, []);
});

test('bindKeyboard tolerates missing handlers and invalid targets', () => {
  const target = fakeTarget();
  const cleanup = bindKeyboard(target, {});
  assert.doesNotThrow(() => target.dispatch(keyEvent({ key: ' ', code: 'Space' })));
  assert.doesNotThrow(() => cleanup());

  for (const bad of [null, undefined, {}, { addEventListener() {} }]) {
    const noop = bindKeyboard(bad, { onToggle() {} });
    assert.equal(typeof noop, 'function');
    assert.doesNotThrow(() => noop());
  }
});

test('preset handlers receive the numeric minutes and the event', () => {
  const target = fakeTarget();
  const seen = [];
  bindKeyboard(target, { onPreset: (minutes, event) => seen.push([minutes, event.code]) });
  target.dispatch(keyEvent({ key: '1', code: 'Digit1' }));
  target.dispatch(keyEvent({ key: '2', code: 'Digit2' }));
  assert.deepEqual(seen, [[25, 'Digit1'], [50, 'Digit2']]);
});

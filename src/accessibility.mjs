const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio']);

function tagNameOf(element) {
  if (!element || typeof element !== 'object') {
    return '';
  }
  return typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
}

export function isTextEntryElement(element) {
  if (!element || typeof element !== 'object') {
    return false;
  }
  const tag = tagNameOf(element);
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (element.isContentEditable === true) {
    return true;
  }
  if (tag === 'INPUT') {
    const type = typeof element.type === 'string' ? element.type.toLowerCase() : 'text';
    return !BUTTON_INPUT_TYPES.has(type);
  }
  return false;
}

export function isButtonElement(element) {
  const tag = tagNameOf(element);
  if (tag === 'BUTTON') {
    return true;
  }
  if (tag === 'INPUT') {
    const type = typeof element.type === 'string' ? element.type.toLowerCase() : '';
    return BUTTON_INPUT_TYPES.has(type);
  }
  return false;
}

export function keyToAction(event, context = {}) {
  if (!event || typeof event !== 'object' || event.defaultPrevented === true) {
    return null;
  }
  if (event.repeat === true) {
    return null;
  }
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true || event.shiftKey === true) {
    return null;
  }

  const target = context.target !== undefined ? context.target : event.target;
  const isTextEntry =
    context.isTextEntry !== undefined ? context.isTextEntry === true : isTextEntryElement(target);
  if (isTextEntry) {
    return null;
  }

  const key = typeof event.key === 'string' ? event.key : '';
  const code = typeof event.code === 'string' ? event.code : '';

  if (key === ' ' || key === 'Spacebar' || code === 'Space') {
    const isButton =
      context.isButton !== undefined ? context.isButton === true : isButtonElement(target);
    return isButton ? null : { type: 'toggle' };
  }

  if (key === 'Escape' || key === 'Esc' || code === 'Escape') {
    return { type: 'cancel' };
  }

  if (code === 'Digit1' || code === 'Numpad1' || key === '1') {
    return { type: 'preset', minutes: 25 };
  }
  if (code === 'Digit2' || code === 'Numpad2' || key === '2') {
    return { type: 'preset', minutes: 50 };
  }
  if (code === 'Digit3' || code === 'Numpad3' || key === '3') {
    return { type: 'preset', minutes: 90 };
  }

  return null;
}

export function bindKeyboard(target, handlers = {}) {
  if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
    return () => {};
  }

  const { onToggle, onCancel, onPreset } = handlers;

  function handleKeydown(event) {
    const action = keyToAction(event);
    if (!action) {
      return;
    }
    if (action.type === 'toggle') {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (typeof onToggle === 'function') {
        onToggle(event);
      }
    } else if (action.type === 'cancel') {
      if (typeof onCancel === 'function') {
        onCancel(event);
      }
    } else if (action.type === 'preset' && typeof onPreset === 'function') {
      onPreset(action.minutes, event);
    }
  }

  target.addEventListener('keydown', handleKeydown);

  return function cleanup() {
    target.removeEventListener('keydown', handleKeydown);
  };
}

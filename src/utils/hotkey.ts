const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift'])

const NAMED_KEYS: Readonly<Record<string, string>> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
}

const CYRILLIC_PHYSICAL_KEYS: Readonly<Record<string, string>> = {
  Й: 'Q',
  Ц: 'W',
  У: 'E',
  К: 'R',
  Е: 'T',
  Н: 'Y',
  Г: 'U',
  Ш: 'I',
  Щ: 'O',
  З: 'P',
  Х: 'BracketLeft',
  Ъ: 'BracketRight',
  Ф: 'A',
  Ы: 'S',
  В: 'D',
  А: 'F',
  П: 'G',
  Р: 'H',
  О: 'J',
  Л: 'K',
  Д: 'L',
  Ж: 'Semicolon',
  Э: 'Quote',
  Я: 'Z',
  Ч: 'X',
  С: 'C',
  М: 'V',
  И: 'B',
  Т: 'N',
  Ь: 'M',
  Б: 'Comma',
  Ю: 'Period',
}

function keyFromLegacyCode(keyCode: number): string | undefined {
  if (keyCode >= 65 && keyCode <= 90) return String.fromCharCode(keyCode)
  if (keyCode >= 48 && keyCode <= 57) return String.fromCharCode(keyCode)
  if (keyCode >= 112 && keyCode <= 135) return `F${keyCode - 111}`
  return undefined
}

function keyFromEvent(event: KeyboardEvent): string | undefined {
  if (event.code.startsWith('Key')) return event.code.slice(3)
  if (event.code.startsWith('Digit')) return event.code.slice(5)
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)) return event.code
  if (NAMED_KEYS[event.code]) return NAMED_KEYS[event.code]

  // WebView2 can omit `code` for injected/global input on non-Latin layouts.
  const legacyKey = keyFromLegacyCode(event.keyCode)
  if (legacyKey) return legacyKey

  const normalizedKey = event.key.toUpperCase()
  if (/^[A-Z0-9]$/.test(normalizedKey)) return normalizedKey
  if (CYRILLIC_PHYSICAL_KEYS[normalizedKey]) return CYRILLIC_PHYSICAL_KEYS[normalizedKey]
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key
  return NAMED_KEYS[event.key]
}

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}

export function hotkeyFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (isModifierKey(event.key)) return null

  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')

  const key = keyFromEvent(event)

  if (!key) return null
  if (modifiers.length === 0 && !key.startsWith('F')) return null
  return [...modifiers, key].join('+')
}

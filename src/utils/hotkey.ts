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

  let key: string | undefined
  if (event.code.startsWith('Key')) key = event.code.slice(3)
  else if (event.code.startsWith('Digit')) key = event.code.slice(5)
  else if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = event.code
  else key = NAMED_KEYS[event.code]

  if (!key) return null
  if (modifiers.length === 0 && !key.startsWith('F')) return null
  return [...modifiers, key].join('+')
}

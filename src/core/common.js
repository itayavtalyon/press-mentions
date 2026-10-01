/**
 * Read one own property without bracket access on a parsed object.
 * @param {object} record Parsed object.
 * @param {string} key Property name.
 * @returns {unknown} The own value, or undefined when the key is absent.
 */
export function ownValue(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);

  return descriptor === undefined ? undefined : descriptor.value;
}

/**
 * Set one own enumerable property without bracket assignment.
 * @param {object} record Object to update.
 * @param {string} key Property name.
 * @param {unknown} value Property value.
 */
export function defineValue(record, key, value) {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/**
 * @param {unknown} value Any value.
 * @returns {value is Record<string, unknown>} True for a plain object.
 */
export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

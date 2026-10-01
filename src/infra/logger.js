/**
 * @typedef {(event: string, fields?: Record<string, unknown>) => void} Log
 *   Writes one structured line: company, guid, stage, and error are the fields to grep for.
 */

/**
 * Creates a logger that writes one JSON object per line.
 * @param {(line: string) => void} [write] Line sink. Defaults to standard output.
 * @param {() => Date} [now] Time source for the `at` field.
 * @returns {Log} The logger.
 */
export function createLogger(
  write = (line) => console.log(line),
  now = () => new Date(),
) {
  return (event, fields = {}) => {
    write(JSON.stringify({ at: now().toISOString(), event, ...fields }));
  };
}

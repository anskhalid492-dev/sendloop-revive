/**
 * Pure caret/selection helper for the sequence editor.
 *
 * Insertion is always computed from the field's current selection, so a
 * variable lands exactly where the customer clicked (or replaces the text they
 * selected) instead of being appended to the end of the email.
 */

export type EditorSelection = { start: number; end: number };

export function insertAtSelection(
  value: string,
  selection: EditorSelection,
  snippet: string,
): { value: string; caret: number } {
  const start = Math.min(Math.max(selection.start, 0), value.length);
  const end = Math.min(Math.max(selection.end, start), value.length);
  return {
    value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
    caret: start + snippet.length,
  };
}

export function variableSnippet(token: string): string {
  return `{{${token}}}`;
}

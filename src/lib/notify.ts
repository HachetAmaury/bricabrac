/** Shows a blocking message to the user. A module of its own so tests can mock it. */
export function notify(message: string): void {
  alert(message);
}

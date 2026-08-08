// Stable id generation. Uses the platform crypto.randomUUID (available in all
// modern browsers and Node 18+), so no extra dependency is required.
export function newId(): string {
  return crypto.randomUUID();
}

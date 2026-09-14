export function accessAssertionFromHeaders(headers: Headers): string | null {
  const assertion = headers.get("cf-access-jwt-assertion");
  return assertion && assertion.trim() ? assertion : null;
}

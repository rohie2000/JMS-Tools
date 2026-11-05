// Simple client-side access gate, not server authentication.
// To change the app password, replace this SHA-256 digest and republish.
const PASSWORD_HASH = "3e0ff10c07422d89f1a11dadc67f95e1e04005db5292c12d508b276c4488d7ec";

export async function checkTeacherPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return actual === PASSWORD_HASH;
}

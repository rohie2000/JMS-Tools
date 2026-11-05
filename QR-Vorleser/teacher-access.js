// Simple client-side access gate, not server authentication.
// To change the app password, replace this SHA-256 digest and republish.
const PASSWORD_HASH = "0e58ffb0507016ce1b489931234b2f09fecb1cee4e7ec323264a8540b4c64ba8";

export async function checkTeacherPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return actual === PASSWORD_HASH;
}

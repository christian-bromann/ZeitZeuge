/**
 * PERF ISSUE [Blocking]: A naive, CPU-intensive synchronous password
 * hashing implementation. In production code this should use the
 * Web Crypto API or `node:crypto` with async PBKDF2 / scrypt.
 */
export function hashPassword(password: string, iterations = 10_000): string {
  // PERF ISSUE [Excessive Instantiation]: Creates a new TextEncoder
  // on every call. TextEncoder is stateless and should be a singleton.
  const encoder = new TextEncoder();
  let hash = encoder.encode(password);

  // PERF ISSUE [Blocking]: Synchronous CPU-bound loop that prevents
  // the event loop from processing any other work.
  for (let i = 0; i < iterations; i++) {
    const next = new Uint8Array(hash.length);
    for (let j = 0; j < hash.length; j++) {
      next[j] = ((hash[j]! ^ (i & 0xff)) + (j & 0xff)) & 0xff;
    }
    hash = next;
  }

  // Convert to hex string.
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * PERF ISSUE [Blocking]: Generates a random token and then hashes it,
 * compounding the blocking behaviour of `hashPassword`.
 */
export function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  // PERF ISSUE [Excessive Instantiation]: Allocates an intermediate
  // array, fills it, maps it, then joins — several temporary arrays.
  const result = Array.from({ length }, () => {
    const index = Math.floor(Math.random() * chars.length);
    return chars.charAt(index);
  }).join('');

  // Hash the token with a smaller iteration count — still blocking.
  return hashPassword(result, 100);
}

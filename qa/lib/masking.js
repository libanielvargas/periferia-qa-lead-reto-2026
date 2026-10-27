// Enmascara secretos antes de registrarlos o adjuntarlos a evidencia.
// Dos capas: por nombre de clave (password, token, ...) y por forma del valor
// (Bearer, tokens largos). Conservador: ante la duda, redacta.

const SECRET_KEY_RE =
  /(pass(word)?|secret|token|api[_-]?key|authorization|auth|credential|cookie|session|bearer|private[_-]?key)/i;
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
const LONG_TOKEN_RE = /\b[A-Za-z0-9._-]{24,}\b/g; // claves/JWT/tokens largos

export const MASK = '***REDACTED***';

export function maskString(input) {
  if (typeof input !== 'string') return input;
  return input.replace(BEARER_RE, `$1${MASK}`).replace(LONG_TOKEN_RE, MASK);
}

export function maskValue(key, value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => maskValue(key, v));
  if (typeof value === 'object') return maskObject(value);
  if (typeof key === 'string' && SECRET_KEY_RE.test(key)) return MASK;
  if (typeof value === 'string') return maskString(value);
  return value;
}

export function maskObject(obj) {
  if (obj == null || typeof obj !== 'object') return maskValue(undefined, obj);
  if (Array.isArray(obj)) return obj.map((v) => maskObject(v));
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = maskValue(k, v);
  return out;
}

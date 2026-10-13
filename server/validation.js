export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export function validateObject(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(422, 'Request body must be an object', 'VALIDATION_ERROR');
  }
  const unknown = Object.keys(body).filter(key => !allowed.includes(key));
  if (unknown.length) throw new ApiError(422, 'Unknown request fields', 'VALIDATION_ERROR', unknown.map(field => ({ field, message: 'Unknown field' })));
}

export function textField(value, field, max, { required = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new ApiError(422, `${field} must be ${required ? 'a non-empty' : 'a'} string of at most ${max} characters`, 'VALIDATION_ERROR');
  }
  return value.trim();
}

export async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')) {
    throw new ApiError(415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
  }
  const max = 64 * 1024;
  if (Number(req.headers['content-length']) > max) {
    req.resume();
    throw new ApiError(413, 'Request body exceeds 64 KiB', 'BODY_TOO_LARGE');
  }
  let length = 0;
  const chunks = [];
  // Keep the socket alive long enough to deliver a JSON 413 for chunked input.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > max) {
      req.resume();
      throw new ApiError(413, 'Request body exceeds 64 KiB', 'BODY_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Request body must contain valid JSON', 'INVALID_JSON');
  }
}

export function pagination(searchParams) {
  for (const key of searchParams.keys()) {
    if (!['limit', 'offset'].includes(key) || searchParams.getAll(key).length !== 1) {
      throw new ApiError(400, 'Only single limit and offset query parameters are supported', 'INVALID_QUERY');
    }
  }
  const parse = (key, fallback, min, max) => {
    if (!searchParams.has(key)) return fallback;
    const raw = searchParams.get(key);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new ApiError(400, `${key} must be an integer between ${min} and ${max}`, 'INVALID_QUERY');
    }
    return value;
  };
  return { limit: parse('limit', 50, 1, 100), offset: parse('offset', 0, 0, Number.MAX_SAFE_INTEGER) };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { ApiError, pagination, readJson, textField, validateObject } from '../server/validation.js';
import { getTemplate, templates, validateParameters } from '../server/templates.js';

const rejectsValidation = (action, field) => assert.throws(action, error =>
  error instanceof ApiError && error.status === 422 && error.code === 'VALIDATION_ERROR'
  && (!field || error.details.some(issue => issue.field === `parameters.${field}`)));

test('template defaults are complete, independent snapshots and preserve decimal dimensions', () => {
  for (const template of templates) {
    const defaults = Object.fromEntries(Object.entries(template.parameters).map(([key, rule]) => [key, rule.default]));
    assert.deepEqual(validateParameters(template), defaults);
    const input = { height: 32.5 };
    const normalized = validateParameters(template, input);
    assert.equal(normalized.height, 32.5);
    assert.deepEqual(input, { height: 32.5 });
    normalized.height = 99;
    assert.deepEqual(validateParameters(template), defaults);
  }
  assert.throws(() => getTemplate('unknown'), { status: 404, code: 'NOT_FOUND' });
});

test('parameter validation rejects non-numbers, non-finite values, unknown keys and invalid containers', () => {
  const template = getTemplate('bracket');
  for (const value of ['40', '', null, undefined, true, NaN, Infinity, -Infinity, 9.99, 200.01]) {
    rejectsValidation(() => validateParameters(template, { width: value }), 'width');
  }
  for (const input of [null, [], 'bracket', 40]) rejectsValidation(() => validateParameters(template, input));
  rejectsValidation(() => validateParameters(template, JSON.parse('{"__proto__":1}')), '__proto__');
  assert.throws(() => validateParameters(template, { width: null, extra: 1 }), error => {
    assert.deepEqual(error.details.map(issue => issue.field), ['parameters.extra', 'parameters.width']);
    return true;
  });
});

test('bracket and enclosure reject closed geometry at the boundary and allow zero holes', () => {
  const bracket = getTemplate('bracket');
  rejectsValidation(() => validateParameters(bracket, { height: 10, thickness: 5, holeDiameter: 0 }), 'thickness');
  assert.equal(validateParameters(bracket, { height: 10, thickness: 4.99, holeDiameter: 0 }).holeDiameter, 0);
  rejectsValidation(() => validateParameters(bracket, { width: 13, holeDiameter: 5 }), 'holeDiameter');
  assert.equal(validateParameters(bracket, { width: 13.01, holeDiameter: 5 }).width, 13.01);
  const enclosure = getTemplate('enclosure');
  rejectsValidation(() => validateParameters(enclosure, { width: 10, wallThickness: 5 }), 'wallThickness');
  rejectsValidation(() => validateParameters(enclosure, { height: 5, wallThickness: 5 }), 'wallThickness');
  assert.equal(validateParameters(enclosure, { width: 10, height: 5, wallThickness: 4.99 }).wallThickness, 4.99);
});

test('spacer minimum radial wall accepts decimal equality without accepting thinner material', () => {
  const spacer = getTemplate('spacer');
  for (const [outerDiameter, innerDiameter] of [[3, 1], [3.01, 1.01], [16.12, 14.12], [82, 80]]) {
    assert.equal(validateParameters(spacer, { outerDiameter, innerDiameter }).innerDiameter, innerDiameter);
  }
  for (const innerDiameter of [1.010001, 3.01, 4]) {
    rejectsValidation(() => validateParameters(spacer, { outerDiameter: 3.01, innerDiameter }), 'innerDiameter');
  }
  assert.equal(validateParameters(spacer, { innerDiameter: 0 }).innerDiameter, 0);
});

test('bracket hole clearance rejects decimal equality and still accepts positive margins', () => {
  const bracket = getTemplate('bracket');
  const boundary = { width: 14.4, thickness: 1.4, holeDiameter: 11.6 };
  rejectsValidation(() => validateParameters(bracket, boundary), 'holeDiameter');
  assert.equal(validateParameters(bracket, { ...boundary, width: 14.400001 }).width, 14.400001);
  rejectsValidation(() => validateParameters(bracket, { ...boundary, width: 14.399999 }), 'holeDiameter');
});

test('request objects and trimmed text respect exact size limits', () => {
  for (const body of [null, [], 'text', false]) rejectsValidation(() => validateObject(body, ['name']));
  rejectsValidation(() => validateObject({ extra: true }, ['name']));
  assert.equal(textField('  part  ', 'name', 120, { required: true }), 'part');
  assert.equal(textField('a'.repeat(120), 'name', 120, { required: true }).length, 120);
  assert.equal(textField('   ', 'description', 4000), '');
  for (const value of ['', '  ', null, 5, 'a'.repeat(121)]) {
    rejectsValidation(() => textField(value, 'name', 120, { required: true }));
  }
});

test('pagination accepts safe integer boundaries and rejects ambiguous query values', () => {
  assert.deepEqual(pagination(new URLSearchParams()), { limit: 50, offset: 0 });
  assert.deepEqual(pagination(new URLSearchParams('limit=100&offset=9007199254740991')), { limit: 100, offset: Number.MAX_SAFE_INTEGER });
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=9007199254740992', 'limit=1e1', 'limit=+1', 'offset=1.0', 'limit=', 'offset=1&offset=1', 'sort=name']) {
    assert.throws(() => pagination(new URLSearchParams(query)), { status: 400, code: 'INVALID_QUERY' }, query);
  }
});

function jsonStream(chunks, headers = {}) {
  const request = Readable.from(chunks);
  request.headers = { 'content-type': 'application/json; charset=utf-8', ...headers };
  return request;
}

test('JSON reading counts UTF-8 bytes across chunk boundaries and permits exactly 64 KiB', async () => {
  const bytes = Buffer.from(JSON.stringify({ text: 'é'.repeat(32762) }));
  assert.equal(bytes.length, 65535);
  const exact = Buffer.concat([bytes, Buffer.from(' ')]);
  const result = await readJson(jsonStream([exact.subarray(0, 10), exact.subarray(10, 11), exact.subarray(11)]));
  assert.equal(result.text, 'é'.repeat(32762));
  await assert.rejects(readJson(jsonStream([exact, Buffer.from(' ')])), { status: 413, code: 'BODY_TOO_LARGE' });
  await assert.rejects(readJson(jsonStream([], { 'content-length': '65537' })), { status: 413, code: 'BODY_TOO_LARGE' });
  await assert.rejects(readJson(jsonStream([Buffer.from('{')])), { status: 400, code: 'INVALID_JSON' });
  await assert.rejects(readJson(jsonStream([], { 'content-type': 'text/plain' })), { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
});

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const router = require('../routes/microsoftRoutes');
const { hash } = require('../config/microsoftClient');
const originals = { fetch: global.fetch, findOneAndUpdate: User.findOneAndUpdate, findByIdAndUpdate: User.findByIdAndUpdate };
afterEach(() => { global.fetch = originals.fetch; User.findOneAndUpdate = originals.findOneAndUpdate; User.findByIdAndUpdate = originals.findByIdAndUpdate; });
const callback = router.stack.find((layer) => layer.route?.path === '/callback').route.stack[0].handle;
function response() { return { target: null, clearCookie() {}, redirect(value) { this.target = value; } }; }
process.env.MICROSOFT_CLIENT_ID = 'test';
process.env.MICROSOFT_CLIENT_SECRET = 'test';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';

test('callback rejects a missing or mismatched browser binding before touching database', async () => {
  User.findOneAndUpdate = () => { throw new Error('must not query'); };
  const res = response();
  await callback({ query: { state: 'state', code: 'code' }, headers: { cookie: 'karmex_ms_oauth=other' } }, res);
  assert.equal(res.target, 'http://localhost:3000/?microsoft=error');
});
test('valid callback consumes state once, uses stored PKCE verifier, and persists tokens', async () => {
  let pending = true;
  let saves = 0;
  User.findOneAndUpdate = (filter, update, options) => {
    assert.equal(filter['microsoftOAuth.stateHash'], hash('state'));
    assert.ok(filter['microsoftOAuth.expiresAt'].$gt instanceof Date);
    assert.equal(update.$unset.microsoftOAuth, 1);
    assert.equal(options.new, false);
    const user = pending ? { _id: 'user', microsoftOAuth: { verifier: 'stored-verifier' } } : null;
    pending = false;
    return { select: async () => user };
  };
  User.findByIdAndUpdate = async (id, update) => { saves++; assert.equal(update.microsoftConnected, true); };
  global.fetch = async (url, options) => {
    assert.equal(options.body.get('code_verifier'), 'stored-verifier');
    return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) };
  };
  const req = { query: { state: 'state', code: 'code' }, headers: { cookie: 'karmex_ms_oauth=state' } };
  const first = response();
  await callback(req, first);
  assert.equal(first.target, 'http://localhost:3000/?microsoft=connected');
  const replay = response();
  await callback(req, replay);
  assert.equal(replay.target, 'http://localhost:3000/?microsoft=error');
  assert.equal(saves, 1);
});
test('cancelled consent does not exchange tokens', async () => {
  User.findOneAndUpdate = () => ({ select: async () => ({ _id: 'user' }) });
  global.fetch = () => { throw new Error('must not exchange'); };
  const res = response();
  await callback({ query: { state: 'state', error: 'access_denied' }, headers: { cookie: 'karmex_ms_oauth=state' } }, res);
  assert.equal(res.target, 'http://localhost:3000/?microsoft=denied');
});

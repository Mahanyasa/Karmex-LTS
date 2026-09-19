const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { getAuthUrl, exchangeToken, graphRequest } = require('../config/microsoftClient');
const { eventBody, syncReminder } = require('../utils/microsoftCalendar');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
process.env.MICROSOFT_CLIENT_ID = 'test-client';
process.env.MICROSOFT_CLIENT_SECRET = 'test-secret';
process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3001/api/microsoft/callback';
const user = { _id: 'user', microsoftConnected: true, microsoftTokens: { access_token: 'test-access', expiry_date: Date.now() + 3600000 } };
const todo = () => ({ _id: 'task', text: 'Review', priority: 'high', reminderDateTime: '2026-09-20T14:30:00+05:30', duration: 45, updatedAt: '2026-09-19T10:00:00Z' });
let saved;
const User = { findById: () => ({ select: async () => user }), updateOne: async () => ({ matchedCount: 1 }) };
const Todo = { findByIdAndUpdate: async (id, update) => { saved = update; } };
require.cache[require.resolve('../models/User')] = { exports: User };
require.cache[require.resolve('../models/Todo')] = { exports: Todo };

test('OAuth requests calendar-only access, offline renewal and PKCE', () => {
  const url = new URL(getAuthUrl('state', 'verifier'));
  assert.equal(url.hostname, 'login.microsoftonline.com');
  assert.equal(url.searchParams.get('state'), 'state');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('scope').includes('Calendars.ReadWrite'));
  assert.ok(url.searchParams.get('scope').includes('offline_access'));
  assert.ok(!url.toString().includes('test-secret'));
});
test('scheduled date, timezone, duration and completion are preserved', () => {
  const event = eventBody(todo());
  assert.equal(event.start.dateTime, '2026-09-20T09:00:00.000');
  assert.equal(event.end.dateTime, '2026-09-20T09:45:00.000');
  assert.equal(event.start.timeZone, 'UTC');
  assert.equal(eventBody({ ...todo(), completed: true }).isReminderOn, false);
  assert.throws(() => eventBody({ ...todo(), duration: -1 }));
  assert.throws(() => eventBody({ ...todo(), reminderDateTime: null }));
});
test('token exchange sends verifier and retains expiry without exposing provider error details', async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.body.get('code_verifier'), 'verifier');
    return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) };
  };
  const tokens = await exchangeToken({ grant_type: 'authorization_code', code: 'code', code_verifier: 'verifier' });
  assert.equal(tokens.refresh_token, 'r');
  assert.ok(tokens.expiry_date > Date.now());
  global.fetch = async () => ({ ok: false, json: async () => ({ error: 'invalid_grant', error_description: 'private detail' }) });
  await assert.rejects(exchangeToken({}), (error) => error.code === 'invalid_grant' && !error.message.includes('private detail'));
});
test('new event ID is saved and an existing event is patched instead of duplicated', async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.ok(JSON.parse(options.body).transactionId);
    return { ok: true, status: 201, json: async () => ({ id: 'event-id' }) };
  };
  await syncReminder('user', todo());
  assert.equal(saved.microsoftEventId, 'event-id');
  global.fetch = async (url, options) => {
    assert.equal(options.method, 'PATCH');
    assert.ok(url.endsWith('/me/events/event-id'));
    return { ok: true, status: 200, json: async () => ({ id: 'event-id' }) };
  };
  await syncReminder('user', { ...todo(), microsoftEventId: 'event-id' });
  assert.equal(saved.microsoftSyncError, null);
});
test('removed reminders delete Outlook events; already missing events are harmless', async () => {
  global.fetch = async (url, options) => {
    assert.equal(options.method, 'DELETE');
    return { ok: false, status: 404 };
  };
  await syncReminder('user', { ...todo(), reminderDateTime: null, microsoftEventId: 'event-id' });
  assert.equal(saved.microsoftEventId, null);
});
test('provider failures preserve task and record a visible sync error', async () => {
  global.fetch = async () => ({ ok: false, status: 503 });
  await syncReminder('user', todo());
  assert.match(saved.microsoftSyncError, /could not sync/);
});
test('expired token refresh is shared by concurrent requests', async () => {
  const old = user.microsoftTokens;
  user.microsoftTokens = { refresh_token: 'refresh', expiry_date: 0 };
  let refreshCount = 0;
  global.fetch = async (url) => {
    if (url.endsWith('/token')) { refreshCount++; return { ok: true, json: async () => ({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }) }; }
    return { ok: true, status: 204 };
  };
  try {
    await Promise.all([graphRequest(user, 'DELETE', '/me/events/a'), graphRequest(user, 'DELETE', '/me/events/b')]);
    assert.equal(refreshCount, 1);
  } finally { user.microsoftTokens = old; }
});

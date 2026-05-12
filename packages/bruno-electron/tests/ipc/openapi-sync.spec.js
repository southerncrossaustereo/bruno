jest.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  ipcMain: { handle: () => {}, on: () => {} }
}));
jest.mock('@usebruno/filestore', () => ({
  parseRequest: () => ({}),
  stringifyRequestViaWorker: () => '',
  parseCollection: () => ({}),
  stringifyCollection: () => '',
  stringifyFolder: () => ''
}), { virtual: true });
jest.mock('@usebruno/converters', () => ({ openApiToBruno: () => ({}) }), { virtual: true });
jest.mock('../../src/utils/filesystem', () => ({
  writeFile: () => {},
  sanitizeName: (n) => n,
  getCollectionFormat: () => 'bru',
  posixifyPath: (p) => p
}));
jest.mock('../../src/utils/collection', () => ({ getEnvVars: () => ({}) }));
jest.mock('../../src/store/process-env', () => ({ getProcessEnvVars: () => ({}) }));
jest.mock('../../src/ipc/network/cert-utils', () => ({ getCertsAndProxyConfig: async () => ({}) }));
jest.mock('../../src/ipc/network/axios-instance', () => ({ makeAxiosInstance: () => ({}) }));

const { mergeSpecIntoRequest, reconcileDefaultExample } = require('../../src/ipc/openapi-sync');

const makeExistingItem = ({ examples = [] } = {}) => ({
  uid: 'existing-item-uid',
  name: 'Existing',
  type: 'http-request',
  request: {
    url: 'https://old.example.com/v1/users',
    method: 'POST',
    headers: [{ uid: 'h1', name: 'X-Old', value: '1', enabled: true }],
    params: [],
    body: { mode: 'json', json: '{ "old": true }' },
    auth: { mode: 'none' },
    docs: '',
    script: { req: 'console.log("preserve me")' },
    tests: 'test("preserve")'
  },
  examples
});

const makeSpecItem = ({ withDefault = true, defaultBody = '{ "new": true }', extraExamples = [] } = {}) => {
  const examples = [...extraExamples];
  if (withDefault) {
    examples.push({
      uid: 'spec-default-uid',
      itemUid: 'spec-item-uid',
      name: 'Default',
      description: 'Canonical request body captured from the spec on import.',
      type: 'http-request',
      request: {
        url: 'https://new.example.com/v1/users',
        method: 'POST',
        headers: [],
        params: [],
        body: { mode: 'json', json: defaultBody }
      },
      response: { status: null, statusText: null, headers: [], body: { type: 'json', content: '' } }
    });
  }
  return {
    uid: 'spec-item-uid',
    name: 'Spec',
    type: 'http-request',
    request: {
      url: 'https://new.example.com/v1/users',
      method: 'POST',
      headers: [],
      params: [],
      body: { mode: 'json', json: defaultBody },
      auth: { mode: 'none' },
      docs: ''
    },
    examples
  };
};

describe('reconcileDefaultExample', () => {
  test('appends a Default example when the existing item has none', () => {
    const spec = makeSpecItem();
    const result = reconcileDefaultExample([], spec.examples, 'existing-item-uid');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Default');
    expect(result[0].itemUid).toBe('existing-item-uid');
    expect(result[0].request.body.json).toBe('{ "new": true }');
  });

  test('replaces an existing Default in place, preserving its uid', () => {
    const oldDefault = {
      uid: 'preserved-uid',
      itemUid: 'existing-item-uid',
      name: 'Default',
      request: { body: { mode: 'json', json: '{ "old": true }' } }
    };
    const spec = makeSpecItem({ defaultBody: '{ "new": true }' });
    const result = reconcileDefaultExample([oldDefault], spec.examples, 'existing-item-uid');
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('preserved-uid');
    expect(result[0].itemUid).toBe('existing-item-uid');
    expect(result[0].request.body.json).toBe('{ "new": true }');
  });

  test('leaves user-named examples untouched while replacing Default', () => {
    const userExample = {
      uid: 'user-uid',
      itemUid: 'existing-item-uid',
      name: 'My custom case',
      request: { body: { mode: 'json', json: '{ "mine": true }' } }
    };
    const oldDefault = {
      uid: 'preserved-uid',
      itemUid: 'existing-item-uid',
      name: 'Default',
      request: { body: { mode: 'json', json: '{ "old": true }' } }
    };
    const spec = makeSpecItem({ defaultBody: '{ "new": true }' });
    const result = reconcileDefaultExample([userExample, oldDefault], spec.examples, 'existing-item-uid');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(userExample);
    expect(result[1].uid).toBe('preserved-uid');
    expect(result[1].request.body.json).toBe('{ "new": true }');
  });

  test('leaves examples untouched when the spec has no Default (e.g. body removed)', () => {
    const oldDefault = {
      uid: 'preserved-uid',
      itemUid: 'existing-item-uid',
      name: 'Default',
      request: { body: { mode: 'json', json: '{ "old": true }' } }
    };
    const spec = makeSpecItem({ withDefault: false });
    const result = reconcileDefaultExample([oldDefault], spec.examples, 'existing-item-uid');
    expect(result).toEqual([oldDefault]);
  });
});

describe('mergeSpecIntoRequest — Default example handling', () => {
  test('sync mode replaces stale Default example alongside body update', () => {
    const existing = makeExistingItem({
      examples: [{
        uid: 'preserved-uid',
        itemUid: 'existing-item-uid',
        name: 'Default',
        request: { body: { mode: 'json', json: '{ "old": true }' } }
      }]
    });
    const spec = makeSpecItem({ defaultBody: '{ "new": true }' });

    const merged = mergeSpecIntoRequest(existing, spec);

    // Body updated from spec
    expect(merged.request.body.json).toBe('{ "new": true }');
    // Scripts/tests preserved
    expect(merged.request.script.req).toBe('console.log("preserve me")');
    expect(merged.request.tests).toBe('test("preserve")');
    // Default example refreshed but uid preserved
    expect(merged.examples).toHaveLength(1);
    expect(merged.examples[0].uid).toBe('preserved-uid');
    expect(merged.examples[0].request.body.json).toBe('{ "new": true }');
  });

  test('fullReset mode also refreshes the Default example', () => {
    const existing = makeExistingItem({
      examples: [{
        uid: 'preserved-uid',
        itemUid: 'existing-item-uid',
        name: 'Default',
        request: { body: { mode: 'json', json: '{ "old": true }' } }
      }]
    });
    const spec = makeSpecItem({ defaultBody: '{ "new": true }' });

    const merged = mergeSpecIntoRequest(existing, spec, { fullReset: true });

    expect(merged.examples).toHaveLength(1);
    expect(merged.examples[0].uid).toBe('preserved-uid');
    expect(merged.examples[0].request.body.json).toBe('{ "new": true }');
  });

  test('appends Default example when existing item has no examples array', () => {
    const existing = makeExistingItem();
    delete existing.examples;
    const spec = makeSpecItem({ defaultBody: '{ "new": true }' });

    const merged = mergeSpecIntoRequest(existing, spec);

    expect(merged.examples).toHaveLength(1);
    expect(merged.examples[0].name).toBe('Default');
    expect(merged.examples[0].itemUid).toBe('existing-item-uid');
  });

  test('does not touch examples when spec produces no Default (operation lost its body)', () => {
    const userExample = {
      uid: 'user-uid',
      name: 'My custom case',
      request: { body: { mode: 'json', json: '{ "mine": true }' } }
    };
    const existing = makeExistingItem({ examples: [userExample] });
    const spec = makeSpecItem({ withDefault: false });

    const merged = mergeSpecIntoRequest(existing, spec);

    expect(merged.examples).toEqual([userExample]);
  });
});

const stringifyHttpRequest = require('../items/stringifyHttpRequest').default;
const parseHttpRequest = require('../items/parseHttpRequest').default;
const { parseYml } = require('../utils');

// Round-trips an HTTP item through stringify → yml → parse and asserts
// examples survive intact (all fields the picker/editor will read back).
describe('yml HTTP example round-trip', () => {
  const buildItem = () => ({
    uid: 'item-uid',
    type: 'http-request',
    name: 'Create Order',
    seq: 1,
    request: {
      url: 'https://api.example.com/orders',
      method: 'POST',
      headers: [{ uid: 'h1', name: 'Content-Type', value: 'application/json', enabled: true }],
      params: [],
      body: {
        mode: 'json',
        json: '{"foo":"working-value"}',
        text: null, xml: null, sparql: null,
        formUrlEncoded: [], multipartForm: [], graphql: null, file: []
      },
      script: { req: null, res: null },
      vars: { req: [], res: [] },
      assertions: [],
      tests: null,
      docs: null,
      auth: { mode: 'none' }
    },
    examples: [
      {
        uid: 'ex-1',
        itemUid: 'item-uid',
        name: 'Default',
        description: 'Canonical body from spec',
        type: 'http-request',
        request: {
          url: 'https://api.example.com/orders',
          method: 'POST',
          headers: [{ uid: 'eh1', name: 'Content-Type', value: 'application/json', enabled: true }],
          params: [],
          body: {
            mode: 'json',
            json: '{"foo":"default"}',
            text: null, xml: null, sparql: null,
            formUrlEncoded: [], multipartForm: [], graphql: null, file: []
          }
        },
        response: {
          status: 201,
          statusText: 'Created',
          headers: [],
          body: { type: 'json', content: '{"id":"abc"}' }
        }
      }
    ],
    settings: null
  });

  test('examples survive stringify → parse with names, descriptions and bodies', () => {
    const yml = stringifyHttpRequest(buildItem());
    const parsed = parseHttpRequest(parseYml(yml));

    expect(parsed.examples).toHaveLength(1);
    const ex = parsed.examples[0];
    expect(ex.name).toBe('Default');
    expect(ex.description).toBe('Canonical body from spec');
    expect(ex.request.method).toBe('POST');
    expect(ex.request.url).toBe('https://api.example.com/orders');
    expect(ex.request.body.mode).toBe('json');
    expect(ex.request.body.json).toBe('{"foo":"default"}');
    expect(ex.response.status).toBe(201);
    expect(ex.response.statusText).toBe('Created');
    expect(ex.response.body.content).toBe('{"id":"abc"}');
  });

  test('item with no examples produces yml with no examples block', () => {
    const item = buildItem();
    item.examples = [];
    const yml = stringifyHttpRequest(item);
    expect(yml).not.toMatch(/examples:/);
    const parsed = parseHttpRequest(parseYml(yml));
    expect(parsed.examples).toEqual([]);
  });
});

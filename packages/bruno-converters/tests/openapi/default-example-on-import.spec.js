import { describe, it, expect } from '@jest/globals';
import openApiToBruno from '../../src/openapi/openapi-to-bruno';
import swagger2ToBruno from '../../src/openapi/swagger2-to-bruno';

// The "Default" example carries the canonical request body straight from the
// spec (no response payload), so users always have a clean target for the
// "Load into Request" UI action — even on endpoints with multiple per-response
// examples that all clone the same request body.

describe('OpenAPI 3 import: Default example', () => {
  const spec = `openapi: 3.0.0
info:
  title: T
  version: '1'
paths:
  /pets:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string, example: Rex }
                tag: { type: string, example: dog }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: integer, example: 1 }
servers:
  - url: 'https://api.example.com'
`;

  const collection = openApiToBruno(spec);
  const req = collection.items[0];

  it('appends a Default example after per-response examples', () => {
    expect(req.examples).toHaveLength(2);
    expect(req.examples[0].name).toBe('201 Response');
    expect(req.examples[1].name).toBe('Default');
  });

  it('Default example has null status (no response payload) and the spec request body', () => {
    const def = req.examples.find((e) => e.name === 'Default');
    expect(def.response.status).toBeNull();
    expect(def.response.statusText).toBeNull();
    expect(def.request.body.mode).toBe('json');
    expect(JSON.parse(def.request.body.json)).toEqual({ name: 'Rex', tag: 'dog' });
  });

  it('does not add a Default example when the operation has no request body', () => {
    const noBodySpec = `openapi: 3.0.0
info: { title: T, version: '1' }
paths:
  /pets:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: integer, example: 1 }
servers:
  - url: 'https://api.example.com'
`;
    const c = openApiToBruno(noBodySpec);
    const r = c.items[0];
    expect(r.examples.find((e) => e.name === 'Default')).toBeUndefined();
  });
});

describe('Swagger 2 import: Default example', () => {
  const findRequest = (collection, name) => {
    const walk = (items) => {
      for (const it of items || []) {
        if (it.name === name && it.type === 'http-request') return it;
        const found = walk(it.items);
        if (found) return found;
      }
      return null;
    };
    return walk(collection.items);
  };

  const spec = {
    swagger: '2.0',
    info: { title: 'T', version: '1' },
    host: 'api.example.com',
    basePath: '/',
    paths: {
      '/pets': {
        post: {
          summary: 'Create pet',
          consumes: ['application/json'],
          produces: ['application/json'],
          parameters: [{
            in: 'body',
            name: 'body',
            schema: { type: 'object', properties: { name: { type: 'string', example: 'Rex' } } }
          }],
          responses: {
            201: {
              description: 'Created',
              schema: { type: 'object', properties: { id: { type: 'integer', example: 1 } } }
            }
          }
        }
      }
    }
  };

  it('appends a Default example after per-response examples', () => {
    const collection = swagger2ToBruno(spec);
    const req = findRequest(collection, 'Create pet');
    expect(req).toBeDefined();
    expect(req.examples).toHaveLength(2);
    expect(req.examples[req.examples.length - 1].name).toBe('Default');
  });

  it('skips the Default example when there is no body parameter', () => {
    const noBodySpec = {
      swagger: '2.0',
      info: { title: 'T', version: '1' },
      host: 'api.example.com',
      basePath: '/',
      paths: {
        '/pets': {
          get: {
            summary: 'List pets',
            produces: ['application/json'],
            responses: { 200: { description: 'ok', schema: { type: 'object' } } }
          }
        }
      }
    };
    const collection = swagger2ToBruno(noBodySpec);
    const req = findRequest(collection, 'List pets');
    expect(req).toBeDefined();
    expect((req.examples || []).find((e) => e.name === 'Default')).toBeUndefined();
  });
});

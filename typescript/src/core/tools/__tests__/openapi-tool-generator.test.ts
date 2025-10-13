/**
 * Tests for OpenAPI Tool Generator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { OpenAPIToolGenerator, OpenAPIAuthConfig } from '../openapi-tool-generator.js';
import { OpenAPISpec } from '../openapi-types.js';
import { AITool } from '../base-tool.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('OpenAPIToolGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fromSpec', () => {
    it('should generate tools from a simple OpenAPI 3.0 spec', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List all users',
              parameters: [],
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('listUsers');
      expect(tools[0].description).toBe('List all users');
    });

    it('should generate tools from OpenAPI 3.1 spec', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.1.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/posts': {
            post: {
              operationId: 'createPost',
              summary: 'Create a post',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        content: { type: 'string' },
                      },
                      required: ['title'],
                    },
                  },
                },
              },
              responses: {
                '201': { description: 'Created' },
              },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('createPost');
    });

    it('should throw error for unsupported OpenAPI version', async () => {
      const spec = {
        openapi: '2.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      } as unknown as OpenAPISpec;

      await expect(OpenAPIToolGenerator.fromSpec(spec)).rejects.toThrow('Unsupported OpenAPI version');
    });

    it('should generate operation name from path and method when operationId is missing', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{id}/posts': {
            get: {
              summary: 'Get user posts',
              parameters: [],
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get_users_id_posts');
    });

    it('should filter operations by tags', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              tags: ['users'],
              responses: { '200': { description: 'Success' } },
            },
          },
          '/posts': {
            get: {
              operationId: 'listPosts',
              tags: ['posts'],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec, { tags: ['users'] });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('listUsers');
    });

    it('should filter operations by operation IDs', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
          },
          '/posts': {
            get: {
              operationId: 'listPosts',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec, { operationIds: ['listPosts'] });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('listPosts');
    });

    it('should handle multiple HTTP methods on same path', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
            post: {
              operationId: 'createUser',
              responses: { '201': { description: 'Created' } },
            },
            delete: {
              operationId: 'deleteUsers',
              responses: { '204': { description: 'No Content' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);

      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toContain('listUsers');
      expect(tools.map((t) => t.name)).toContain('createUser');
      expect(tools.map((t) => t.name)).toContain('deleteUsers');
    });
  });

  describe('parameter extraction and validation', () => {
    it('should extract path parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      // The schema should require userId
      expect(() => tool.schema.parse({})).toThrow();
      expect(tool.schema.parse({ userId: '123' })).toEqual({ userId: '123' });
    });

    it('should extract query parameters with optional flag', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  required: false,
                  schema: { type: 'integer', default: 10 },
                },
                {
                  name: 'offset',
                  in: 'query',
                  required: false,
                  schema: { type: 'integer' },
                },
              ],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      // Should accept no parameters
      expect(tool.schema.parse({})).toBeDefined();

      // Should accept parameters
      expect(tool.schema.parse({ limit: 20, offset: 10 })).toEqual({ limit: 20, offset: 10 });
    });

    it('should extract header parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/data': {
            get: {
              operationId: 'getData',
              parameters: [
                {
                  name: 'X-Custom-Header',
                  in: 'header',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      expect(() => tool.schema.parse({})).toThrow();
      expect(tool.schema.parse({ 'X-Custom-Header': 'value' })).toBeDefined();
    });

    it('should extract request body parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        age: { type: 'integer' },
                      },
                      required: ['name', 'email'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      // Should require name and email
      expect(() => tool.schema.parse({})).toThrow();
      expect(() => tool.schema.parse({ name: 'John' })).toThrow();

      // Should accept valid data
      const result = tool.schema.parse({ name: 'John', email: 'john@example.com', age: 30 });
      expect(result).toEqual({ name: 'John', email: 'john@example.com', age: 30 });
    });

    it('should handle nested object parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            address: {
                              type: 'object',
                              properties: {
                                street: { type: 'string' },
                                city: { type: 'string' },
                              },
                              required: ['city'],
                            },
                          },
                          required: ['name'],
                        },
                      },
                      required: ['user'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      // Should validate nested structure
      const result = tool.schema.parse({
        user: {
          name: 'John',
          address: {
            street: '123 Main St',
            city: 'Anytown',
          },
        },
      });

      expect(result).toBeDefined();
    });

    it('should handle array parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/batch': {
            post: {
              operationId: 'batchCreate',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string' },
                              value: { type: 'number' },
                            },
                            required: ['name'],
                          },
                          minItems: 1,
                          maxItems: 10,
                        },
                      },
                      required: ['items'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      // Should validate array constraints
      expect(() => tool.schema.parse({ items: [] })).toThrow(); // minItems
      expect(() =>
        tool.schema.parse({ items: Array(11).fill({ name: 'test' }) })
      ).toThrow(); // maxItems

      const result = tool.schema.parse({ items: [{ name: 'test', value: 42 }] });
      expect(result).toBeDefined();
    });
  });

  describe('HTTP execution', () => {
    beforeEach(() => {
      // Mock axios.create to return a mock instance
      const mockInstance = {
        request: vi.fn(),
      };
      mockedAxios.create.mockReturnValue(mockInstance as any);
    });

    it('should execute GET request with path parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.request.mockResolvedValue({ data: { id: '123', name: 'John' } });

      const result = await tool.execute({ userId: '123' });

      expect(mockInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/users/123',
        headers: {},
        data: undefined,
      });
      expect(result).toEqual({ id: '123', name: 'John' });
    });

    it('should execute GET request with query parameters', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'integer' },
                },
                {
                  name: 'offset',
                  in: 'query',
                  schema: { type: 'integer' },
                },
              ],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.request.mockResolvedValue({ data: [] });

      await tool.execute({ limit: 10, offset: 20 });

      expect(mockInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/users?limit=10&offset=20',
        headers: {},
        data: undefined,
      });
    });

    it('should execute POST request with request body', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                      required: ['name'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.request.mockResolvedValue({ data: { id: '123', name: 'John' } });

      await tool.execute({ name: 'John', email: 'john@example.com' });

      expect(mockInstance.request).toHaveBeenCalledWith({
        method: 'POST',
        url: '/users',
        headers: {},
        data: { name: 'John', email: 'john@example.com' },
      });
    });

    it('should handle HTTP errors', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      const error: any = new Error('Network error');
      error.isAxiosError = true;
      error.response = {
        status: 404,
        statusText: 'Not Found',
        data: { message: 'Resource not found' },
      };

      // Mock axios.isAxiosError to return true for our error
      const originalIsAxiosError = axios.isAxiosError;
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      mockInstance.request.mockRejectedValue(error);

      await expect(tool.execute({})).rejects.toThrow('HTTP 404: Not Found');

      // Restore original
      vi.spyOn(axios, 'isAxiosError').mockImplementation(originalIsAxiosError);
    });
  });

  describe('authentication', () => {
    beforeEach(() => {
      const mockInstance = {
        request: vi.fn().mockResolvedValue({ data: {} }),
      };
      mockedAxios.create.mockReturnValue(mockInstance as any);
    });

    it('should add Bearer token authentication', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const auth: OpenAPIAuthConfig = {
        type: 'bearer',
        token: 'secret-token',
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec, { auth });
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      await tool.execute({});

      expect(mockInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token',
          }),
        })
      );
    });

    it('should add Basic authentication', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const auth: OpenAPIAuthConfig = {
        type: 'basic',
        username: 'user',
        password: 'pass',
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec, { auth });
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      await tool.execute({});

      const expectedAuth = Buffer.from('user:pass').toString('base64');
      expect(mockInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedAuth}`,
          }),
        })
      );
    });

    it('should add API key authentication to header', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const auth: OpenAPIAuthConfig = {
        type: 'apiKey',
        apiKey: 'my-api-key',
        in: 'header',
        name: 'X-API-Key',
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec, { auth });
      const tool = tools[0];

      const mockInstance = mockedAxios.create.mock.results[0].value;
      await tool.execute({});

      expect(mockInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'my-api-key',
          }),
        })
      );
    });
  });

  describe('fromUrl', () => {
    it('should fetch and parse OpenAPI spec from URL', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      mockedAxios.get.mockResolvedValue({ data: spec });

      const tools = await OpenAPIToolGenerator.fromUrl('https://api.example.com/openapi.json');

      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/openapi.json');
      expect(tools).toHaveLength(1);
    });
  });

  describe('getSecuritySchemes', () => {
    it('should extract security schemes from spec', () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
            apiKey: {
              type: 'apiKey',
              name: 'X-API-Key',
              in: 'header',
            },
          },
        },
      };

      const schemes = OpenAPIToolGenerator.getSecuritySchemes(spec);

      expect(schemes).toHaveProperty('bearerAuth');
      expect(schemes).toHaveProperty('apiKey');
      expect(schemes.bearerAuth.type).toBe('http');
      expect(schemes.apiKey.type).toBe('apiKey');
    });
  });

  describe('createAuthFromScheme', () => {
    it('should create bearer auth config', () => {
      const scheme = {
        type: 'http' as const,
        scheme: 'bearer',
      };

      const auth = OpenAPIToolGenerator.createAuthFromScheme(scheme, 'my-token');

      expect(auth.type).toBe('bearer');
      expect(auth.token).toBe('my-token');
    });

    it('should create basic auth config', () => {
      const scheme = {
        type: 'http' as const,
        scheme: 'basic',
      };

      const auth = OpenAPIToolGenerator.createAuthFromScheme(scheme, {
        username: 'user',
        password: 'pass',
      });

      expect(auth.type).toBe('basic');
      expect(auth.username).toBe('user');
      expect(auth.password).toBe('pass');
    });

    it('should create API key auth config', () => {
      const scheme = {
        type: 'apiKey' as const,
        name: 'X-API-Key',
        in: 'header' as const,
      };

      const auth = OpenAPIToolGenerator.createAuthFromScheme(scheme, 'my-key');

      expect(auth.type).toBe('apiKey');
      expect(auth.apiKey).toBe('my-key');
      expect(auth.in).toBe('header');
      expect(auth.name).toBe('X-API-Key');
    });
  });

  describe('schema conversion', () => {
    it('should convert string schema with constraints', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            post: {
              operationId: 'test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        email: { type: 'string', format: 'email' },
                        url: { type: 'string', format: 'url' },
                        uuid: { type: 'string', format: 'uuid' },
                        pattern: { type: 'string', pattern: '^[A-Z]+$' },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      // Email validation
      expect(() => tool.schema.parse({ email: 'invalid' })).toThrow();
      expect(tool.schema.parse({ email: 'test@example.com' })).toBeDefined();

      // URL validation
      expect(() => tool.schema.parse({ url: 'not-a-url' })).toThrow();
      expect(tool.schema.parse({ url: 'https://example.com' })).toBeDefined();

      // Pattern validation
      expect(() => tool.schema.parse({ pattern: 'abc' })).toThrow();
      expect(tool.schema.parse({ pattern: 'ABC' })).toBeDefined();
    });

    it('should convert number schema with min/max', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            post: {
              operationId: 'test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        age: { type: 'integer', minimum: 0, maximum: 120 },
                        score: { type: 'number', minimum: 0, maximum: 100 },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      expect(() => tool.schema.parse({ age: -1 })).toThrow();
      expect(() => tool.schema.parse({ age: 121 })).toThrow();
      expect(tool.schema.parse({ age: 25 })).toBeDefined();
    });

    it('should handle enum schemas', async () => {
      const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: {
          '/test': {
            post: {
              operationId: 'test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const tools = await OpenAPIToolGenerator.fromSpec(spec);
      const tool = tools[0];

      expect(() => tool.schema.parse({ status: 'invalid' })).toThrow();
      expect(tool.schema.parse({ status: 'active' })).toBeDefined();
    });
  });
});

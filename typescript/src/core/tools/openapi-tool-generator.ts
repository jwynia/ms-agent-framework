/**
 * OpenAPI Tool Generator.
 *
 * This module provides functionality to parse OpenAPI 3.x specifications and
 * automatically generate AITool instances for each operation defined in the spec.
 *
 * @module openapi-tool-generator
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { AITool, FunctionTool } from './base-tool.js';
import {
  OpenAPISpec,
  Operation,
  Parameter,
  Schema,
  Reference,
  RequestBody,
  isReference,
  HTTP_METHODS,
  HttpMethod,
  SecurityScheme,
} from './openapi-types.js';

/**
 * Authentication configuration for OpenAPI tool execution.
 */
export interface OpenAPIAuthConfig {
  /** Type of authentication */
  type: 'apiKey' | 'bearer' | 'basic' | 'oauth2';
  /** API key value (for apiKey type) */
  apiKey?: string;
  /** Location of API key (for apiKey type) */
  in?: 'header' | 'query';
  /** Name of the header or query parameter (for apiKey type) */
  name?: string;
  /** Bearer token (for bearer type) */
  token?: string;
  /** Username (for basic type) */
  username?: string;
  /** Password (for basic type) */
  password?: string;
  /** OAuth2 access token (for oauth2 type) */
  accessToken?: string;
}

/**
 * Options for OpenAPI tool generation.
 */
export interface OpenAPIToolOptions {
  /** Authentication configuration */
  auth?: OpenAPIAuthConfig;
  /** Base URL override (overrides servers in spec) */
  baseUrl?: string;
  /** Default headers to include in all requests */
  headers?: Record<string, string>;
  /** Axios configuration */
  axiosConfig?: AxiosRequestConfig;
  /** Filter operations by tag */
  tags?: string[];
  /** Filter operations by operation ID */
  operationIds?: string[];
}

/**
 * OpenAPI Tool Generator.
 *
 * Parses OpenAPI 3.x specifications and generates AITool instances for each operation.
 *
 * @example
 * ```typescript
 * import { OpenAPIToolGenerator } from '@microsoft/agent-framework-ts';
 *
 * // From URL
 * const tools = await OpenAPIToolGenerator.fromUrl('https://api.example.com/openapi.json', {
 *   auth: { type: 'bearer', token: 'secret-token' }
 * });
 *
 * // From file
 * const tools = await OpenAPIToolGenerator.fromFile('./openapi.yaml');
 *
 * // From spec object
 * const spec = { openapi: '3.1.0', ... };
 * const tools = await OpenAPIToolGenerator.fromSpec(spec);
 * ```
 */
export class OpenAPIToolGenerator {
  /**
   * Generate AITool instances from an OpenAPI specification URL.
   *
   * @param url - URL to the OpenAPI specification (JSON or YAML)
   * @param options - Tool generation options
   * @returns Array of generated AITool instances
   */
  static async fromUrl(url: string, options?: OpenAPIToolOptions): Promise<AITool[]> {
    const response = await axios.get(url);
    const spec = this.parseSpec(response.data, url.endsWith('.yaml') || url.endsWith('.yml'));
    return this.fromSpec(spec, options);
  }

  /**
   * Generate AITool instances from an OpenAPI specification file.
   *
   * @param path - Path to the OpenAPI specification file (JSON or YAML)
   * @param options - Tool generation options
   * @returns Array of generated AITool instances
   */
  static async fromFile(path: string, options?: OpenAPIToolOptions): Promise<AITool[]> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    const spec = this.parseSpec(content, path.endsWith('.yaml') || path.endsWith('.yml'));
    return this.fromSpec(spec, options);
  }

  /**
   * Generate AITool instances from an OpenAPI specification object or string.
   *
   * @param spec - OpenAPI specification object or JSON/YAML string
   * @param options - Tool generation options
   * @returns Array of generated AITool instances
   */
  static async fromSpec(spec: OpenAPISpec | string, options?: OpenAPIToolOptions): Promise<AITool[]> {
    const parsedSpec = typeof spec === 'string' ? this.parseSpec(spec) : spec;

    // Validate OpenAPI version
    if (!parsedSpec.openapi || !parsedSpec.openapi.startsWith('3.')) {
      throw new Error(`Unsupported OpenAPI version: ${parsedSpec.openapi}. Only OpenAPI 3.x is supported.`);
    }

    const tools: AITool[] = [];

    // Iterate through paths and operations
    for (const [path, pathItem] of Object.entries(parsedSpec.paths)) {
      if (!pathItem) continue;

      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (!operation) continue;

        // Filter by tags if specified
        if (options?.tags && operation.tags) {
          if (!operation.tags.some((tag) => options.tags!.includes(tag))) {
            continue;
          }
        }

        // Filter by operation IDs if specified
        if (options?.operationIds && operation.operationId) {
          if (!options.operationIds.includes(operation.operationId)) {
            continue;
          }
        }

        try {
          const tool = this.createToolFromOperation(parsedSpec, path, method, operation, options);
          tools.push(tool);
        } catch (error) {
          console.warn(`Failed to generate tool for ${method.toUpperCase()} ${path}:`, error);
        }
      }
    }

    return tools;
  }

  /**
   * Parse an OpenAPI specification from a string or object.
   *
   * @param content - OpenAPI specification as JSON/YAML string or object
   * @param isYaml - Whether the content is YAML (default: auto-detect)
   * @returns Parsed OpenAPI specification
   */
  private static parseSpec(content: string | object, isYaml?: boolean): OpenAPISpec {
    if (typeof content === 'object') {
      return content as OpenAPISpec;
    }

    try {
      // Try JSON first
      if (isYaml === false || (!isYaml && content.trim().startsWith('{'))) {
        return JSON.parse(content) as OpenAPISpec;
      }
    } catch {
      // Fall through to YAML parsing
    }

    // Try YAML
    try {
      return yaml.load(content) as OpenAPISpec;
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI specification: ${error}`);
    }
  }

  /**
   * Create an AITool from an OpenAPI operation.
   *
   * @param spec - Complete OpenAPI specification
   * @param path - Path of the operation
   * @param method - HTTP method
   * @param operation - Operation definition
   * @param options - Tool generation options
   * @returns Generated AITool instance
   */
  private static createToolFromOperation(
    spec: OpenAPISpec,
    path: string,
    method: HttpMethod,
    operation: Operation,
    options?: OpenAPIToolOptions
  ): AITool {
    // Generate tool name from operation ID or path+method
    const name = operation.operationId || this.generateOperationName(path, method);

    // Use operation summary or description
    const description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;

    // Extract all parameters (path, query, header) and request body
    const parameters = this.extractParameters(spec, operation);
    const schema = this.createZodSchema(parameters);

    // Create HTTP client
    const baseUrl = options?.baseUrl || (spec.servers && spec.servers[0]?.url) || '';
    const httpClient = this.createHttpClient(baseUrl, options);

    // Create execution function
    const executionFunc = async (params: unknown): Promise<unknown> => {
      const validated = schema.parse(params) as Record<string, unknown>;

      // Build URL with path parameters
      let url = path;
      const pathParams = parameters.filter((p) => p.in === 'path');
      for (const param of pathParams) {
        url = url.replace(`{${param.name}}`, encodeURIComponent(String(validated[param.name])));
      }

      // Build query parameters
      const queryParams = parameters.filter((p) => p.in === 'query');
      const query = new URLSearchParams();
      for (const param of queryParams) {
        if (validated[param.name] !== undefined) {
          query.append(param.name, String(validated[param.name]));
        }
      }
      if (query.toString()) {
        url += `?${query.toString()}`;
      }

      // Build headers
      const headers: Record<string, string> = { ...options?.headers };
      const headerParams = parameters.filter((p) => p.in === 'header');
      for (const param of headerParams) {
        if (validated[param.name] !== undefined) {
          headers[param.name] = String(validated[param.name]);
        }
      }

      // Add authentication headers
      this.addAuthHeaders(headers, options?.auth);

      // Build request body
      let body: unknown = undefined;
      const bodyParams = parameters.filter((p) => (p as { in: string }).in === 'body');
      if (bodyParams.length > 0) {
        body = {};
        for (const param of bodyParams) {
          if (validated[param.name] !== undefined) {
            (body as Record<string, unknown>)[param.name] = validated[param.name];
          }
        }
      }

      // Execute HTTP request
      try {
        const response = await httpClient.request({
          method: method.toUpperCase(),
          url,
          headers,
          data: body,
        });

        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          const statusText = error.response.statusText;
          const message = error.response.data?.message || error.message;
          throw new Error(`HTTP ${status}: ${statusText} - ${message}`);
        }
        throw error;
      }
    };

    return new FunctionTool({
      name,
      description,
      schema,
      fn: executionFunc,
      metadata: {
        openapi: {
          path,
          method,
          operationId: operation.operationId,
        },
      },
    });
  }

  /**
   * Extract parameters from an operation.
   *
   * @param spec - Complete OpenAPI specification
   * @param operation - Operation definition
   * @returns Array of normalized parameter definitions
   */
  private static extractParameters(
    spec: OpenAPISpec,
    operation: Operation
  ): Array<Parameter & { in: string }> {
    const params: Array<Parameter & { in: string }> = [];

    // Extract operation parameters
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (isReference(param)) {
          const resolved = this.resolveReference<Parameter>(spec, param.$ref);
          if (resolved && resolved.in !== 'cookie') {
            params.push(resolved as Parameter & { in: string });
          }
        } else if (param.in !== 'cookie') {
          params.push(param as Parameter & { in: string });
        }
      }
    }

    // Extract request body parameters
    if (operation.requestBody) {
      const requestBody = isReference(operation.requestBody)
        ? this.resolveReference<RequestBody>(spec, operation.requestBody.$ref)
        : operation.requestBody;

      if (requestBody && requestBody.content) {
        // Try to get JSON content first
        const jsonContent = requestBody.content['application/json'];
        if (jsonContent && jsonContent.schema) {
          const schema = isReference(jsonContent.schema)
            ? this.resolveReference<Schema>(spec, jsonContent.schema.$ref)
            : jsonContent.schema;

          if (schema && schema.properties) {
            for (const [name, propSchema] of Object.entries(schema.properties)) {
              const resolved = isReference(propSchema) ? this.resolveReference<Schema>(spec, propSchema.$ref) : (propSchema as Schema);
              params.push({
                name,
                in: 'body' as any,
                required: schema.required?.includes(name) ?? false,
                schema: resolved,
                description: resolved?.description || '',
              } as Parameter & { in: string });
            }
          }
        }
      }
    }

    return params;
  }

  /**
   * Create a Zod schema from parameters.
   *
   * @param parameters - Array of parameter definitions
   * @returns Zod schema for validation
   */
  private static createZodSchema(parameters: Array<Parameter & { in: string }>): z.ZodSchema {
    const schemaFields: Record<string, z.ZodTypeAny> = {};

    for (const param of parameters) {
      const zodType = this.schemaToZod(param.schema || { type: 'string' });
      schemaFields[param.name] = param.required ? zodType : zodType.optional();
    }

    return z.object(schemaFields);
  }

  /**
   * Convert an OpenAPI schema to a Zod schema.
   *
   * @param schema - OpenAPI schema definition
   * @returns Zod schema
   */
  private static schemaToZod(schema: Schema | Reference | undefined): z.ZodTypeAny {
    if (!schema) {
      return z.unknown();
    }

    if (isReference(schema)) {
      // References should be resolved before calling this method
      return z.unknown();
    }

    // Handle type
    switch (schema.type) {
      case 'string':
        let stringSchema = z.string();
        if (schema.minLength !== undefined) stringSchema = stringSchema.min(schema.minLength);
        if (schema.maxLength !== undefined) stringSchema = stringSchema.max(schema.maxLength);
        if (schema.pattern) stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        if (schema.enum) return z.enum(schema.enum as [string, ...string[]]);
        if (schema.format === 'email') return z.string().email();
        if (schema.format === 'uri' || schema.format === 'url') return z.string().url();
        if (schema.format === 'uuid') return z.string().uuid();
        return stringSchema;

      case 'number':
      case 'integer': {
        let numberSchema = schema.type === 'integer' ? z.number().int() : z.number();
        if (schema.minimum !== undefined) {
          numberSchema = numberSchema.min(schema.minimum);
        }
        if (schema.maximum !== undefined) {
          numberSchema = numberSchema.max(schema.maximum);
        }
        if (schema.default !== undefined) {
          return numberSchema.default(schema.default as number);
        }
        return numberSchema;
      }

      case 'boolean':
        return schema.default !== undefined ? z.boolean().default(schema.default as boolean) : z.boolean();

      case 'array':
        const itemSchema = this.schemaToZod(schema.items);
        let arraySchema = z.array(itemSchema);
        if (schema.minItems !== undefined) arraySchema = arraySchema.min(schema.minItems);
        if (schema.maxItems !== undefined) arraySchema = arraySchema.max(schema.maxItems);
        return arraySchema;

      case 'object':
        if (schema.properties) {
          const objectFields: Record<string, z.ZodTypeAny> = {};
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            const zodType = this.schemaToZod(propSchema);
            objectFields[key] = schema.required?.includes(key) ? zodType : zodType.optional();
          }
          return z.object(objectFields);
        }
        return z.record(z.unknown());

      case 'null':
        return z.null();

      default:
        // Handle anyOf, oneOf, allOf
        if (schema.anyOf) {
          const schemas = schema.anyOf.map((s) => this.schemaToZod(s));
          return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
        }
        if (schema.oneOf) {
          const schemas = schema.oneOf.map((s) => this.schemaToZod(s));
          return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
        }
        return z.unknown();
    }
  }

  /**
   * Resolve a $ref reference in the OpenAPI spec.
   *
   * @param spec - Complete OpenAPI specification
   * @param ref - Reference path (e.g., '#/components/schemas/Pet')
   * @returns Resolved component
   */
  private static resolveReference<T>(spec: OpenAPISpec, ref: string): T | undefined {
    if (!ref.startsWith('#/')) {
      throw new Error(`External references are not supported: ${ref}`);
    }

    const parts = ref.split('/').slice(1); // Remove leading '#'
    let current: unknown = spec;

    for (const part of parts) {
      if (typeof current === 'object' && current !== null && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current as T;
  }

  /**
   * Generate an operation name from path and method.
   *
   * @param path - Path of the operation
   * @param method - HTTP method
   * @returns Generated operation name
   */
  private static generateOperationName(path: string, method: HttpMethod): string {
    // Convert /users/{id}/posts to users_id_posts
    const cleanPath = path
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_'); // Replace multiple underscores with single underscore
    return `${method}_${cleanPath}`;
  }

  /**
   * Create an HTTP client with base configuration.
   *
   * @param baseUrl - Base URL for requests
   * @param options - Tool generation options
   * @returns Configured Axios instance
   */
  private static createHttpClient(baseUrl: string, options?: OpenAPIToolOptions): AxiosInstance {
    const config: AxiosRequestConfig = {
      baseURL: baseUrl,
      ...options?.axiosConfig,
    };

    return axios.create(config);
  }

  /**
   * Add authentication headers to the request.
   *
   * @param headers - Headers object to modify
   * @param auth - Authentication configuration
   */
  private static addAuthHeaders(headers: Record<string, string>, auth?: OpenAPIAuthConfig): void {
    if (!auth) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;

      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'apiKey':
        if (auth.apiKey && auth.name) {
          if (auth.in === 'header') {
            headers[auth.name] = auth.apiKey;
          }
          // Query parameters are handled separately in the execution function
        }
        break;

      case 'oauth2':
        if (auth.accessToken) {
          headers['Authorization'] = `Bearer ${auth.accessToken}`;
        }
        break;
    }
  }

  /**
   * Extract security schemes from the OpenAPI spec.
   *
   * @param spec - OpenAPI specification
   * @returns Map of security scheme names to definitions
   */
  static getSecuritySchemes(spec: OpenAPISpec): Record<string, SecurityScheme> {
    return spec.components?.securitySchemes || {};
  }

  /**
   * Create authentication configuration from a security scheme.
   *
   * @param scheme - Security scheme definition
   * @param credentials - Credentials (key, token, username/password, etc.)
   * @returns Authentication configuration
   */
  static createAuthFromScheme(scheme: SecurityScheme, credentials: string | { username: string; password: string }): OpenAPIAuthConfig {
    switch (scheme.type) {
      case 'apiKey':
        return {
          type: 'apiKey',
          apiKey: typeof credentials === 'string' ? credentials : '',
          in: scheme.in === 'query' || scheme.in === 'header' ? scheme.in : 'header',
          name: scheme.name || 'api-key',
        };

      case 'http':
        if (scheme.scheme === 'bearer') {
          return {
            type: 'bearer',
            token: typeof credentials === 'string' ? credentials : '',
          };
        } else if (scheme.scheme === 'basic') {
          return {
            type: 'basic',
            username: typeof credentials === 'object' ? credentials.username : '',
            password: typeof credentials === 'object' ? credentials.password : '',
          };
        }
        break;

      case 'oauth2':
        return {
          type: 'oauth2',
          accessToken: typeof credentials === 'string' ? credentials : '',
        };
    }

    throw new Error(`Unsupported security scheme type: ${scheme.type}`);
  }
}

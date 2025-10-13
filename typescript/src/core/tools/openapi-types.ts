/**
 * OpenAPI specification types for TypeScript.
 *
 * This module provides TypeScript interfaces for OpenAPI 3.x specifications,
 * supporting both OpenAPI 3.0 and 3.1.
 *
 * @module openapi-types
 */

/**
 * OpenAPI 3.x specification document.
 */
export interface OpenAPISpec {
  /** OpenAPI version (e.g., '3.0.0', '3.1.0') */
  openapi: string;
  /** Metadata about the API */
  info: Info;
  /** Server connection information */
  servers?: Server[];
  /** Available paths and operations */
  paths: Record<string, PathItem>;
  /** Reusable components */
  components?: Components;
  /** Security requirements */
  security?: SecurityRequirement[];
  /** Tags for grouping operations */
  tags?: Tag[];
  /** External documentation */
  externalDocs?: ExternalDocumentation;
}

/**
 * Metadata about the API.
 */
export interface Info {
  /** Title of the API */
  title: string;
  /** Description of the API */
  description?: string;
  /** Version of the API */
  version: string;
  /** Terms of service */
  termsOfService?: string;
  /** Contact information */
  contact?: Contact;
  /** License information */
  license?: License;
}

/**
 * Contact information.
 */
export interface Contact {
  name?: string;
  url?: string;
  email?: string;
}

/**
 * License information.
 */
export interface License {
  name: string;
  url?: string;
}

/**
 * Server connection information.
 */
export interface Server {
  /** Base URL for the API */
  url: string;
  /** Description of the server */
  description?: string;
  /** Variable substitutions */
  variables?: Record<string, ServerVariable>;
}

/**
 * Server variable for URL substitution.
 */
export interface ServerVariable {
  /** Default value */
  default: string;
  /** Enumeration of possible values */
  enum?: string[];
  /** Description */
  description?: string;
}

/**
 * Path item containing operations for a single path.
 */
export interface PathItem {
  /** Reference to another path item */
  $ref?: string;
  /** Summary for all operations in this path */
  summary?: string;
  /** Description for all operations in this path */
  description?: string;
  /** GET operation */
  get?: Operation;
  /** PUT operation */
  put?: Operation;
  /** POST operation */
  post?: Operation;
  /** DELETE operation */
  delete?: Operation;
  /** OPTIONS operation */
  options?: Operation;
  /** HEAD operation */
  head?: Operation;
  /** PATCH operation */
  patch?: Operation;
  /** TRACE operation */
  trace?: Operation;
  /** Parameters applicable to all operations */
  parameters?: (Parameter | Reference)[];
  /** Servers override for this path */
  servers?: Server[];
}

/**
 * HTTP operation.
 */
export interface Operation {
  /** Unique identifier for the operation */
  operationId?: string;
  /** Short summary of the operation */
  summary?: string;
  /** Verbose description of the operation */
  description?: string;
  /** Tags for grouping operations */
  tags?: string[];
  /** Parameters for the operation */
  parameters?: (Parameter | Reference)[];
  /** Request body */
  requestBody?: RequestBody | Reference;
  /** Possible responses */
  responses: Record<string, Response | Reference>;
  /** Security requirements */
  security?: SecurityRequirement[];
  /** Deprecated flag */
  deprecated?: boolean;
  /** External documentation */
  externalDocs?: ExternalDocumentation;
  /** Servers override for this operation */
  servers?: Server[];
}

/**
 * Parameter for an operation.
 */
export interface Parameter {
  /** Name of the parameter */
  name: string;
  /** Location of the parameter */
  in: 'query' | 'header' | 'path' | 'cookie';
  /** Description of the parameter */
  description?: string;
  /** Required flag */
  required?: boolean;
  /** Deprecated flag */
  deprecated?: boolean;
  /** Allow empty value */
  allowEmptyValue?: boolean;
  /** Schema defining the parameter type */
  schema?: Schema | Reference;
  /** Example value */
  example?: unknown;
  /** Examples */
  examples?: Record<string, Example | Reference>;
}

/**
 * Request body.
 */
export interface RequestBody {
  /** Description of the request body */
  description?: string;
  /** Content of the request body */
  content: Record<string, MediaType>;
  /** Required flag */
  required?: boolean;
}

/**
 * Media type definition.
 */
export interface MediaType {
  /** Schema defining the content */
  schema?: Schema | Reference;
  /** Example value */
  example?: unknown;
  /** Examples */
  examples?: Record<string, Example | Reference>;
  /** Encoding information */
  encoding?: Record<string, Encoding>;
}

/**
 * Response definition.
 */
export interface Response {
  /** Description of the response */
  description: string;
  /** Headers returned with the response */
  headers?: Record<string, Header | Reference>;
  /** Content of the response */
  content?: Record<string, MediaType>;
  /** Links to other operations */
  links?: Record<string, Link | Reference>;
}

/**
 * Header definition.
 */
export interface Header {
  /** Description of the header */
  description?: string;
  /** Required flag */
  required?: boolean;
  /** Deprecated flag */
  deprecated?: boolean;
  /** Schema defining the header type */
  schema?: Schema | Reference;
  /** Example value */
  example?: unknown;
  /** Examples */
  examples?: Record<string, Example | Reference>;
}

/**
 * JSON Schema definition.
 */
export interface Schema {
  /** Type of the schema */
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  /** Title of the schema */
  title?: string;
  /** Description of the schema */
  description?: string;
  /** Format of the value */
  format?: string;
  /** Default value */
  default?: unknown;
  /** Enum values */
  enum?: unknown[];
  /** Multiple types (OpenAPI 3.1) */
  types?: string[];
  /** Properties for object type */
  properties?: Record<string, Schema | Reference>;
  /** Required properties */
  required?: string[];
  /** Items for array type */
  items?: Schema | Reference;
  /** Additional properties */
  additionalProperties?: boolean | Schema | Reference;
  /** Minimum value */
  minimum?: number;
  /** Maximum value */
  maximum?: number;
  /** Exclusive minimum flag */
  exclusiveMinimum?: boolean | number;
  /** Exclusive maximum flag */
  exclusiveMaximum?: boolean | number;
  /** Minimum length */
  minLength?: number;
  /** Maximum length */
  maxLength?: number;
  /** Pattern for string validation */
  pattern?: string;
  /** Minimum items for array */
  minItems?: number;
  /** Maximum items for array */
  maxItems?: number;
  /** Unique items flag for array */
  uniqueItems?: boolean;
  /** Minimum properties for object */
  minProperties?: number;
  /** Maximum properties for object */
  maxProperties?: number;
  /** Nullable flag (OpenAPI 3.0) */
  nullable?: boolean;
  /** Read-only flag */
  readOnly?: boolean;
  /** Write-only flag */
  writeOnly?: boolean;
  /** Example value */
  example?: unknown;
  /** External documentation */
  externalDocs?: ExternalDocumentation;
  /** Deprecated flag */
  deprecated?: boolean;
  /** AllOf composition */
  allOf?: (Schema | Reference)[];
  /** OneOf composition */
  oneOf?: (Schema | Reference)[];
  /** AnyOf composition */
  anyOf?: (Schema | Reference)[];
  /** Not schema */
  not?: Schema | Reference;
}

/**
 * Reference to a component.
 */
export interface Reference {
  /** Reference path */
  $ref: string;
}

/**
 * Example value.
 */
export interface Example {
  /** Summary of the example */
  summary?: string;
  /** Description of the example */
  description?: string;
  /** Example value */
  value?: unknown;
  /** External value URL */
  externalValue?: string;
}

/**
 * Encoding information for request body.
 */
export interface Encoding {
  /** Content type */
  contentType?: string;
  /** Headers */
  headers?: Record<string, Header | Reference>;
  /** Style of encoding */
  style?: string;
  /** Explode flag */
  explode?: boolean;
  /** Allow reserved characters */
  allowReserved?: boolean;
}

/**
 * Link to another operation.
 */
export interface Link {
  /** Reference to an operation */
  operationRef?: string;
  /** Operation ID */
  operationId?: string;
  /** Parameters */
  parameters?: Record<string, unknown>;
  /** Request body */
  requestBody?: unknown;
  /** Description */
  description?: string;
  /** Server */
  server?: Server;
}

/**
 * Tag for grouping operations.
 */
export interface Tag {
  /** Name of the tag */
  name: string;
  /** Description of the tag */
  description?: string;
  /** External documentation */
  externalDocs?: ExternalDocumentation;
}

/**
 * External documentation.
 */
export interface ExternalDocumentation {
  /** Description */
  description?: string;
  /** URL */
  url: string;
}

/**
 * Reusable components.
 */
export interface Components {
  /** Reusable schemas */
  schemas?: Record<string, Schema | Reference>;
  /** Reusable responses */
  responses?: Record<string, Response | Reference>;
  /** Reusable parameters */
  parameters?: Record<string, Parameter | Reference>;
  /** Reusable examples */
  examples?: Record<string, Example | Reference>;
  /** Reusable request bodies */
  requestBodies?: Record<string, RequestBody | Reference>;
  /** Reusable headers */
  headers?: Record<string, Header | Reference>;
  /** Security schemes */
  securitySchemes?: Record<string, SecurityScheme>;
  /** Reusable links */
  links?: Record<string, Link | Reference>;
  /** Reusable callbacks */
  callbacks?: Record<string, Record<string, PathItem | Reference>>;
}

/**
 * Security scheme definition.
 */
export interface SecurityScheme {
  /** Type of security scheme */
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  /** Description */
  description?: string;
  /** Name of the header/query parameter (for apiKey) */
  name?: string;
  /** Location of the API key (for apiKey) */
  in?: 'query' | 'header' | 'cookie';
  /** HTTP authorization scheme (for http) */
  scheme?: string;
  /** Bearer format (for http) */
  bearerFormat?: string;
  /** OAuth flows (for oauth2) */
  flows?: OAuthFlows;
  /** OpenID Connect URL (for openIdConnect) */
  openIdConnectUrl?: string;
}

/**
 * OAuth flows.
 */
export interface OAuthFlows {
  /** Implicit flow */
  implicit?: OAuthFlow;
  /** Password flow */
  password?: OAuthFlow;
  /** Client credentials flow */
  clientCredentials?: OAuthFlow;
  /** Authorization code flow */
  authorizationCode?: OAuthFlow;
}

/**
 * OAuth flow.
 */
export interface OAuthFlow {
  /** Authorization URL */
  authorizationUrl?: string;
  /** Token URL */
  tokenUrl?: string;
  /** Refresh URL */
  refreshUrl?: string;
  /** Scopes */
  scopes: Record<string, string>;
}

/**
 * Security requirement.
 */
export type SecurityRequirement = Record<string, string[]>;

/**
 * Type guard to check if a value is a Reference.
 */
export function isReference(value: unknown): value is Reference {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

/**
 * Type guard to check if a value is an Operation.
 */
export function isOperation(value: unknown): value is Operation {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('$ref' in value) &&
    ('operationId' in value || 'summary' in value || 'responses' in value)
  );
}

/**
 * HTTP methods supported by OpenAPI.
 */
export type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

/**
 * List of all HTTP methods.
 */
export const HTTP_METHODS: HttpMethod[] = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

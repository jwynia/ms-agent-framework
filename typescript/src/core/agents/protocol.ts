/**
 * AgentProtocol - Type guards and runtime validation for agent protocol conformance.
 *
 * This module provides the AgentProtocol interface definition and runtime validation
 * utilities for checking if objects conform to the protocol at runtime.
 *
 * Uses structural typing - classes don't need to explicitly implement this interface.
 *
 * @module agents/protocol
 */

import type { ChatMessage } from '../types/chat-message.js';
import type { AgentThread } from './agent-thread.js';

/**
 * Options for agent execution.
 */
export interface AgentRunOptions {
  /** The thread to use for execution */
  thread?: AgentThread;
  /** Additional options */
  [key: string]: unknown;
}

/**
 * Response from agent execution.
 */
export interface AgentRunResponse {
  /** Response messages from the agent */
  messages: ChatMessage[];
  /** Unique identifier for this response */
  responseId: string;
  /** Additional response properties */
  [key: string]: unknown;
}

/**
 * Streaming update from agent execution.
 */
export interface AgentRunResponseUpdate {
  /** Partial text content */
  text?: string;
  /** Additional update properties */
  [key: string]: unknown;
}

/**
 * Protocol interface for agent implementations.
 *
 * This interface defines the contract that all agents must implement.
 * Uses structural subtyping - classes don't need to explicitly implement this interface.
 *
 * @example
 * ```typescript
 * import { AgentProtocol, isAgentProtocol } from 'agent-framework';
 *
 * // Custom agent that structurally conforms to AgentProtocol
 * class MyCustomAgent {
 *   id = 'custom-001';
 *   name = 'Custom Agent';
 *   get displayName() { return this.name || this.id; }
 *   description = 'A custom agent';
 *
 *   async run(messages, options) {
 *     return { messages: [], responseId: 'response-001' };
 *   }
 *
 *   async *runStream(messages, options) {
 *     yield { text: 'chunk' };
 *   }
 *
 *   getNewThread(options) {
 *     return new AgentThread();
 *   }
 * }
 *
 * const agent = new MyCustomAgent();
 * if (isAgentProtocol(agent)) {
 *   // TypeScript knows agent conforms to AgentProtocol
 *   const response = await agent.run('Hello');
 * }
 * ```
 */
export interface AgentProtocol {
  /**
   * The unique identifier of the agent.
   */
  readonly id: string;

  /**
   * The name of the agent (can be null).
   */
  readonly name: string | null;

  /**
   * The display name of the agent.
   * Should return name if available, otherwise id.
   */
  readonly displayName: string;

  /**
   * The description of the agent (can be null).
   */
  readonly description: string | null;

  /**
   * Execute the agent with the given messages.
   *
   * @param messages - The message(s) to send to the agent
   * @param options - Optional execution options including thread
   * @returns A promise resolving to the agent's response
   */
  run(
    messages?: string | ChatMessage | (string | ChatMessage)[],
    options?: AgentRunOptions
  ): Promise<AgentRunResponse>;

  /**
   * Execute the agent with streaming responses.
   *
   * @param messages - The message(s) to send to the agent
   * @param options - Optional execution options including thread
   * @returns An async iterable of response updates
   */
  runStream(
    messages?: string | ChatMessage | (string | ChatMessage)[],
    options?: AgentRunOptions
  ): AsyncIterable<AgentRunResponseUpdate>;

  /**
   * Create a new conversation thread for the agent.
   *
   * @param options - Optional thread creation options
   * @returns A new agent thread instance
   */
  getNewThread(options?: unknown): AgentThread;
}

/**
 * Type guard to check if a value conforms to AgentProtocol.
 *
 * This performs runtime validation of the protocol contract using structural typing.
 *
 * @param value - The value to check
 * @returns True if value conforms to AgentProtocol
 *
 * @example
 * ```typescript
 * function processAgent(agent: unknown) {
 *   if (isAgentProtocol(agent)) {
 *     // TypeScript knows agent has run(), runStream(), etc.
 *     const response = await agent.run('Hello');
 *   }
 * }
 * ```
 */
export function isAgentProtocol(value: unknown): value is AgentProtocol {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check required properties
  if (typeof obj.id !== 'string') {
    return false;
  }

  if (obj.name !== null && typeof obj.name !== 'string') {
    return false;
  }

  if (typeof obj.displayName !== 'string') {
    return false;
  }

  if (obj.description !== null && typeof obj.description !== 'string') {
    return false;
  }

  // Check required methods
  if (typeof obj.run !== 'function') {
    return false;
  }

  if (typeof obj.runStream !== 'function') {
    return false;
  }

  if (typeof obj.getNewThread !== 'function') {
    return false;
  }

  return true;
}

/**
 * Assert that a value conforms to AgentProtocol, throwing if it doesn't.
 *
 * @param value - The value to check
 * @param name - Optional name for error messages
 * @throws {TypeError} If value doesn't conform to AgentProtocol
 *
 * @example
 * ```typescript
 * function requireAgent(value: unknown): AgentProtocol {
 *   assertAgentProtocol(value, 'agent parameter');
 *   return value; // TypeScript knows this is AgentProtocol
 * }
 * ```
 */
export function assertAgentProtocol(
  value: unknown,
  name = 'value'
): asserts value is AgentProtocol {
  if (!isAgentProtocol(value)) {
    const reasons: string[] = [];

    if (value === null || value === undefined) {
      throw new TypeError(`${name} is ${value}, expected AgentProtocol`);
    }

    if (typeof value !== 'object') {
      throw new TypeError(`${name} is ${typeof value}, expected object`);
    }

    const obj = value as Record<string, unknown>;

    if (typeof obj.id !== 'string') {
      reasons.push('missing or invalid property "id" (expected string)');
    }

    if (obj.name !== null && typeof obj.name !== 'string') {
      reasons.push('invalid property "name" (expected string | null)');
    }

    if (typeof obj.displayName !== 'string') {
      reasons.push('missing or invalid property "displayName" (expected string)');
    }

    if (obj.description !== null && typeof obj.description !== 'string') {
      reasons.push('invalid property "description" (expected string | null)');
    }

    if (typeof obj.run !== 'function') {
      reasons.push('missing method "run"');
    }

    if (typeof obj.runStream !== 'function') {
      reasons.push('missing method "runStream"');
    }

    if (typeof obj.getNewThread !== 'function') {
      reasons.push('missing method "getNewThread"');
    }

    throw new TypeError(
      `${name} does not conform to AgentProtocol:\n  - ${reasons.join('\n  - ')}`
    );
  }
}

/**
 * Partial protocol checks for granular validation.
 */
export namespace AgentProtocolGuards {
  /**
   * Check if value has a valid run() method.
   */
  export function hasRunMethod(value: unknown): value is { run: AgentProtocol['run'] } {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).run === 'function'
    );
  }

  /**
   * Check if value has a valid runStream() method.
   */
  export function hasStreamMethod(
    value: unknown
  ): value is { runStream: AgentProtocol['runStream'] } {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).runStream === 'function'
    );
  }

  /**
   * Check if value has agent identity properties.
   */
  export function hasAgentIdentity(
    value: unknown
  ): value is Pick<AgentProtocol, 'id' | 'name' | 'displayName' | 'description'> {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    const obj = value as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      (obj.name === null || typeof obj.name === 'string') &&
      typeof obj.displayName === 'string' &&
      (obj.description === null || typeof obj.description === 'string')
    );
  }
}

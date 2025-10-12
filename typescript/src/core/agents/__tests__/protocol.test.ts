/**
 * Unit tests for AgentProtocol type guards and validation utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  isAgentProtocol,
  assertAgentProtocol,
  AgentProtocolGuards,
  type AgentProtocol,
  type AgentRunResponse,
  type AgentRunResponseUpdate,
} from '../protocol.js';
import { AgentThread } from '../agent-thread.js';

describe('AgentProtocol Type Guards', () => {
  // Helper: Create a valid agent-like object
  const createValidAgent = (): AgentProtocol => ({
    id: 'test-agent-001',
    name: 'Test Agent',
    get displayName() {
      return this.name || this.id;
    },
    description: 'A test agent',
    async run() {
      return { messages: [], responseId: 'response-001' };
    },
    async *runStream() {
      yield { text: 'chunk' };
    },
    getNewThread() {
      return new AgentThread();
    },
  });

  describe('isAgentProtocol', () => {
    it('should return true for conforming objects', () => {
      const agent = createValidAgent();
      expect(isAgentProtocol(agent)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isAgentProtocol(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAgentProtocol(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isAgentProtocol('string')).toBe(false);
      expect(isAgentProtocol(123)).toBe(false);
      expect(isAgentProtocol(true)).toBe(false);
    });

    it('should return false for objects missing id', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).id;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects with invalid id type', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).id = 123;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects missing run method', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).run;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects where run is not a function', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).run = 'not a function';
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects missing runStream method', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).runStream;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects where runStream is not a function', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).runStream = 123;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects missing getNewThread method', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).getNewThread;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects where getNewThread is not a function', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).getNewThread = {};
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects missing displayName', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).displayName;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should return false for objects with invalid displayName type', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.defineProperty(agent, 'displayName', { value: 123 });
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should allow name to be null', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).name = null;
      expect(isAgentProtocol(agent)).toBe(true);
    });

    it('should return false for objects with invalid name type', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).name = 123;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should allow description to be null', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).description = null;
      expect(isAgentProtocol(agent)).toBe(true);
    });

    it('should return false for objects with invalid description type', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).description = 456;
      expect(isAgentProtocol(agent)).toBe(false);
    });

    it('should validate custom agent implementations', () => {
      class CustomAgent {
        id = 'custom-001';
        name = 'Custom';
        get displayName() {
          return this.name || this.id;
        }
        description = 'Custom agent';

        async run(): Promise<AgentRunResponse> {
          return { messages: [], responseId: 'custom-response' };
        }

        async *runStream(): AsyncIterable<AgentRunResponseUpdate> {
          yield { text: 'custom chunk' };
        }

        getNewThread(): AgentThread {
          return new AgentThread();
        }
      }

      const agent = new CustomAgent();
      expect(isAgentProtocol(agent)).toBe(true);
    });

    it('should work with type narrowing', () => {
      const maybeAgent: unknown = createValidAgent();

      if (isAgentProtocol(maybeAgent)) {
        // Type narrowing should work
        const id: string = maybeAgent.id;
        const name: string | null = maybeAgent.name;
        expect(id).toBe('test-agent-001');
        expect(name).toBe('Test Agent');
      } else {
        throw new Error('Should have passed type guard');
      }
    });

    it('should return false for empty objects', () => {
      expect(isAgentProtocol({})).toBe(false);
    });

    it('should return false for objects with all properties but wrong types', () => {
      const badAgent = {
        id: 123, // wrong type
        name: 'Agent',
        displayName: 'Agent',
        description: 'An agent',
        run: () => {},
        runStream: () => {},
        getNewThread: () => {},
      };
      expect(isAgentProtocol(badAgent)).toBe(false);
    });
  });

  describe('assertAgentProtocol', () => {
    it('should not throw for conforming objects', () => {
      const agent = createValidAgent();
      expect(() => assertAgentProtocol(agent)).not.toThrow();
    });

    it('should throw TypeError for null', () => {
      expect(() => assertAgentProtocol(null)).toThrow(TypeError);
      expect(() => assertAgentProtocol(null)).toThrow('value is null');
    });

    it('should throw TypeError for undefined', () => {
      expect(() => assertAgentProtocol(undefined)).toThrow(TypeError);
      expect(() => assertAgentProtocol(undefined)).toThrow('value is undefined');
    });

    it('should throw TypeError for primitives', () => {
      expect(() => assertAgentProtocol('string')).toThrow(TypeError);
      expect(() => assertAgentProtocol('string')).toThrow('value is string, expected object');
    });

    it('should throw with custom name in error message', () => {
      expect(() => assertAgentProtocol(null, 'myAgent')).toThrow('myAgent is null');
    });

    it('should list all violations in error message', () => {
      const badAgent = {
        id: 123, // wrong
        name: 456, // wrong
        displayName: true, // wrong
        description: {}, // wrong
        // missing all methods
      };

      try {
        assertAgentProtocol(badAgent, 'testAgent');
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        const message = (error as Error).message;
        expect(message).toContain('testAgent does not conform to AgentProtocol');
        expect(message).toContain('missing or invalid property "id"');
        expect(message).toContain('invalid property "name"');
        expect(message).toContain('missing or invalid property "displayName"');
        expect(message).toContain('invalid property "description"');
        expect(message).toContain('missing method "run"');
        expect(message).toContain('missing method "runStream"');
        expect(message).toContain('missing method "getNewThread"');
      }
    });

    it('should throw for missing id', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).id;

      try {
        assertAgentProtocol(agent);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toContain('missing or invalid property "id"');
      }
    });

    it('should throw for missing run method', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (agent as any).run;

      try {
        assertAgentProtocol(agent);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toContain('missing method "run"');
      }
    });

    it('should throw for invalid name type', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).name = 123;

      try {
        assertAgentProtocol(agent);
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toContain('invalid property "name"');
      }
    });

    it('should work with type assertion', () => {
      const maybeAgent: unknown = createValidAgent();
      assertAgentProtocol(maybeAgent);

      // After assertion, TypeScript knows this is AgentProtocol
      const id: string = maybeAgent.id;
      expect(id).toBe('test-agent-001');
    });
  });

  describe('AgentProtocolGuards.hasRunMethod', () => {
    it('should return true for objects with run method', () => {
      const obj = {
        run: async () => ({ messages: [], responseId: 'test' }),
      };
      expect(AgentProtocolGuards.hasRunMethod(obj)).toBe(true);
    });

    it('should return false for objects without run method', () => {
      const obj = { foo: 'bar' };
      expect(AgentProtocolGuards.hasRunMethod(obj)).toBe(false);
    });

    it('should return false for objects where run is not a function', () => {
      const obj = { run: 'not a function' };
      expect(AgentProtocolGuards.hasRunMethod(obj)).toBe(false);
    });

    it('should return false for null', () => {
      expect(AgentProtocolGuards.hasRunMethod(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(AgentProtocolGuards.hasRunMethod('string')).toBe(false);
    });

    it('should work independently from full protocol check', () => {
      const partialAgent = {
        run: async () => ({ messages: [], responseId: 'test' }),
        // Missing other protocol requirements
      };
      expect(AgentProtocolGuards.hasRunMethod(partialAgent)).toBe(true);
      expect(isAgentProtocol(partialAgent)).toBe(false);
    });
  });

  describe('AgentProtocolGuards.hasStreamMethod', () => {
    it('should return true for objects with runStream method', () => {
      const obj = {
        runStream: async function* () {
          yield { text: 'test' };
        },
      };
      expect(AgentProtocolGuards.hasStreamMethod(obj)).toBe(true);
    });

    it('should return false for objects without runStream method', () => {
      const obj = { foo: 'bar' };
      expect(AgentProtocolGuards.hasStreamMethod(obj)).toBe(false);
    });

    it('should return false for objects where runStream is not a function', () => {
      const obj = { runStream: 123 };
      expect(AgentProtocolGuards.hasStreamMethod(obj)).toBe(false);
    });

    it('should return false for null', () => {
      expect(AgentProtocolGuards.hasStreamMethod(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(AgentProtocolGuards.hasStreamMethod(42)).toBe(false);
    });

    it('should work independently from full protocol check', () => {
      const partialAgent = {
        runStream: async function* () {
          yield { text: 'test' };
        },
        // Missing other protocol requirements
      };
      expect(AgentProtocolGuards.hasStreamMethod(partialAgent)).toBe(true);
      expect(isAgentProtocol(partialAgent)).toBe(false);
    });
  });

  describe('AgentProtocolGuards.hasAgentIdentity', () => {
    it('should return true for objects with all identity properties', () => {
      const obj = {
        id: 'agent-001',
        name: 'Agent',
        displayName: 'Agent',
        description: 'An agent',
      };
      expect(AgentProtocolGuards.hasAgentIdentity(obj)).toBe(true);
    });

    it('should return true when name and description are null', () => {
      const obj = {
        id: 'agent-001',
        name: null,
        displayName: 'Agent',
        description: null,
      };
      expect(AgentProtocolGuards.hasAgentIdentity(obj)).toBe(true);
    });

    it('should return false for objects missing id', () => {
      const obj = {
        name: 'Agent',
        displayName: 'Agent',
        description: 'An agent',
      };
      expect(AgentProtocolGuards.hasAgentIdentity(obj)).toBe(false);
    });

    it('should return false for objects with invalid id type', () => {
      const obj = {
        id: 123,
        name: 'Agent',
        displayName: 'Agent',
        description: 'An agent',
      };
      expect(AgentProtocolGuards.hasAgentIdentity(obj)).toBe(false);
    });

    it('should return false for objects with invalid name type', () => {
      const obj = {
        id: 'agent-001',
        name: 123,
        displayName: 'Agent',
        description: 'An agent',
      };
      expect(AgentProtocolGuards.hasAgentIdentity(obj)).toBe(false);
    });

    it('should return false for objects missing displayName', () => {
      const obj = {
        id: 'agent-001',
        name: 'Agent',
        description: 'An agent',
      };
      expect(AgentProtocolGuards.hasAgentIdentity(obj)).toBe(false);
    });

    it('should return false for null', () => {
      expect(AgentProtocolGuards.hasAgentIdentity(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(AgentProtocolGuards.hasAgentIdentity('string')).toBe(false);
    });

    it('should work independently from full protocol check', () => {
      const partialAgent = {
        id: 'agent-001',
        name: 'Agent',
        displayName: 'Agent',
        description: 'An agent',
        // Missing methods
      };
      expect(AgentProtocolGuards.hasAgentIdentity(partialAgent)).toBe(true);
      expect(isAgentProtocol(partialAgent)).toBe(false);
    });
  });

  describe('Integration with AgentThread', () => {
    it('should work with agents that create real AgentThread instances', async () => {
      const agent = createValidAgent();
      expect(isAgentProtocol(agent)).toBe(true);

      const thread = agent.getNewThread();
      expect(thread).toBeInstanceOf(AgentThread);
    });
  });

  describe('Edge cases', () => {
    it('should handle objects with getters correctly', () => {
      const agent = {
        id: 'test',
        name: 'Test',
        get displayName() {
          return this.name || this.id;
        },
        description: 'Test',
        run: async () => ({ messages: [], responseId: 'test' }),
        runStream: async function* () {
          yield { text: 'test' };
        },
        getNewThread: () => new AgentThread(),
      };

      expect(isAgentProtocol(agent)).toBe(true);
    });

    it('should handle objects with extra properties', () => {
      const agent = createValidAgent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).extraProperty = 'extra';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).anotherExtra = 123;

      expect(isAgentProtocol(agent)).toBe(true);
    });

    it('should handle class instances correctly', () => {
      class MyAgent implements AgentProtocol {
        id = 'class-agent';
        name = 'Class Agent';
        get displayName() {
          return this.name || this.id;
        }
        description = 'Class-based agent';

        async run() {
          return { messages: [], responseId: 'class-response' };
        }

        async *runStream() {
          yield { text: 'class-chunk' };
        }

        getNewThread() {
          return new AgentThread();
        }
      }

      const agent = new MyAgent();
      expect(isAgentProtocol(agent)).toBe(true);
      assertAgentProtocol(agent); // Should not throw
    });

    it('should handle arrays', () => {
      expect(isAgentProtocol([])).toBe(false);
      expect(isAgentProtocol([1, 2, 3])).toBe(false);
    });

    it('should handle Date objects', () => {
      expect(isAgentProtocol(new Date())).toBe(false);
    });

    it('should handle RegExp objects', () => {
      expect(isAgentProtocol(/test/)).toBe(false);
    });
  });
});

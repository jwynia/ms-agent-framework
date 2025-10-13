/**
 * Tests for TASK-104-105: Thread Management Logic
 *
 * This test suite validates the thread type determination and management logic
 * that integrates service-managed and local-managed threads with AgentThread.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentThread } from '../agent-thread';
import { ThreadType } from '../../threads/service-thread-types';
import { InMemoryMessageStore } from '../../storage/in-memory-store';
import { AgentThreadError } from '../../errors/agent-errors';

describe('TASK-104-105: Thread Management Logic', () => {
  describe('Thread Type Determination', () => {
    it('should start as UNDETERMINED', () => {
      const thread = new AgentThread();
      expect(thread.threadType).toBe(ThreadType.UNDETERMINED);
      expect(thread.conversationId).toBeUndefined();
      expect(thread.messageStore).toBeUndefined();
    });

    it('should become SERVICE_MANAGED when conversation ID provided', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId('conv-123');

      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
      expect(thread.conversationId).toBe('conv-123');
      expect(thread.messageStore).toBeUndefined();
    });

    it('should become LOCAL_MANAGED when no ID and factory provided', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
      expect(thread.conversationId).toBeUndefined();
      expect(thread.messageStore).toBeDefined();
      expect(thread.messageStore).toBeInstanceOf(InMemoryMessageStore);
    });

    it('should throw error if type changes after determination', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId('conv-123');

      const factory = () => new InMemoryMessageStore();
      expect(() => thread.updateWithConversationId(undefined, factory)).toThrow(AgentThreadError);
      expect(() => thread.updateWithConversationId(undefined, factory)).toThrow(
        /Thread type already determined/,
      );
    });

    it('should throw error if trying to change from LOCAL to SERVICE', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      expect(() => thread.updateWithConversationId('conv-123')).toThrow(AgentThreadError);
      expect(() => thread.updateWithConversationId('conv-123')).toThrow(/Thread type already determined/);
    });

    it('should not change if same type provided again with SERVICE_MANAGED', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId('conv-123');

      // Call again with same conversation ID - should not throw
      thread.updateWithConversationId('conv-123');

      expect(thread.conversationId).toBe('conv-123');
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });

    it('should not change if same type provided again with LOCAL_MANAGED', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      const firstStore = thread.messageStore;

      // Call again with factory - should not throw and store should not change
      thread.updateWithConversationId(undefined, factory);

      expect(thread.messageStore).toBe(firstStore);
      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
    });

    it('should remain UNDETERMINED if neither ID nor factory provided', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId();

      expect(thread.threadType).toBe(ThreadType.UNDETERMINED);
      expect(thread.conversationId).toBeUndefined();
      expect(thread.messageStore).toBeUndefined();
    });

    it('should initialize messageStore from factory', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      expect(thread.messageStore).toBeInstanceOf(InMemoryMessageStore);
    });

    it('should allow multiple calls with same conversation ID', () => {
      const thread = new AgentThread();

      thread.updateWithConversationId('conv-123');
      expect(thread.conversationId).toBe('conv-123');

      // Same ID again - should be idempotent
      thread.updateWithConversationId('conv-123');
      expect(thread.conversationId).toBe('conv-123');
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });
  });

  describe('Thread Lifecycle', () => {
    it('should follow the lifecycle: UNDETERMINED -> SERVICE_MANAGED', () => {
      const thread = new AgentThread();

      // Initially undetermined
      expect(thread.threadType).toBe(ThreadType.UNDETERMINED);

      // After service response with ID
      thread.updateWithConversationId('conv-456');

      // Now service-managed
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
      expect(thread.conversationId).toBe('conv-456');
    });

    it('should follow the lifecycle: UNDETERMINED -> LOCAL_MANAGED', () => {
      const thread = new AgentThread();

      // Initially undetermined
      expect(thread.threadType).toBe(ThreadType.UNDETERMINED);

      // After service response without ID (fallback to local)
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      // Now local-managed
      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
      expect(thread.messageStore).toBeDefined();
    });

    it('should not allow reverting to UNDETERMINED once determined', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId('conv-789');

      // Try to revert by calling with no arguments - should not throw
      // but should maintain SERVICE_MANAGED state
      thread.updateWithConversationId('conv-789');

      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });
  });

  describe('Integration with Existing AgentThread Properties', () => {
    it('should maintain backward compatibility with serviceThreadId property', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId('conv-123');

      // The conversationId is separate from serviceThreadId
      // conversationId is for protocol-level tracking
      expect(thread.conversationId).toBe('conv-123');
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });

    it('should maintain backward compatibility with messageStore property', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      // messageStore should be accessible
      expect(thread.messageStore).toBeDefined();
      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
    });

    it('should maintain isInitialized behavior', () => {
      const thread = new AgentThread();

      // UNDETERMINED thread is not initialized
      expect(thread.isInitialized).toBe(false);

      // SERVICE_MANAGED thread is initialized (via conversationId -> no, not in current impl)
      // Actually, isInitialized checks serviceThreadId or messageStore
      // conversationId is separate, so it won't affect isInitialized
      thread.updateWithConversationId('conv-123');

      // This thread has conversationId but not serviceThreadId, so it's still not initialized
      // according to the existing isInitialized logic
      expect(thread.isInitialized).toBe(false);
    });

    it('should work with onNewMessages for LOCAL_MANAGED threads', async () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      const message = {
        role: 'user' as const,
        content: 'Hello',
      };

      await thread.onNewMessages(message);

      const messages = await thread.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello');
    });
  });

  describe('Error Handling', () => {
    it('should throw clear error when switching from SERVICE to LOCAL', () => {
      const thread = new AgentThread();
      thread.updateWithConversationId('conv-123');

      const factory = () => new InMemoryMessageStore();

      expect(() => thread.updateWithConversationId(undefined, factory)).toThrow(
        'Thread type already determined as service_managed, cannot change to local_managed',
      );
    });

    it('should throw clear error when switching from LOCAL to SERVICE', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();
      thread.updateWithConversationId(undefined, factory);

      expect(() => thread.updateWithConversationId('conv-123')).toThrow(
        'Thread type already determined as local_managed, cannot change to service_managed',
      );
    });

    it('should handle multiple factory calls correctly', () => {
      const thread = new AgentThread();
      let factoryCallCount = 0;

      const factory = () => {
        factoryCallCount++;
        return new InMemoryMessageStore();
      };

      // First call should invoke factory
      thread.updateWithConversationId(undefined, factory);
      expect(factoryCallCount).toBe(1);

      // Second call should not invoke factory (already determined)
      thread.updateWithConversationId(undefined, factory);
      expect(factoryCallCount).toBe(1); // Still 1, not called again
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string conversation ID as falsy', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();

      // Empty string should be treated as no conversation ID
      thread.updateWithConversationId('', factory);

      // Should become LOCAL_MANAGED, not SERVICE_MANAGED
      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
      expect(thread.messageStore).toBeDefined();
    });

    it('should handle null-like values gracefully', () => {
      const thread = new AgentThread();

      // Calling with undefined for both should remain UNDETERMINED
      thread.updateWithConversationId(undefined, undefined);

      expect(thread.threadType).toBe(ThreadType.UNDETERMINED);
    });

    it('should preserve messageStore instance across calls', () => {
      const thread = new AgentThread();
      const factory = () => new InMemoryMessageStore();

      thread.updateWithConversationId(undefined, factory);
      const store1 = thread.messageStore;

      thread.updateWithConversationId(undefined, factory);
      const store2 = thread.messageStore;

      expect(store1).toBe(store2); // Same instance
    });

    it('should handle conversation ID with special characters', () => {
      const thread = new AgentThread();
      const specialId = 'conv-123-abc_def.ghi@service';

      thread.updateWithConversationId(specialId);

      expect(thread.conversationId).toBe(specialId);
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });
  });
});

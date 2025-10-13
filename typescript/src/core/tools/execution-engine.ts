/**
 * Tool Execution Engine
 *
 * Core logic for executing function calls automatically during agent execution.
 * Handles function call detection, argument validation, execution, and result handling
 * with support for multiple iterations and approval workflows.
 *
 * @module tools/execution-engine
 */

import type { AITool } from './base-tool.js';
import type {
  FunctionCallContent,
  FunctionResultContent,
  FunctionApprovalRequestContent,
  FunctionApprovalResponseContent,
  Content,
} from '../types/chat-message.js';
// ZodError is used implicitly by schema.parse() in error handling

/**
 * Parse function arguments from a JSON string.
 *
 * @param functionCall - The function call content containing arguments
 * @returns Parsed arguments as an object
 * @throws {Error} If arguments cannot be parsed
 *
 * @example
 * ```typescript
 * const args = parseArguments({ type: 'function_call', callId: '123', name: 'foo', arguments: '{"x": 5}' });
 * // { x: 5 }
 * ```
 */
export function parseArguments(functionCall: FunctionCallContent): Record<string, unknown> {
  try {
    return JSON.parse(functionCall.arguments) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse function arguments: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Build a map of tool names to tool instances.
 *
 * @param tools - Array of tools to map
 * @returns Map of tool name to tool instance
 *
 * @example
 * ```typescript
 * const toolMap = buildToolMap([weatherTool, calculatorTool]);
 * const tool = toolMap.get('get_weather');
 * ```
 */
export function buildToolMap(tools: AITool[]): Map<string, AITool> {
  const toolMap = new Map<string, AITool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }
  return toolMap;
}

/**
 * Automatically invoke a single function call with validation and error handling.
 *
 * This function handles the complete lifecycle of a function call:
 * 1. Validates the function exists in the tool map
 * 2. Checks if approval is required
 * 3. Parses and validates arguments against the tool's schema
 * 4. Executes the function
 * 5. Wraps result or error in FunctionResultContent
 *
 * @param functionCall - The function call to execute
 * @param toolMap - Map of available tools
 * @param customArgs - Optional custom arguments to merge with parsed arguments
 * @returns FunctionResultContent with result or error, or FunctionApprovalRequestContent if approval required
 *
 * @example
 * ```typescript
 * const result = await autoInvokeFunction(
 *   { type: 'function_call', callId: '123', name: 'get_weather', arguments: '{"location": "Seattle"}' },
 *   toolMap,
 *   {}
 * );
 * // { type: 'function_result', callId: '123', result: { temp: 72 } }
 * ```
 */
export async function autoInvokeFunction(
  functionCall: FunctionCallContent | FunctionApprovalResponseContent,
  toolMap: Map<string, AITool>,
  customArgs?: Record<string, unknown>
): Promise<FunctionResultContent | FunctionApprovalRequestContent> {
  // Handle approval response
  let actualFunctionCall: FunctionCallContent;
  if (functionCall.type === 'function_approval_response') {
    if (!functionCall.approved) {
      // Return error result for rejected calls
      return {
        type: 'function_result',
        callId: functionCall.functionCall.callId,
        result: null,
        error: new Error('Error: Tool call invocation was rejected by user.'),
      };
    }
    actualFunctionCall = functionCall.functionCall;
  } else {
    actualFunctionCall = functionCall;
  }

  // Validate tool exists
  const tool = toolMap.get(actualFunctionCall.name);
  if (!tool) {
    return {
      type: 'function_result',
      callId: actualFunctionCall.callId,
      result: null,
      error: new Error(`Function '${actualFunctionCall.name}' not found`),
    };
  }

  // Check if approval is required
  const approvalMode = tool.metadata?.approvalMode as string | undefined;
  if (approvalMode === 'always_require' && functionCall.type !== 'function_approval_response') {
    return {
      type: 'function_approval_request',
      id: actualFunctionCall.callId,
      functionCall: actualFunctionCall,
    };
  }

  try {
    // Parse arguments
    const parsedArgs = parseArguments(actualFunctionCall);

    // Merge with custom args (parsed args take precedence)
    const mergedArgs = { ...(customArgs || {}), ...parsedArgs };

    // Validate arguments against schema
    const validatedArgs = tool.schema.parse(mergedArgs);

    // Execute the tool
    const result = await tool.execute(validatedArgs);

    // Return success result
    return {
      type: 'function_result',
      callId: actualFunctionCall.callId,
      result,
    };
  } catch (error) {
    // Wrap any error (validation or execution) in result
    return {
      type: 'function_result',
      callId: actualFunctionCall.callId,
      result: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Execute multiple function calls concurrently using Promise.all().
 *
 * This function executes all function calls in parallel for better performance.
 * If any function requires approval, approval requests are returned for ALL functions.
 *
 * @param functionCalls - Array of function calls to execute
 * @param tools - Array of available tools
 * @param customArgs - Optional custom arguments to merge with each function's arguments
 * @returns Array of results (FunctionResultContent or FunctionApprovalRequestContent)
 *
 * @example
 * ```typescript
 * const results = await executeFunctionCalls(
 *   [weatherCall, calculatorCall],
 *   [weatherTool, calculatorTool],
 *   {}
 * );
 * // [{ type: 'function_result', callId: '1', result: {...} }, ...]
 * ```
 */
export async function executeFunctionCalls(
  functionCalls: Array<FunctionCallContent | FunctionApprovalResponseContent>,
  tools: AITool[],
  customArgs?: Record<string, unknown>
): Promise<Array<FunctionResultContent | FunctionApprovalRequestContent>> {
  const toolMap = buildToolMap(tools);

  // Check if any function requires approval
  let approvalNeeded = false;
  for (const fc of functionCalls) {
    if (fc.type === 'function_call') {
      const tool = toolMap.get(fc.name);
      if (tool && tool.metadata?.approvalMode === 'always_require') {
        approvalNeeded = true;
        break;
      }
    }
  }

  // If approval is needed, return approval requests for all function calls
  if (approvalNeeded) {
    return functionCalls
      .filter((fc): fc is FunctionCallContent => fc.type === 'function_call')
      .map((fc) => ({
        type: 'function_approval_request' as const,
        id: fc.callId,
        functionCall: fc,
      }));
  }

  // Execute all function calls concurrently
  return await Promise.all(functionCalls.map((fc) => autoInvokeFunction(fc, toolMap, customArgs)));
}

/**
 * Extract all function call contents from a message or array of messages.
 *
 * @param content - Single content or array of contents to search
 * @returns Array of function call contents
 *
 * @example
 * ```typescript
 * const calls = extractFunctionCalls([textContent, functionCallContent]);
 * // [functionCallContent]
 * ```
 */
export function extractFunctionCalls(content: Content | Content[]): FunctionCallContent[] {
  const contents = Array.isArray(content) ? content : [content];
  return contents.filter((c): c is FunctionCallContent => c.type === 'function_call');
}

/**
 * Extract all function result contents from a message or array of messages.
 *
 * @param content - Single content or array of contents to search
 * @returns Array of function result contents
 *
 * @example
 * ```typescript
 * const results = extractFunctionResults([textContent, functionResultContent]);
 * // [functionResultContent]
 * ```
 */
export function extractFunctionResults(content: Content | Content[]): FunctionResultContent[] {
  const contents = Array.isArray(content) ? content : [content];
  return contents.filter((c): c is FunctionResultContent => c.type === 'function_result');
}

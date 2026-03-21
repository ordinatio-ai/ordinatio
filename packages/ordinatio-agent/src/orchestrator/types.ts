// ===========================================
// AGENT CHAT — ORCHESTRATOR TYPES
// ===========================================
// Request/response shapes, orchestrator state,
// and UI display types for the chat system.
// ===========================================

// ===========================================
// REQUEST / RESPONSE
// ===========================================

export interface ChatRequest {
  /** Agent role ID (e.g., 'bookkeeper', 'coo') */
  role: string;
  /** Conversation history */
  messages: ChatMessage[];
  /** Current page context for agent awareness */
  pageContext?: PageContext;
}

export interface PageContext {
  /** Dashboard path (e.g., '/dashboard/tax/position') */
  path: string;
  /** Entity type if on a detail page */
  entityType?: string;
  /** Entity ID (CUID or year string) */
  entityId?: string;
}

export interface ChatResponse {
  /** The agent's response message */
  message: ChatMessage;
  /** false if an approval gate was hit and we need user input */
  done: boolean;
}

// ===========================================
// MESSAGE TYPES
// ===========================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Tool calls made during this response (for UI display) */
  toolCalls?: ToolCallDisplay[];
  /** If the agent hit an approval gate */
  pendingApproval?: ApprovalRequest;
}

export interface ToolCallDisplay {
  name: string;
  status: 'running' | 'success' | 'error';
  summary?: string;
}

export interface ApprovalRequest {
  /** Human-readable action name */
  action: string;
  /** Why approval is needed */
  reason: string;
  /** Suggested message to show the user */
  prompt: string;
  /** LLM tool call ID */
  toolCallId: string;
  /** Tool that triggered the gate */
  toolName: string;
  /** Arguments the tool was called with */
  toolArgs: Record<string, unknown>;
}

// ===========================================
// ORCHESTRATOR STATE
// ===========================================

export interface OrchestratorState {
  /** Current iteration count */
  iteration: number;
  /** When the request started (for timeout) */
  startedAt: number;
  /** Tool calls executed so far (for display) */
  toolCallDisplays: ToolCallDisplay[];
  /** Whether we hit an approval gate */
  pendingApproval: ApprovalRequest | null;
}

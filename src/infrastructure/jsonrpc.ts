/**
 * PiPal-A2A Infrastructure — JSON-RPC 2.0 Binding
 *
 * Google A2A spec §9 — JSON-RPC 2.0 transport binding.
 */

// ─────────────────────────────────────────────────────────────────
// JSON-RPC 2.0 Types
// ─────────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

// ─────────────────────────────────────────────────────────────────
// A2A JSON-RPC Error Codes (Google A2A spec)
// ─────────────────────────────────────────────────────────────────

export const JSONRPC_CODES = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_NOT_FOUND: -32800,
  TASK_NOT_CANCELABLE: -32801,
  AGENT_NOT_FOUND: -32802,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32803,
} as const;

// ─────────────────────────────────────────────────────────────────
// JSON-RPC Dispatcher
// ─────────────────────────────────────────────────────────────────

type JsonRpcHandler = (params: Record<string, unknown> | undefined, id: number | string | null) => Promise<unknown>;

export class JsonRpcDispatcher {
  private methods = new Map<string, JsonRpcHandler>();

  register(method: string, handler: JsonRpcHandler): void {
    this.methods.set(method, handler);
  }

  async dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (req.jsonrpc !== "2.0") {
      return { jsonrpc: "2.0", id: req.id ?? null, error: { code: JSONRPC_CODES.INVALID_REQUEST, message: "Missing or invalid 'jsonrpc' field" } };
    }
    if (typeof req.method !== "string" || !req.method) {
      return { jsonrpc: "2.0", id: req.id ?? null, error: { code: JSONRPC_CODES.INVALID_REQUEST, message: "Missing or invalid 'method' field" } };
    }

    const handler = this.methods.get(req.method);
    if (!handler) {
      return { jsonrpc: "2.0", id: req.id ?? null, error: { code: JSONRPC_CODES.METHOD_NOT_FOUND, message: `Method '${req.method}' not found` } };
    }

    try {
      const result = await handler(req.params, req.id);
      return { jsonrpc: "2.0", id: req.id ?? null, result };
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && "message" in err) {
        return { jsonrpc: "2.0", id: req.id ?? null, error: err as JsonRpcError };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { jsonrpc: "2.0", id: req.id ?? null, error: { code: JSONRPC_CODES.INTERNAL_ERROR, message: msg } };
    }
  }

  async dispatchBatch(requests: JsonRpcRequest[]): Promise<JsonRpcResponse[]> {
    if (requests.length === 0) {
      return [{ jsonrpc: "2.0", id: null, error: { code: JSONRPC_CODES.INVALID_REQUEST, message: "Empty batch" } }];
    }
    return Promise.all(requests.map((r) => this.dispatch(r)));
  }
}

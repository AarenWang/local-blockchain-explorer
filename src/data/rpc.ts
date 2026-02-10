export interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

export const fetchJsonRpc = async <T>(url: string, method: string, params: unknown[] = []) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = (await response.json()) as JsonRpcResponse<T>;
  if (data.error) {
    throw new Error(data.error.message);
  }
  if (data.result === undefined) {
    throw new Error('RPC response missing result');
  }
  return data.result;
};

export const measureRpc = async <T>(request: () => Promise<T>) => {
  const start = performance.now();
  const result = await request();
  const end = performance.now();
  return {
    result,
    latencyMs: Math.round(end - start)
  };
};

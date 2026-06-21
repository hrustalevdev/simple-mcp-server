function write(line: string): void {
  process.stderr.write(line + "\n");
}

export function logCall(tool: string, params: Record<string, unknown>): void {
  write(`[CALL]    ${tool}  ${JSON.stringify(params)}`);
}

export function logSuccess(tool: string, durationMs: number): void {
  write(`[SUCCESS] ${tool}  duration=${durationMs}ms`);
}

export function logError(tool: string, reason: string): void {
  write(`[ERROR]   ${tool}  reason="${reason}"`);
}

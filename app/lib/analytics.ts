export type ToolKey =
  | "background"
  | "sprite"
  | "upscale"
  | "resize"
  | "compress"
  | "transform"
  | "inpaint"
  | "crop"
  | "vectorize";

export type ImportSource = "picker" | "drop" | "paste" | "transfer";
export type DownloadFormat = "single" | "zip";
export type AnalyticsErrorType =
  | "validation"
  | "model_download"
  | "processing"
  | "memory"
  | "unknown";

export const PROCESSING_ERROR_TYPE: AnalyticsErrorType = "processing";

declare global {
  interface Window {
    tianji?: {
      track: (name: string, data: Record<string, unknown>) => void;
    };
  }
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function track(name: string, data: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    window.tianji?.track(name, data);
  } catch {
    // Analytics is best effort and must never interrupt image processing.
  }
}

export function calculateDurationMs(
  startedAt: number,
  endedAt: number
): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

export function trackToolImport(
  tool: ToolKey,
  source: ImportSource,
  fileCount: number
): void {
  track("tool_import", {
    tool,
    source,
    file_count: fileCount,
  });
}

export function trackToolProcessStart(
  tool: ToolKey,
  fileCount: number,
  startedAt: number = now()
): number {
  track("tool_process_start", {
    tool,
    file_count: fileCount,
  });
  return startedAt;
}

export function trackToolProcessSuccess(
  tool: ToolKey,
  fileCount: number,
  processedCount: number,
  startedAt: number,
  endedAt: number = now()
): void {
  track("tool_process_success", {
    tool,
    file_count: fileCount,
    processed_count: processedCount,
    duration_ms: calculateDurationMs(startedAt, endedAt),
  });
}

export function trackToolDownload(
  tool: ToolKey,
  outputCount: number,
  format: DownloadFormat
): void {
  track("tool_download", {
    tool,
    output_count: outputCount,
    format,
  });
}

export function classifyAnalyticsError(error: unknown): AnalyticsErrorType {
  if (error === PROCESSING_ERROR_TYPE) return PROCESSING_ERROR_TYPE;
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();
  if (
    /\bhttp\s+\d{3}\b/.test(message) ||
    message.includes("no response body") ||
    message.includes("模型文件无效")
  ) {
    return "model_download";
  }
  if (
    message.includes("failed to load image") ||
    message.includes("failed to create blob")
  ) {
    return "processing";
  }
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("validation")
  ) {
    return "validation";
  }
  if (
    message.includes("download") ||
    message.includes("fetch") ||
    message.includes("model")
  ) {
    return "model_download";
  }
  if (
    message.includes("memory") ||
    message.includes("outofmemory") ||
    message.includes("oom")
  ) {
    return "memory";
  }
  if (
    message.includes("process") ||
    message.includes("canvas") ||
    message.includes("decode")
  ) {
    return "processing";
  }
  return "unknown";
}

export function trackToolProcessFailure(
  tool: ToolKey,
  fileCount: number,
  startedAt: number,
  error: unknown,
  endedAt: number = now()
): void {
  track("tool_process_failure", {
    tool,
    file_count: fileCount,
    duration_ms: calculateDurationMs(startedAt, endedAt),
    error_type: classifyAnalyticsError(error),
  });
}

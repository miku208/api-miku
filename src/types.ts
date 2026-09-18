export type PluginType = "scraper" | "ai";
export type PluginStatus = "active" | "tested" | "unavailable";
export type PluginInputKind = "url" | "text" | "none";

export interface Plugin<I = unknown, O = unknown> {
  name: string;
  slug: string;
  version: string;
  type: PluginType;
  endpoint: string;
  file: string;
  status: PluginStatus;
  description: string;
  inputKind: PluginInputKind;
  paramExample: string;
  params?: { name: string; description?: string }[];
  execute(input: I): Promise<O>;
}

export interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: { source: string; timestamp: string };
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

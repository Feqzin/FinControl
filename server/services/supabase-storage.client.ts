import { ENV } from "../env";

type SupabaseStorageError = {
  message: string;
  statusCode?: number;
};

type SupabaseStorageResult<T> = {
  data: T | null;
  error: SupabaseStorageError | null;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function encodePathPreservingSlashes(relativePath: string): string {
  return relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function parseErrorResponse(response: Response): Promise<SupabaseStorageError> {
  const fallbackMessage = `Supabase Storage request failed with status ${response.status}`;
  const text = await response.text();
  if (!text) {
    return {
      message: fallbackMessage,
      statusCode: response.status,
    };
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message = typeof parsed.message === "string"
      ? parsed.message
      : typeof parsed.error === "string"
        ? parsed.error
        : fallbackMessage;

    return {
      message,
      statusCode: response.status,
    };
  } catch {
    return {
      message: text,
      statusCode: response.status,
    };
  }
}

export function hasSupabaseStorageConfig(): boolean {
  return Boolean(
    ENV.supabase.url &&
    ENV.supabase.serviceRoleKey &&
    ENV.supabase.storageBucket,
  );
}

function assertSupabaseStorageConfig(): {
  url: string;
  serviceRoleKey: string;
  bucket: string;
} {
  if (!hasSupabaseStorageConfig()) {
    throw new Error(
      "SUPABASE_STORAGE_NOT_CONFIGURED: defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET.",
    );
  }

  return {
    url: ENV.supabase.url!,
    serviceRoleKey: ENV.supabase.serviceRoleKey!,
    bucket: ENV.supabase.storageBucket!,
  };
}

export class SupabaseStorageServerClient {
  private readonly baseUrl: string;

  private readonly serviceRoleKey: string;

  private readonly bucket: string;

  constructor() {
    const config = assertSupabaseStorageConfig();
    this.baseUrl = normalizeBaseUrl(config.url);
    this.serviceRoleKey = config.serviceRoleKey;
    this.bucket = config.bucket;
  }

  getBucket(): string {
    return this.bucket;
  }

  async uploadObject(relativePath: string, content: Buffer, mimeType: string): Promise<SupabaseStorageResult<{ path: string }>> {
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedPath = encodePathPreservingSlashes(relativePath);
    const url = `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
        "Content-Type": mimeType,
        "x-upsert": "false",
      },
      body: content,
    });

    if (!response.ok) {
      return {
        data: null,
        error: await parseErrorResponse(response),
      };
    }

    return {
      data: { path: relativePath },
      error: null,
    };
  }

  async downloadObject(relativePath: string): Promise<SupabaseStorageResult<Buffer>> {
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedPath = encodePathPreservingSlashes(relativePath);
    const url = `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
      },
    });

    if (!response.ok) {
      return {
        data: null,
        error: await parseErrorResponse(response),
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      data: Buffer.from(arrayBuffer),
      error: null,
    };
  }

  async removeObject(relativePath: string): Promise<SupabaseStorageResult<null>> {
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedPath = encodePathPreservingSlashes(relativePath);
    const url = `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
      },
    });

    if (!response.ok && response.status !== 404) {
      return {
        data: null,
        error: await parseErrorResponse(response),
      };
    }

    return {
      data: null,
      error: null,
    };
  }
}

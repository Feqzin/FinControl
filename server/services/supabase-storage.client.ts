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
    (ENV.supabase.cloudBackupBucket || ENV.supabase.storageBucket),
  );
}

function assertSupabaseStorageConfig(): {
  url: string;
  serviceRoleKey: string;
  defaultBucket: string;
} {
  if (!hasSupabaseStorageConfig()) {
    throw new Error(
      "SUPABASE_STORAGE_NOT_CONFIGURED: defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET (ou CLOUD_BACKUP_BUCKET para backup cloud).",
    );
  }

  return {
    url: ENV.supabase.url!,
    serviceRoleKey: ENV.supabase.serviceRoleKey!,
    defaultBucket: ENV.supabase.cloudBackupBucket ?? ENV.supabase.storageBucket!,
  };
}

export class SupabaseStorageServerClient {
  private readonly baseUrl: string;

  private readonly serviceRoleKey: string;

  private readonly bucket: string;

  private readonly autoCreateBucketIfMissing: boolean;

  constructor(
    bucketOverride?: string,
    options?: {
      autoCreateBucketIfMissing?: boolean;
    },
  ) {
    const config = assertSupabaseStorageConfig();
    this.baseUrl = normalizeBaseUrl(config.url);
    this.serviceRoleKey = config.serviceRoleKey;
    this.bucket = bucketOverride?.trim() || config.defaultBucket;
    this.autoCreateBucketIfMissing = options?.autoCreateBucketIfMissing === true;
  }

  getBucket(): string {
    return this.bucket;
  }

  private createAuthHeaders(extra?: Record<string, string>): HeadersInit {
    return {
      Authorization: `Bearer ${this.serviceRoleKey}`,
      apikey: this.serviceRoleKey,
      ...extra,
    };
  }

  private isBucketMissingError(error: SupabaseStorageError): boolean {
    if (error.statusCode === 404) {
      return true;
    }
    const normalized = error.message.toLowerCase();
    return normalized.includes("bucket") && normalized.includes("not found");
  }

  private async ensureBucketExists(): Promise<SupabaseStorageResult<null>> {
    const encodedBucket = encodeURIComponent(this.bucket);
    const checkUrl = `${this.baseUrl}/storage/v1/bucket/${encodedBucket}`;
    const checkResponse = await fetch(checkUrl, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (checkResponse.ok) {
      return { data: null, error: null };
    }

    if (checkResponse.status !== 404) {
      return {
        data: null,
        error: await parseErrorResponse(checkResponse),
      };
    }

    const createResponse = await fetch(`${this.baseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: this.createAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: this.bucket,
        name: this.bucket,
        public: false,
      }),
    });

    if (!createResponse.ok && createResponse.status !== 409) {
      return {
        data: null,
        error: await parseErrorResponse(createResponse),
      };
    }

    return { data: null, error: null };
  }

  async uploadObject(relativePath: string, content: Buffer, mimeType: string): Promise<SupabaseStorageResult<{ path: string }>> {
    const encodedBucket = encodeURIComponent(this.bucket);
    const encodedPath = encodePathPreservingSlashes(relativePath);
    const url = `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.createAuthHeaders({
        "Content-Type": mimeType,
        "x-upsert": "false",
      }),
      body: content,
    });

    if (!response.ok) {
      const parsedError = await parseErrorResponse(response);
      if (this.autoCreateBucketIfMissing && this.isBucketMissingError(parsedError)) {
        const ensureResult = await this.ensureBucketExists();
        if (!ensureResult.error) {
          const retryResponse = await fetch(url, {
            method: "POST",
            headers: this.createAuthHeaders({
              "Content-Type": mimeType,
              "x-upsert": "false",
            }),
            body: content,
          });

          if (retryResponse.ok) {
            return {
              data: { path: relativePath },
              error: null,
            };
          }

          return {
            data: null,
            error: await parseErrorResponse(retryResponse),
          };
        }
      }

      return {
        data: null,
        error: parsedError,
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
      headers: this.createAuthHeaders(),
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
      headers: this.createAuthHeaders(),
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

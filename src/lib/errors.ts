export type ErrorCode =
  | "INVALID_URL"
  | "BLOCKED_URL"
  | "FETCH_FAILED"
  | "PAYWALLED"
  | "NOT_ARTICLE"
  | "TOO_LARGE"
  | "RATE_LIMITED"
  | "LLM_FAILED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL";

export interface ApiErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}


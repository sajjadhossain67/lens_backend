import { nanoid } from "nanoid";

export function generateLensId(): string {
  return nanoid(10);
}

export function generateClaimId(): string {
  return nanoid(10);
}

export function generatePerspectiveId(): string {
  return nanoid(10);
}

export function generateMessageId(): string {
  return nanoid(12);
}

export function generateFlagId(): string {
  return nanoid(12);
}


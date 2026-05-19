import { request, type APIResponse } from "@playwright/test";

const COGNITO_URL =
  process.env.INVESTOWN_COGNITO_URL ??
  "https://cognito-idp.eu-west-1.amazonaws.com/";
const CLIENT_ID = process.env.INVESTOWN_COGNITO_CLIENT_ID;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 500, 1_500];

type ConfirmForgotPasswordParams = {
  username: string;
  confirmationCode: string;
  newPassword: string;
};

/**
 * Confirm forgot-password via Investown's AWS Cognito User Pool — bypasses
 * the React Hook Form UI entirely. UI flow has anti-bot timing issues that
 * make form fill unreliable; the API contract is stable.
 *
 * Discovered via Chrome DevTools MCP network inspection:
 *   POST https://cognito-idp.eu-west-1.amazonaws.com/
 *   X-Amz-Target: AWSCognitoIdentityProviderService.ConfirmForgotPassword
 *   { Username, ConfirmationCode, Password, ClientId }
 *
 * Same endpoint AWS Amplify uses on the frontend — production-grade contract.
 *
 * Retries on 5xx and 429 (TooManyRequests, LimitExceeded). Never retries 4xx —
 * those (CodeMismatch, InvalidParameter, etc.) are deterministic failures.
 */
export async function confirmForgotPassword(
  params: ConfirmForgotPasswordParams,
): Promise<void> {
  validateParams(params);
  if (!CLIENT_ID) {
    throw new Error(
      "INVESTOWN_COGNITO_CLIENT_ID not set in .env — see .env.example",
    );
  }
  const ctx = await request.newContext();
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
      const res = await ctx.post(COGNITO_URL, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target":
            "AWSCognitoIdentityProviderService.ConfirmForgotPassword",
        },
        data: {
          Username: params.username,
          ConfirmationCode: params.confirmationCode,
          Password: params.newPassword,
          ClientId: CLIENT_ID,
        },
      });
      if (res.ok()) return;
      // Retry only on transient errors. 4xx is deterministic — abort.
      const transient = res.status() >= 500 || res.status() === 429;
      if (!transient || attempt === MAX_ATTEMPTS - 1) {
        await throwCognitoError(res, params.username);
      }
    }
  } finally {
    await ctx.dispose().catch((e: Error) => {
      console.warn(`cognito ctx.dispose failed: ${e.message}`);
    });
  }
}

function validateParams(params: ConfirmForgotPasswordParams): void {
  if (!params.username) throw new Error("username required");
  if (!params.confirmationCode) throw new Error("confirmationCode required");
  if (!params.newPassword) throw new Error("newPassword required");
}

async function throwCognitoError(
  res: APIResponse,
  username: string,
): Promise<never> {
  const body = await res
    .text()
    .catch((e: Error) => `<body read failed: ${e.message}>`);
  const requestId = res.headers()["x-amzn-requestid"] ?? "unknown";
  throw new Error(
    `Cognito ConfirmForgotPassword failed for ${username}: ` +
      `${res.status()} ${res.statusText()} (reqId=${requestId}) ${body}`,
  );
}

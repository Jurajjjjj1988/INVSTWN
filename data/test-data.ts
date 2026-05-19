const env = (name: string): string => process.env[name] ?? "REPLACE_IN_ENV";

export const TEST_DATA = {
  SIGN_UP: {
    EMAIL: env("INVESTOWN_EMAIL"),
    PASSWORD: env("INVESTOWN_PASSWORD"),
    FIRST_NAME: env("INVESTOWN_FIRST_NAME"),
    LAST_NAME: env("INVESTOWN_LAST_NAME"),
    // Single source of truth — full E.164 phone. Country code / national number
    // are derived where needed (no duplicate hardcoded values).
    PHONE: env("INVESTOWN_PHONE"),
  },
  URLS: {
    SIGN_UP_EMAIL: "/sign-up/email",
    SIGN_UP_PHONE: "/sign-up/phone",
    SIGN_IN: "/sign-in",
    FORGOT_PASSWORD: "/forgotten-password",
    DASHBOARD: "/",
    VERIFICATION_PROVIDER: "/user/verification/verification-provider",
    VERIFICATION_VERIFF: "/user/verification/veriff",
    SIGN_UP_BUSINESS: "/sign-up/legal-entity/email",
  },
} as const;

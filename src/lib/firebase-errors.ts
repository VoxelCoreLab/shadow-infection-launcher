const INVALID_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/user-not-found",
  "auth/wrong-password",
]);

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code: unknown };
    return typeof code === "string" ? code : "";
  }
  return "";
}

export function mapFirebaseError(error: unknown): string {
  const code = errorCode(error);

  if (INVALID_CREDENTIAL_CODES.has(code)) {
    return "Invalid email or password.";
  }

  switch (code) {
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    default:
      return "Login failed. Please try again.";
  }
}

const GOOGLE_LOGIN_ERRORS: Record<string, string> = {
  failed: "Google sign-in failed. Please try again.",
  timeout: "Google sign-in timed out. Please try again.",
  unavailable: "Google sign-in is not configured.",
  too_many: "Too many sign-in attempts. Wait a minute and try again.",
};

export const GOOGLE_SIGN_IN_FAILED = GOOGLE_LOGIN_ERRORS.failed;
export const GOOGLE_SIGN_IN_TIMEOUT = GOOGLE_LOGIN_ERRORS.timeout;
export const GOOGLE_SIGN_IN_UNAVAILABLE = GOOGLE_LOGIN_ERRORS.unavailable;
export const GOOGLE_SIGN_IN_TOO_MANY = GOOGLE_LOGIN_ERRORS.too_many;

export function mapGoogleLoginError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const known = GOOGLE_LOGIN_ERRORS[message];
  if (known) {
    return known;
  }

  switch (errorCode(error)) {
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    default:
      return GOOGLE_SIGN_IN_FAILED;
  }
}

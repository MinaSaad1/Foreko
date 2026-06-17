import pkg from"../../package.json";

export const APP_VERSION: string = pkg.version;

// Injected at build time by vite.config.ts (`git rev-parse --short HEAD`).
// Falls back to "dev" in the dev server or when git is unavailable.
export const GIT_SHA: string =
 (import.meta.env.VITE_GIT_SHA as string | undefined) || "dev";

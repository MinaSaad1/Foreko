import { toast as sonnerToast } from "sonner";
import { ApiError } from "@/api/client";

function friendlyFromApiError(err: ApiError): string {
  if (err.status === 0 || err.status === 503 || err.status === 502) {
    return "Can't reach the Foresee backend. Is it running?";
  }
  if (err.status === 413) {
    return "That file is too large. Foresee accepts CSVs up to 50 MB.";
  }
  if (err.status === 415) {
    return "That file isn't a CSV. Please upload a .csv file.";
  }
  if (err.status === 404) {
    return "That resource wasn't found. It may have expired — try uploading again.";
  }
  if (err.status >= 500) {
    return "Something went wrong on the backend. Check the log file or restart Foresee.";
  }
  if (err.message && err.message.length < 200) {
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    return friendlyFromApiError(err);
  }
  if (err instanceof Error) {
    if (err.message.length < 200) return err.message;
  }
  return "Something went wrong. Please try again.";
}

type ToastOpts = { description?: string; duration?: number };

export const toast = {
  success: (message: string, opts?: ToastOpts): void => {
    sonnerToast.success(message, opts);
  },
  error: (err: unknown, opts?: ToastOpts): void => {
    sonnerToast.error(friendlyError(err), opts);
  },
  info: (message: string, opts?: ToastOpts): void => {
    sonnerToast.info(message, opts);
  },
  raw: sonnerToast,
};

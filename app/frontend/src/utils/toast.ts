import { toast as sonnerToast } from"sonner";
import { ApiError } from"@/api/client";

interface Pattern {
 match: RegExp;
 text: string;
}

const PATTERNS_422: Pattern[] = [
 {
 match: /rows have unparseable dates/i,
 text: "Some dates in your CSV couldn't be parsed. Check for blanks or unexpected formats in the date column.",
 },
 {
 match: /rows have non-numeric/i,
 text: "The value column has non-numeric entries. Remove them or pick a different column.",
 },
 {
 match: /Value column .* not found/i,
 text: "That column doesn't exist in the CSV. Refresh and pick it again.",
 },
 {
 match: /Could not parse month values/i,
 text: "Some month entries weren't recognized. Use numbers (1-12) or month names (Jan, January).",
 },
 {
 match: /at least two columns/i,
 text: "Your CSV needs at least two columns: a date column and a numeric value column.",
 },
 {
 match: /at least 10 rows/i,
 text: "This CSV is too short. Foreko needs at least 10 rows to forecast.",
 },
 {
 match: /numeric column/i,
 text: "Foreko couldn't find a numeric column to forecast. Add one or reshape your data.",
 },
 {
 match: /duplicate timestamps/i,
 text: "Your series has duplicate timestamps. Aggregate to one row per period before uploading.",
 },
 {
 match: /constant \(every row is the same number\)/i,
 text: "The value column never changes, so there's nothing to forecast. Pick a column with variation.",
 },
 {
 match: /CSV exceeds/i,
 text: "That file is too large. Foreko accepts CSVs up to 50 MB.",
 },
 {
 match: /Empty file/i,
 text: "That CSV looks empty.",
 },
];

function humanize422(detail: string): string | null {
 for (const pattern of PATTERNS_422) {
 if (pattern.match.test(detail)) return pattern.text;
 }
 return null;
}

function friendlyFromApiError(err: ApiError): string {
 if (err.status === 0 || err.status === 503 || err.status === 502) {
 return"Can't reach the Foreko backend. Is it running?";
 }
 if (err.status === 413) {
 return"That file is too large. Foreko accepts CSVs up to 50 MB.";
 }
 if (err.status === 415) {
 return"That file isn't a CSV. Please upload a .csv file.";
 }
 if (err.status === 404) {
 return"That resource wasn't found. It may have expired. Try uploading again.";
 }
 if (err.status === 422) {
 const humane = humanize422(err.message ?? "");
 if (humane) return humane;
 if (err.message && err.message.length < 200) return err.message;
 return"Foreko couldn't read that CSV. Check the shape of the file and try again.";
 }
 if (err.status >= 500) {
 // Prefer the backend's actual reason (our global handler always fills in
 // `detail`) over a generic fallback, so users see WHY the request failed.
 const humane = humanize422(err.message ?? "");
 if (humane) return humane;
 if (err.message && err.message.length < 300 && err.message !== "Internal Server Error") {
 return err.message;
 }
 return"Something went wrong on the backend. Check the log file or restart Foreko.";
 }
 if (err.message && err.message.length < 200) {
 return err.message;
 }
 return"Something went wrong. Please try again.";
}

export function friendlyError(err: unknown): string {
 if (err instanceof ApiError) {
 return friendlyFromApiError(err);
 }
 if (err instanceof Error) {
 if (err.message.length < 200) return err.message;
 }
 return"Something went wrong. Please try again.";
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

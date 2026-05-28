import { useEffect, useRef } from"react";
import type { JobStatusEvent } from"@/types/finetune";

export function useJobEvents(
 jobId: string | null,
 onEvent: (event: JobStatusEvent) => void,
): { close: () => void } {
 const esRef = useRef<EventSource | null>(null);
 const onEventRef = useRef(onEvent);
 onEventRef.current = onEvent;

 const closeRef = useRef<() => void>(() => {
 esRef.current?.close();
 esRef.current = null;
 });

 useEffect(() => {
 if (!jobId) return;

 function connect() {
 const es = new EventSource(`/api/finetune/jobs/${jobId}/events`);
 esRef.current = es;

 const handleMessage = (raw: MessageEvent, type?: string) => {
 try {
 const data = JSON.parse(raw.data) as Omit<JobStatusEvent, "type">;
 const event = { ...data, type: type ?? "log" } as JobStatusEvent;
 onEventRef.current(event);
 if (event.type === "done" || event.type === "error") {
 es.close();
 esRef.current = null;
 }
 } catch {
 // ignore malformed events
 }
 };

 es.addEventListener("progress", (e) => handleMessage(e as MessageEvent, "progress"));
 es.addEventListener("epoch", (e) => handleMessage(e as MessageEvent, "epoch"));
 es.addEventListener("log", (e) => handleMessage(e as MessageEvent, "log"));
 es.addEventListener("done", (e) => handleMessage(e as MessageEvent, "done"));
 es.addEventListener("error_event", (e) => handleMessage(e as MessageEvent, "error"));

 es.onerror = () => {
 if (es.readyState === EventSource.CLOSED) return;
 es.close();
 esRef.current = null;
 const timer = setTimeout(() => {
 if (esRef.current === null) connect();
 }, 2000);
 return () => clearTimeout(timer);
 };
 }

 connect();

 return () => {
 esRef.current?.close();
 esRef.current = null;
 };
 }, [jobId]);

 return { close: closeRef.current };
}

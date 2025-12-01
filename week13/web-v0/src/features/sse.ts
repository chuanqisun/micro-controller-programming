import { Observable } from "rxjs";

/**
 * Creates and returns an observable that emits parsed JSON SSE messages
 * Automatically reconnects on errors
 */
export function createSSEObservable(url: string): Observable<any> {
  return new Observable((observer) => {
    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          observer.next(message);
        } catch (error) {
          observer.error(new Error(`Failed to parse SSE message: ${error}`));
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        observer.error(error);
      };
    };

    connect();

    // Cleanup on unsubscribe
    return () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  });
}

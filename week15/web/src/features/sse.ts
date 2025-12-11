import { Observable, retry, timer } from "rxjs";

/**
 * Creates and returns an observable that emits parsed JSON SSE messages
 * Automatically reconnects on errors with 3 second retry interval
 */
export function createSSEObservable(url: string): Observable<any> {
  return new Observable((observer) => {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log("SSE connection established");
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        observer.next(message);
      } catch (error) {
        console.error("Failed to parse SSE message:", error);
        // Don't close connection on parse errors, just log and continue
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      observer.error(error);
    };

    // Cleanup on unsubscribe
    return () => {
      eventSource.close();
    };
  }).pipe(
    retry({
      delay: (error, retryCount) => {
        console.log(`Reconnecting in 3 seconds... (Attempt ${retryCount})`);
        return timer(3000);
      },
    })
  );
}

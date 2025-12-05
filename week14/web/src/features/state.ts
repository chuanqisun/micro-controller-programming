import { Observable, Subject } from "rxjs";
import type { AppState } from "../../../server/features/state";

export const state$ = new Subject<AppState>();
export interface StateChange {
  previous: AppState | undefined;
  current: AppState;
}

export const stateChange$: Observable<StateChange> = new Observable((subscriber) => {
  let previousState: AppState | undefined = undefined;
  state$.subscribe((currentState) => {
    subscriber.next({ previous: previousState, current: currentState });
    previousState = currentState;
  });

  return () => state$.unsubscribe();
});

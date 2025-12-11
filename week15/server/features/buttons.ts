import { filter, map, merge, type Observable, scan } from "rxjs";

// Button state machine
// States: "idle" | "one" | "both"
// - idle: no buttons pressed
// - one: exactly one button pressed (could transition to both or back to idle)
// - both: both buttons pressed
//
// Transitions:
// idle -> one: one button pressed
// idle -> both: both buttons pressed simultaneously
// one -> idle: the pressed button released => emit oneButtonUp
// one -> both: second button pressed
// both -> one: one button released (partial release, no emit yet)
// both -> idle: both buttons released => emit twoButtonUp (even if via "one" state)

type ButtonState = "idle" | "one" | "both";

type ButtonInput = { btn1: boolean; btn2: boolean };
type ButtonEvent = "oneUp" | "twoUp" | null;

interface ButtonStateAcc {
  state: ButtonState;
  wasInBoth: boolean;
  event: ButtonEvent;
}

export function createButtonStateMachine(buttons$: Observable<ButtonInput>) {
  const buttonState$ = buttons$.pipe(
    scan(
      (acc, curr): ButtonStateAcc => {
        const prevState = acc.state;
        const bothDown = curr.btn1 && curr.btn2;
        const oneDown = (curr.btn1 || curr.btn2) && !bothDown;

        let newState: ButtonState;
        if (bothDown) {
          newState = "both";
        } else if (oneDown) {
          newState = "one";
        } else {
          newState = "idle";
        }

        // Track if we've ever been in "both" state during this press sequence
        const wasInBoth = acc.wasInBoth || newState === "both";

        // Determine what event to emit
        let event: ButtonEvent = null;
        if (newState === "idle" && prevState !== "idle") {
          // Transitioning to idle - determine which event based on history
          if (wasInBoth) {
            event = "twoUp";
          } else {
            event = "oneUp";
          }
        }

        return {
          state: newState,
          wasInBoth: newState === "idle" ? false : wasInBoth, // Reset when returning to idle
          event,
        };
      },
      { state: "idle" as ButtonState, wasInBoth: false, event: null as ButtonEvent }
    )
  );

  const oneButtonUp$ = buttonState$.pipe(
    filter((s) => s.event === "oneUp"),
    map(() => void 0)
  );

  const twoButtonUp$ = buttonState$.pipe(
    filter((s) => s.event === "twoUp"),
    map(() => void 0)
  );

  const someButtonDown$ = buttons$.pipe(filter(({ btn1, btn2 }) => btn1 || btn2));

  const leaveIdle$ = buttonState$.pipe(
    scan((prev, curr) => ({ prevState: prev.currState, currState: curr.state }), {
      prevState: "idle" as ButtonState,
      currState: "idle" as ButtonState,
    }),
    filter(({ prevState }) => prevState === "idle"),
    map(() => void 0)
  );

  const enterIdle$ = merge(oneButtonUp$, twoButtonUp$);

  return {
    oneButtonUp$,
    twoButtonUp$,
    someButtonDown$,
    leaveIdle$,
    enterIdle$,
  };
}

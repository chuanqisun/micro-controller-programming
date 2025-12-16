import { BehaviorSubject } from "rxjs";

/** When true, LED state updates are suppressed (used during dice roll animation) */
export const ledStateUpdateEnabled$ = new BehaviorSubject<boolean>(true);

export type ConnectionStatus = "connected" | "busy" | "disconnected";

/**
 * State for a single operator device.
 * Each operator is identified by its MAC address and can have its own UDP address for audio streaming.
 */
export interface OperatorState {
  /** BLE MAC address - unique identifier for the device */
  mac: string;
  /** Connection status of this operator */
  connection: ConnectionStatus;
  /** UDP address (ip:port) for audio streaming to/from this operator */
  address: string;
  /** Current probe number (0-7) */
  probeNum: number;
  /** Button 1 state */
  btn1: boolean;
  /** Button 2 state */
  btn2: boolean;
}

/**
 * Creates a default operator state for a given MAC address.
 */
export function createDefaultOperatorState(mac: string): OperatorState {
  return {
    mac,
    connection: "disconnected",
    address: "",
    probeNum: 7,
    btn1: false,
    btn2: false,
  };
}

export type LEDStatus = "off" | "fadeon" | "blinkon" | "pulseon";
export type AudioOutputMode = "controller" | "laptop" | "both";

export interface AppState {
  aiConnection: ConnectionStatus;
  swConnection: ConnectionStatus;
  /** Array of operator devices - scalable for 2+ operators */
  operators: OperatorState[];
  /** Index of the currently active operator for audio I/O (0-based) */
  activeOperatorIndex: number;
  /** LED states for all 7 LEDs - array index is LED id (0-6) */
  leds: LEDStatus[];
  /** Audio output routing mode */
  audioOutputMode: AudioOutputMode;
  // Text adventure state
  storyHistory: string[];
}

/**
 * Helper to get the active operator state, or undefined if no operators or invalid index.
 */
export function getActiveOperator(state: AppState): OperatorState | undefined {
  return state.operators[state.activeOperatorIndex];
}

/**
 * Helper to find an operator by MAC address.
 */
export function findOperatorByMac(state: AppState, mac: string): OperatorState | undefined {
  return state.operators.find((op) => op.mac === mac);
}

/**
 * Helper to find an operator index by MAC address.
 */
export function findOperatorIndexByMac(state: AppState, mac: string): number {
  return state.operators.findIndex((op) => op.mac === mac);
}

/**
 * Helper to check if an operator is active (connected and has a UDP address).
 */
export function isOperatorActive(op: OperatorState): boolean {
  return op.connection === "connected" && op.address !== "";
}

/**
 * Helper to get all active operators.
 */
export function getActiveOperators(state: AppState): OperatorState[] {
  return state.operators.filter(isOperatorActive);
}

/**
 * Helper to get indices of all active operators.
 */
export function getActiveOperatorIndices(state: AppState): number[] {
  return state.operators
    .map((op, index) => ({ op, index }))
    .filter(({ op }) => isOperatorActive(op))
    .map(({ index }) => index);
}

/**
 * Helper to update a specific operator by index.
 */
export function updateOperatorByIndex(state: AppState, index: number, updateFn: (op: OperatorState) => OperatorState): AppState {
  if (index < 0 || index >= state.operators.length) return state;
  const newOperators = [...state.operators];
  newOperators[index] = updateFn(newOperators[index]);
  return { ...state, operators: newOperators };
}

/**
 * Helper to update a specific operator by MAC address.
 */
export function updateOperatorByMac(state: AppState, mac: string, updateFn: (op: OperatorState) => OperatorState): AppState {
  const index = findOperatorIndexByMac(state, mac);
  if (index === -1) return state;
  return updateOperatorByIndex(state, index, updateFn);
}

// Helper to create default LED states (all off)
export function createDefaultLEDStates(): LEDStatus[] {
  return Array(7).fill("off" as LEDStatus);
}

// Initial state with empty operators array - operators will be registered in main.ts
export const appState$ = new BehaviorSubject<AppState>({
  aiConnection: "disconnected",
  swConnection: "disconnected",
  operators: [],
  activeOperatorIndex: 0,
  leds: createDefaultLEDStates(),
  audioOutputMode: "both",
  storyHistory: [],
});

export function updateState(updateFn: (state: AppState) => AppState) {
  const currentState = appState$.getValue();
  const newState = updateFn(currentState);
  if (JSON.stringify(currentState) === JSON.stringify(newState)) return;

  appState$.next(newState);
}

/**
 * Update a single LED state by ID (array index).
 * Respects ledStateUpdateEnabled$ flag - when disabled, updates are ignored.
 */
export function updateLEDState(ledId: number, status: LEDStatus) {
  if (!ledStateUpdateEnabled$.value) return;
  updateState((state) => {
    const newLeds = [...state.leds];
    newLeds[ledId] = status;
    return { ...state, leds: newLeds };
  });
}

/**
 * Update all LED states at once.
 */
export function updateAllLEDStates(ledStates: LEDStatus[]) {
  updateState((state) => ({
    ...state,
    leds: ledStates,
  }));
}

/**
 * Turn all LEDs off in state.
 */
export function turnOffAllLEDStates() {
  updateState((state) => ({
    ...state,
    leds: Array(7).fill("off" as LEDStatus),
  }));
}

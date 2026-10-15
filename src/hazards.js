// Stage hazards. Filled in by the stages change.

export function newHazardState(stage) {
  return { list: [], timers: [] };
}

export function updateHazards(state, stage) {}

// The cause if a stage hazard eliminates p right now, else null.
export function hazardKill(state, p) {
  return null;
}

const timers = new Set();

export function registerTimer(timer) {
  timers.add(timer);
  return timer;
}

export function clearAllTimers() {
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.clear();
}

export function getTimerCount() {
  return timers.size;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

export class CircuitBreaker {
  constructor(options = {}) {
    this._failureThreshold = options.failureThreshold || 5;
    this._cooldownMs = options.cooldownMs || 30000;
    this._halfOpenMaxRequests = options.halfOpenMaxRequests || 3;
    this._timeoutMs = options.timeoutMs || 10000;
    this._state = STATES.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = 0;
    this._halfOpenRequests = 0;
  }

  getState() {
    return this._state;
  }

  async call(fn) {
    if (this._state === STATES.OPEN) {
      const now = Date.now();
      if (now - this._lastFailureTime >= this._cooldownMs) {
        this._state = STATES.HALF_OPEN;
        this._halfOpenRequests = 0;
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN. Cooldown remaining: ${Math.ceil((this._cooldownMs - (now - this._lastFailureTime)) / 1000)}s`
        );
      }
    }

    if (this._state === STATES.HALF_OPEN && this._halfOpenRequests >= this._halfOpenMaxRequests) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker is HALF_OPEN and max test requests (${this._halfOpenMaxRequests}) reached`
      );
    }

    this._halfOpenRequests++;

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Circuit breaker timeout'));
      }, this._timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutId);
      this.onSuccess();
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this._failureCount = 0;
    this._successCount++;
    if (this._state === STATES.HALF_OPEN) {
      if (this._successCount >= this._halfOpenMaxRequests) {
        this._state = STATES.CLOSED;
        this._halfOpenRequests = 0;
      }
    } else {
      this._halfOpenRequests = 0;
    }
  }

  onFailure() {
    this._failureCount++;
    this._successCount = 0;
    this._lastFailureTime = Date.now();
    if (this._state === STATES.HALF_OPEN) {
      this._state = STATES.OPEN;
    } else if (this._failureCount >= this._failureThreshold) {
      this._state = STATES.OPEN;
    }
  }

  reset() {
    this._state = STATES.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = 0;
    this._halfOpenRequests = 0;
  }
}

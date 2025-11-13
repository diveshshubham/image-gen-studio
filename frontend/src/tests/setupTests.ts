// src/tests/setupTests.ts
import '@testing-library/jest-dom/extend-expect';

// Simple AbortController polyfill for the jsdom test environment
if (typeof (globalThis as any).AbortController === 'undefined') {
  (globalThis as any).AbortController = class {
    signal: any;
    aborted = false;
    constructor() {
      this.signal = { aborted: false, addEventListener: () => {}, removeEventListener: () => {} };
    }
    abort() {
      this.aborted = true;
      (this.signal as any).aborted = true;
    }
  };
}

module.exports = {
    // ...existing config...
    setupFilesAfterEnv: ['<rootDir>/src/tests/setupTests.ts'],
    testEnvironment: 'jsdom',
    collectCoverage: true,
    coverageDirectory: 'coverage',
  };
  
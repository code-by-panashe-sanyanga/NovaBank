/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  setupFiles: ["<rootDir>/tests/setupEnv.ts"],
  collectCoverageFrom: [
    "middleware/**/*.ts",
    "services/**/*.ts",
    "config/**/*.ts",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 45,
      lines: 50,
      statements: 50,
    },
  },
};

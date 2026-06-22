/**
 * Standalone Jest config for SMART-ARF unit tests.
 *
 * This config is intentionally SELF-CONTAINED so the tests/ tree can be run
 * without editing the project root package.json or babel config (which the app
 * build agent owns). It:
 *   - strips TypeScript types via @babel/preset-typescript (already in node_modules)
 *   - converts ESM import/export to CommonJS via @babel/plugin-transform-modules-commonjs
 *   - disables all external babel config lookup (babelrc / configFile)
 *   - maps the "@/..." alias to the project root, mirroring tsconfig.paths
 *
 * Run from the project root:
 *   npx --yes jest@29 --config tests/jest.config.js
 */
module.exports = {
  rootDir: '.',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../$1',
  },
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: ['@babel/preset-typescript'],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  // Avoid picking up any root-level babel/jest config byproducts.
  clearMocks: true,
};

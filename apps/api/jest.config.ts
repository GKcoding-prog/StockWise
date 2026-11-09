import type { Config } from 'jest';

const shared: Config = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  // The generated Prisma client imports './x.js'; resolve those to the .ts sources.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
};

const config: Config = {
  projects: [
    { ...shared, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...shared,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      testTimeout: 60_000,
    },
  ],
};

export default config;

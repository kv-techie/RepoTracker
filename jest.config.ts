import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const customConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testMatch: ['**/__tests__/**/*.{ts,tsx}'],
  collectCoverageFrom: ['lib/**/*.ts', 'components/**/*.tsx'],
};

export default createJestConfig(customConfig);

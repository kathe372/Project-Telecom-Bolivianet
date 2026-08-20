export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.module.ts',
    '!main.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      branches:   70,
      functions:  80,
      lines:      80,
      statements: 80,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@common/(.*)$':   '<rootDir>/common/$1',
    '^@config/(.*)$':   '<rootDir>/config/$1',
    '^@modules/(.*)$':  '<rootDir>/modules/$1',
    '^@database/(.*)$': '<rootDir>/database/$1',
  },
};

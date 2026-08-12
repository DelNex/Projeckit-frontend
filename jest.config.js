/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  testMatch: ['**/__tests__/**/*.spec.[jt]s', '**/?(*.)+(spec|test).[jt]s?(x)'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: ['/node_modules/'],
  globals: {
    API_BASE_URL_RAW: '',
    'process.env.API_BASE_URL': '',
  },
};

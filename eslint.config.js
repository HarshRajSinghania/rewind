// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['android/*', 'ios/*', 'dist/*', 'coverage/*', 'node_modules/*', '.expo/*'],
  },
  {
    rules: {
      // React Compiler rules. The app doesn't use the compiler, and these flag patterns it
      // relies on on purpose: Reanimated shared-value writes (`sv.value = …`) and refs that
      // mirror state for callbacks (the timelapse player's JS-side truth). Revisit before
      // turning the compiler on.
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['__tests__/**', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      // Inline jest.mock factories are anonymous components by nature.
      'react/display-name': 'off',
    },
  },
]);

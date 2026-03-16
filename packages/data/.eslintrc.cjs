// Simplified copyright header format - line comment at file start
const currentYear = new Date().getFullYear();

module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['header'],
  rules: {
    'header/header': [
      'error',
      'line',
      ` © ${currentYear} Adobe. MIT License. See /LICENSE for details.`
    ],
    '@typescript-eslint/no-explicit-any': 'off',  // Allow 'any' type
    '@typescript-eslint/no-non-null-assertion': 'off',  // Allow non-null assertions
    '@typescript-eslint/ban-types': 'off', // Disable banning of certain types
    '@typescript-eslint/no-empty-function': 'off', // Allow empty functions
    '@typescript-eslint/no-unused-vars': 'off', // Allow unused variables
    '@typescript-eslint/no-namespace': 'off', // Namespaces used for API organization (Database.Plugin, etc.)
  },
  ignorePatterns: ['.eslintrc.cjs', 'docs', 'dist', 'tests', 'vite.config.js'],  // Updated ignore patterns
};

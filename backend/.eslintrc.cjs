module.exports = {
  env: { node: true, es2022: true, jest: true },
  extends: ["eslint:recommended"],
  ignorePatterns: ["node_modules/", "coverage/"],
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};

// Used in benchmark and tests to automatically compile Typescript
// files when they are required
require("@babel/register")({
  extensions: [".ts"],
  plugins: [
    ["babel-plugin-macros", { "typecheck": { "registerAcrossFiles": false } }],
    "@babel/plugin-transform-typescript",
    "@babel/plugin-transform-modules-commonjs",
  ],
});

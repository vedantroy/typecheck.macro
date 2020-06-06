// Used in benchmark and tests to automatically compile Typescript
// files when they are required
require("@babel/register")({
  extensions: [".ts"],
  presets: ["@babel/preset-typescript"],
  plugins: [
    "babel-plugin-macros",
    "@babel/plugin-transform-modules-commonjs",
  ],
});

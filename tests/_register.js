// The filename starts with an underscore so Ava will ignore it
// https://github.com/avajs/ava/blob/master/docs/05-command-line.md
require("@babel/register")({
  extensions: [".ts"],
  plugins: [
    "babel-plugin-macros",
    "@babel/plugin-transform-typescript",
    "@babel/plugin-transform-modules-commonjs",
  ],
  presets: ["babel-preset-power-assert"],
});

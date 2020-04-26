require("@babel/register")({
  extensions: [".ts"],
  plugins: [
		"babel-plugin-macros",
		"@babel/plugin-transform-typescript",
    "@babel/plugin-transform-modules-commonjs",
  ],
});

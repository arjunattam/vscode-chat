//@ts-check
const path = require("path");
const webpack = require("webpack");

/** @type webpack.Configuration */

const config = {
  mode: "production",
  entry: "./src/extension.ts",
  devtool: "source-map",
  target: "node",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: "ts-loader", options: { allowTsInNodeModules: true } }
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".json"]
  },
  output: {
    filename: "extension.js",
    path: path.resolve(__dirname, "out"),
    libraryTarget: "commonjs"
  },
  externals: {
    vscode: "commonjs vscode"
  },
  plugins: [new webpack.IgnorePlugin(/^electron$/)]
};

module.exports = config;

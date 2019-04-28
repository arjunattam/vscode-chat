//@ts-check
const path = require("path");
const webpack = require("webpack");

/** @type webpack.Configuration */

const config = {
  entry: "./src/extension.ts",
  mode: "production",
  devtool: "source-map",
  target: "node",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader"
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".js", ".json"]
  },
  output: {
    filename: "extension.js",
    path: path.resolve(__dirname, "out"),
    libraryTarget: "commonjs2"
  },
  externals: {
    vscode: "commonjs vscode"
  }
};

module.exports = config;

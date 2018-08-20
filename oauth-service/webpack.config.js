const path = require("path");
const slsw = require("serverless-webpack");

const entries = {};

Object.keys(slsw.lib.entries).forEach(
  key => (entries[key] = ["./source-map-install.js", slsw.lib.entries[key]])
);

module.exports = {
  mode: slsw.lib.webpack.isLocal ? "development" : "production",
  entry: entries,
  devtool: "source-map",
  resolve: {
    extensions: [".js", ".jsx", ".json", ".ts", ".tsx", ".html"]
  },
  output: {
    libraryTarget: "commonjs",
    path: path.join(__dirname, ".webpack"),
    filename: "[name].js"
  },
  target: "node",
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader" },
      { test: /\.html$/, loader: "html-loader" }
    ]
  }
};

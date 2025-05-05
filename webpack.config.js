//@ts-check

'use strict';

const path = require('path');
// const CopyPlugin = require("copy-webpack-plugin");

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node', // VSCode extensions run in Node
  mode: 'none', 
  entry: {
    extension: './src/extension.ts',
    'renderer/treeRenderer': './src/renderer/treeRenderer.ts'
    // 'media/anselmoChat': './src/media/anselmoChat.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2'
  },
  devtool: 'nosources-source-map',
  externals: {
    // the vscode-module is created on-the-fly and must be excluded.
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  // plugins: [
  //   new CopyPlugin({
  //     patterns: [
  //       { from: "src/media", to: "media" },
  //     ],
  //   }),
  // ],
};

module.exports = config;

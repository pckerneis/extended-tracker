const path = require('path');

module.exports = {
  entry: './src/web/index.ts',
  devtool: 'source-map',
  mode: 'development',
  optimization: {
    minimize: false
  },
  devServer: {
    writeToDisk: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: [/node_modules/, '/test/'],
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js', '.html' ],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, './dist/web'),
  },
};

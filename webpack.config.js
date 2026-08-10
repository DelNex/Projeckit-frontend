const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const glob = require("glob");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const INCLUDE_PATTERN =
  /<include\s+src=["'](.+?)["']\s*\/?>\s*(?:<\/include>)?/gis;

const processNestedHtml = (content, loaderContext, dir = null) =>
  !INCLUDE_PATTERN.test(content)
    ? content
    : content.replace(INCLUDE_PATTERN, (m, src) => {
        const filePath = path.resolve(dir || loaderContext.context, src);
        loaderContext.dependency(filePath);
        return processNestedHtml(
          loaderContext.fs.readFileSync(filePath, "utf8"),
          loaderContext,
          path.dirname(filePath),
        );
      });

// HTML generation
const paths = [];
const parseEnvFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return {};
    return fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .reduce((result, line) => {
        const [key, ...rest] = line.split("=");
        if (!key) return result;
        result[key.trim()] = rest.join("=").trim();
        return result;
      }, {});
  } catch (e) {
    return {};
  }
};

const envConfig = parseEnvFile(path.resolve(__dirname, ".env"));
const rawBaseUrl = envConfig.API_BASE_URL || process.env.API_BASE_URL || '';
const apiBaseUrl = rawBaseUrl
  ? (/^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : `https://${rawBaseUrl}`)
  : 'https://projectkit-backend-production.up.railway.app';

const generateHTMLPlugins = () =>
  glob.sync("./src/*.html").map((dir) => {
    const filename = path.basename(dir);

    if (filename !== "404.html") {
      paths.push(filename);
    }

    return new HtmlWebpackPlugin({
      filename,
      template: `./src/${filename}`,
      favicon: `./src/images/favicon.ico`,
      inject: "body",
    });
  });

module.exports = {
  mode: "development",
  entry: "./src/js/index.js",
  devServer: {
    static: {
      directory: path.join(__dirname, "./build"),
    },
    compress: true,
    port: 3001,
    hot: true,
    proxy: [
      {
        context: ['/api', '/health'],
        target: apiBaseUrl || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    ],
  },
  module: {
    rules: [
      // Strip sourceMappingURL from node_modules packages to avoid browser 404 warnings for missing source maps.
      {
        test: /\.m?js$/,
        include: /node_modules/,
        use: [
          {
            loader: 'string-replace-loader',
            options: {
              search: /\/(?:\/|\*)# sourceMappingURL=.*?(?:\*\/)?$/gm,
              replace: '',
            },
          },
        ],
      },

      // Keep the existing Lit-specific workaround for any file path edge cases.
      {
        test: /node_modules\/@lit\/reactive-element\/development\/reactive-element\.js$/,
        use: [
          {
            loader: 'string-replace-loader',
            options: {
              search: '//# sourceMappingURL=reactive-element.js.map',
              replace: '',
            },
          },
        ],
      },

      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          "css-loader",
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                plugins: [
                  require("autoprefixer")({
                    overrideBrowserslist: ["last 2 versions"],
                  }),
                ],
              },
            },
          },
        ],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: "asset/resource",
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: "asset/resource",
      },
      {
        test: /\.html$/,
        loader: "html-loader",
        options: {
          preprocessor: processNestedHtml,
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
      'API_BASE_URL_RAW': JSON.stringify(apiBaseUrl),
    }),
    ...generateHTMLPlugins(),
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash].css",
      chunkFilename: "[name].[contenthash].css",
    }),
  ],
  output: {
    filename: "[name].[contenthash].js",
    path: path.resolve(__dirname, "build"),
    clean: true,
    assetModuleFilename: "[path][name][ext]",
  },
  target: "web", // fix for "browserslist" error message
  stats: "errors-only", // suppress irrelevant log messages
};

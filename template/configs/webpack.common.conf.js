const path = require('path');
const fs = require('fs-extra');
const webpack = require('webpack');
const config = require('./config');
const helper = require('./helper');
const glob = require('glob');
const vueLoaderConfig = require('./vue-loader.conf');
const vueWebTemp = helper.rootNode(config.templateDir);
const hasPluginInstalled = fs.existsSync(helper.rootNode(config.pluginFilePath));
const isWin = /^win/.test(process.platform);
{{#router}}
const weexEntry = {
  'index': helper.root('entry.js')
}
{{else}}
const webEntry = {};
const weexEntry = {};
{{/router}}

{{#router}}
const getEntryFileContent = (source, routerpath) => {
  let dependence = `import Vue from 'vue'\n`;
  dependence += `import weex from 'weex-vue-render'\n`;
  let relativePluginPath = helper.rootNode(config.pluginFilePath);
  let entryContents = fs.readFileSync(source).toString();
  let contents = '';
  entryContents = dependence + entryContents;
  entryContents = entryContents.replace(/\/\* weex initialized/, match => `weex.init(Vue)\n${match}`);
  if (isWin) {
    relativePluginPath = relativePluginPath.replace(/\\/g, '\\\\');
  }
  if (hasPluginInstalled) {
    contents += `\n// If detact plugins/plugin.js is exist, import and the plugin.js\n`;
    contents += `import plugins from '${relativePluginPath}';\n`;
    contents += `plugins.forEach(function (plugin) {\n\tweex.install(plugin)\n});\n\n`;
    entryContents = entryContents.replace(/\.\/router/, routerpath);
    entryContents = entryContents.replace(/weex\.init/, match => `${contents}${match}`);
  }
  return entryContents;
}

const getRouterFileContent = (source) => {
  const dependence = `import Vue from 'vue'\n`;
  let routerContents = fs.readFileSync(source).toString();
  routerContents = dependence + routerContents;
  return routerContents;
}

const getEntryFile = () => {
  const entryFile = path.join(vueWebTemp, config.entryFilePath)
  const routerFile = path.join(vueWebTemp, config.routerFilePath)
  fs.outputFileSync(entryFile, getEntryFileContent(helper.root(config.entryFilePath), routerFile));
  fs.outputFileSync(routerFile, getRouterFileContent(helper.root(config.routerFilePath)));
  return {
    index: entryFile
  }
}

// The entry file for web needs to add some library. such as vue, weex-vue-render
// 1. src/entry.js 
// import Vue from 'vue';
// import weex from 'weex-vue-render';
// weex.init(Vue);
// 2. src/router/index.js
// import Vue from 'vue'
const webEntry = getEntryFile();
{{else}}
// Wraping the entry file for web.
const getWebEntryFileContent = (entryPath, vueFilePath) => {
  let relativeVuePath = path.relative(path.join(entryPath, '../'), vueFilePath);
  let relativeEntryPath = helper.root(config.entryFilePath);
  let relativePluginPath = helper.rootNode(config.pluginFilePath);

  let contents = '';
  let entryContents = fs.readFileSync(relativeEntryPath).toString();
  if (isWin) {
    relativeVuePath = relativeVuePath.replace(/\\/g, '\\\\');
    relativePluginPath = relativePluginPath.replace(/\\/g, '\\\\');
  }
  if (hasPluginInstalled) {
    contents += `\n// If detact plugins/plugin.js is exist, import and the plugin.js\n`;
    contents += `import plugins from '${relativePluginPath}';\n`;
    contents += `plugins.forEach(function (plugin) {\n\tweex.install(plugin)\n});\n\n`;
    entryContents = entryContents.replace(/weex\.init/, match => `${contents}${match}`);
    contents = ''
  }
  contents += `
const App = require('${relativeVuePath}');
new Vue(Vue.util.extend({el: '#root'}, App));
`;
  return entryContents + contents;
}

// Wraping the entry file for native.
const getNativeEntryFileContent = (entryPath, vueFilePath) => {
  let relativeVuePath = path.relative(path.join(entryPath, '../'), vueFilePath);
  let contents = '';
  if (isWin) {
    relativeVuePath = relativeVuePath.replace(/\\/g, '\\\\');
  }
  contents += `import App from '${relativeVuePath}'
App.el = '#root'
new Vue(App)
`;
  
  return contents;
}

// Retrieve entry file mappings by function recursion
const getEntryFile = (dir) => {
  dir = dir || config.sourceDir;
  const entries = glob.sync(`${dir}/${config.entryFilter}`, config.entryFilterOptions);
  entries.forEach(entry => {
    const extname = path.extname(entry);
    const basename = entry.replace(`${dir}/`, '').replace(extname, '');
    const templatePathForWeb = path.join(vueWebTemp, basename + '.web.js');
    const templatePathForNative = path.join(vueWebTemp, basename + '.js');
    fs.outputFileSync(templatePathForWeb, getWebEntryFileContent(templatePathForWeb, entry));
    fs.outputFileSync(templatePathForNative, getNativeEntryFileContent(templatePathForNative, entry));
    webEntry[basename] = templatePathForWeb;
    weexEntry[basename] = templatePathForNative;
  })
}

// Generate an entry file array before writing a webpack configuration
getEntryFile();
{{/router}}


{{#lint}}const createLintingRule = () => ({
  test: /\.(js|vue)$/,
  loader: 'eslint-loader',
  enforce: 'pre',
  include: [helper.rootNode('src'), helper.rootNode('test')],
  options: {
    formatter: require('eslint-friendly-formatter'),
    emitWarning: !config.dev.showEslintErrorsInOverlay
  }
})
const useEslint = config.dev.useEslint ? [createLintingRule()] : []
{{/lint}}

/**
 * Plugins for webpack configuration.
 */
const plugins = [
  /**
   * Plugin: webpack.DefinePlugin
   * Description: The DefinePlugin allows you to create global constants which can be configured at compile time. 
   *
   * See: https://webpack.js.org/plugins/define-plugin/
   */
  new webpack.DefinePlugin({
    'process.env': {
      'NODE_ENV': config.dev.env
    }
  }),
  /*
   * Plugin: BannerPlugin
   * Description: Adds a banner to the top of each generated chunk.
   * See: https://webpack.js.org/plugins/banner-plugin/
   */
  new webpack.BannerPlugin({
    banner: '// { "framework": "Vue"} \n',
    raw: true,
    exclude: 'Vue'
  })
];

// Config for compile jsbundle for web.
const webConfig = {
  entry: Object.assign(webEntry, {
    'vendor': [path.resolve('node_modules/phantom-limb/index.js')]
  }),
  output: {
    path: helper.rootNode('./dist'),
    filename: '[name].web.js'
  },
  /**
   * Options affecting the resolving of modules.
   * See http://webpack.github.io/docs/configuration.html#resolve
   */
  resolve: {
    extensions: ['.js', '.vue', '.json'],
    alias: {
      '@': helper.resolve('src')
    }
  },
  /*
   * Options affecting the resolving of modules.
   *
   * See: http://webpack.github.io/docs/configuration.html#module
   */
  module: {
    // webpack 2.0 
    rules: {{#lint}}useEslint.concat({{/lint}}[
      {
        test: /\.js$/,
        use: [{
          loader: 'babel-loader'
        }],
        exclude: config.excludeModuleReg
      },
      {
        test: /\.vue(\?[^?]+)?$/,
        use: [{
          loader: 'vue-loader',
          options: Object.assign(vueLoaderConfig({useVue: true, usePostCSS: false}), {
            /**
             * important! should use postTransformNode to add $processStyle for
             * inline style prefixing.
             */
            optimizeSSR: false,
            {{#if_eq weex "latest"}}
            postcss: [
              // to convert weex exclusive styles.
              require('postcss-plugin-weex')(),
              require('autoprefixer')({
                browsers: ['> 0.1%', 'ios >= 8', 'not ie < 12']
              }),
              require('postcss-plugin-px2rem')({
                // base on 750px standard.
                rootValue: 75,
                // to leave 1px alone.
                minPixelValue: 1.01
              })
            ],
            compilerModules: [
              {
                postTransformNode: el => {
                  // to convert vnode for weex components.
                  require('weex-vue-precompiler')()(el)
                }
              }
            ]
            {{else}}
            compilerModules: [{
              postTransformNode: el => {
                el.staticStyle = `$processStyle(${el.staticStyle})`
                el.styleBinding = `$processStyle(${el.styleBinding})`
              }
            }]
            {{/if_eq}}
            
          })
        }],
        exclude: config.excludeModuleReg
      }
    ]{{#lint}}){{/lint}}
  },
  /*
   * Add additional plugins to the compiler.
   *
   * See: http://webpack.github.io/docs/configuration.html#plugins
   */
  plugins: plugins
};
// Config for compile jsbundle for native.
const weexConfig = {
  entry: weexEntry,
  output: {
    path: path.join(__dirname, '../dist'),
    filename: '[name].js'
  },
  /**
   * Options affecting the resolving of modules.
   * See http://webpack.github.io/docs/configuration.html#resolve
   */
  resolve: {
    extensions: ['.js', '.vue', '.json'],
    alias: {
      '@': helper.resolve('src')
    }
  },
  /*
   * Options affecting the resolving of modules.
   *
   * See: http://webpack.github.io/docs/configuration.html#module
   */
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [{
          loader: 'babel-loader'
        }],
        exclude: config.excludeModuleReg
      },
      {
        test: /\.vue(\?[^?]+)?$/,
        use: [{
          loader: 'weex-loader',
          options: vueLoaderConfig({useVue: false})
        }],
        exclude: config.excludeModuleReg
      }
    ]
  },
  /*
   * Add additional plugins to the compiler.
   *
   * See: http://webpack.github.io/docs/configuration.html#plugins
   */
  plugins: plugins,
  /*
  * Include polyfills or mocks for various node stuff
  * Description: Node configuration
  *
  * See: https://webpack.github.io/docs/configuration.html#node
  */
  node: config.nodeConfiguration
};

module.exports = [webConfig, weexConfig];

module.exports = function (api) {
  api.cache(true);

  const plugins = [];

  if (process.env.NODE_ENV === 'production' || process.env.EAS_BUILD === 'true') {
    plugins.push(['transform-remove-console', { exclude: ['error'] }]);
  }

  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins,
  };
};

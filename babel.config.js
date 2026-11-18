function getHandlerForNodeType(pluginVisitor, nodeType) {
  if (!pluginVisitor) return null;
  if (pluginVisitor[nodeType]) return pluginVisitor[nodeType];
  for (const k of Object.keys(pluginVisitor)) {
    if (k.split('|').includes(nodeType)) {
      return pluginVisitor[k];
    }
  }
  return null;
}

function routeWorkletPlugins(api, options, dirname) {
  const corePlugin = require('react-native-worklets-core/plugin')(api, options, dirname);
  const reanimatedPlugin = require('react-native-reanimated/plugin')(api, options, dirname);

  function isVisionCameraFile(filename) {
    if (!filename) return false;
    const normalized = filename.replace(/\\/g, '/');
    return (
      normalized.includes('node_modules/react-native-vision-camera/') ||
      normalized.includes('src/hooks/useCameraColorSampler')
    );
  }

  // Collect all individual node types across both plugins
  const nodeTypes = new Set();
  for (const key of Object.keys(corePlugin.visitor || {})) {
    key.split('|').forEach((t) => nodeTypes.add(t));
  }
  for (const key of Object.keys(reanimatedPlugin.visitor || {})) {
    key.split('|').forEach((t) => nodeTypes.add(t));
  }

  const mergedVisitor = {};
  for (const type of nodeTypes) {
    mergedVisitor[type] = {
      enter(path, state) {
        const filename = state?.file?.opts?.filename || state?.filename || '';
        const targetPlugin = isVisionCameraFile(filename) ? corePlugin : reanimatedPlugin;
        const handler = getHandlerForNodeType(targetPlugin.visitor, type);
        if (!handler) return;
        if (typeof handler === 'function') {
          return handler.call(this, path, state);
        } else if (typeof handler.enter === 'function') {
          return handler.enter.call(this, path, state);
        }
      },
      exit(path, state) {
        const filename = state?.file?.opts?.filename || state?.filename || '';
        const targetPlugin = isVisionCameraFile(filename) ? corePlugin : reanimatedPlugin;
        const handler = getHandlerForNodeType(targetPlugin.visitor, type);
        if (!handler) return;
        if (typeof handler.exit === 'function') {
          return handler.exit.call(this, path, state);
        }
      },
    };
  }

  return {
    name: 'route-worklet-plugins',
    pre(file) {
      const filename = file?.opts?.filename || '';
      const targetPlugin = isVisionCameraFile(filename) ? corePlugin : reanimatedPlugin;
      if (typeof targetPlugin.pre === 'function') {
        targetPlugin.pre.call(this, file);
      }
    },
    post(file) {
      const filename = file?.opts?.filename || '';
      const targetPlugin = isVisionCameraFile(filename) ? corePlugin : reanimatedPlugin;
      if (typeof targetPlugin.post === 'function') {
        targetPlugin.post.call(this, file);
      }
    },
    visitor: mergedVisitor,
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          worklets: false,
          reanimated: false,
        },
      ],
    ],
    plugins: [routeWorkletPlugins],
  };
};

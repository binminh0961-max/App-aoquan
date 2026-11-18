const { withGradleProperties } = require('@expo/config-plugins');

const PROPERTIES_TO_SET = {
  'org.gradle.parallel': 'false',
  'org.gradle.workers.max': '1',
  'org.gradle.jvmargs': '-Xmx2048m -XX:MaxMetaspaceSize=512m',
};

const withLowMemoryGradle = (config) => {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(PROPERTIES_TO_SET)) {
      const existingProp = config.modResults.find(
        (item) => item.type === 'property' && item.key === key
      );

      if (existingProp) {
        existingProp.value = value;
      } else {
        config.modResults.push({
          type: 'property',
          key,
          value,
        });
      }
    }
    return config;
  });
};

module.exports = withLowMemoryGradle;

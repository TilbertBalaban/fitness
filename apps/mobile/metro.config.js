const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// PowerSync's packages publish conditional exports Metro cannot resolve without this flag
// (docs.powersync.com, React Native Web Support). Must be set before withNativeWind wraps
// the config — wrapping does not re-read resolver options set after the call.
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: './global.css' });

// RN ships this style processor as untyped Flow; declared here so tests can run
// layouts through the same parser the device uses.
declare module 'react-native/Libraries/StyleSheet/processTransformOrigin' {
  export default function processTransformOrigin(
    transformOrigin: Array<string | number> | string,
  ): Array<string | number>;
}

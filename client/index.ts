import { decode, encode } from 'base-64';

if (!global.btoa) {
    global.btoa = encode;
}
if (!global.atob) {
    global.atob = decode;
}

// Polyfill TextEncoder/TextDecoder
import * as TextEncoding from 'text-encoding';

// Check if we need to polyfill TextEncoder/TextDecoder
if (typeof global.TextEncoder === 'undefined') {
    // @ts-ignore
    global.TextEncoder = TextEncoding.TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
    // @ts-ignore
    global.TextDecoder = TextEncoding.TextDecoder;
}

// Polyfill ReadableStream
import { ReadableStream } from 'web-streams-polyfill';
if (typeof global.ReadableStream === 'undefined') {
    // @ts-ignore
    global.ReadableStream = ReadableStream;
}

// URL polyfill (typically handled by react-native-url-polyfill)
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

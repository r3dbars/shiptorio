// Local module boundary lets CLI tests replace the transport and assert replacement
// before startup. Bun's built-in `ws` module itself does not honor preload mocks.
export { default as LoadWebSocket } from 'ws';

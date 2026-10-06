// Bundled into a Blob worker by build.mjs; REFERENCE and the simulation port are in scope.
self.addEventListener('message', event => {
  const { type, id, options = {} } = event.data || {};
  if (type !== 'run') return;
  try {
    const started = performance.now();
    const result = runSimulation(REFERENCE, options, progress => {
      self.postMessage({ type: 'progress', id, progress });
    });
    self.postMessage({ type: 'result', id, result, elapsedMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error?.message || String(error) });
  }
});
self.postMessage({ type: 'ready' });

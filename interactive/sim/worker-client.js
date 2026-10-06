// Stage 3a exposes the dormant worker factory to browser smoke tests and Stage 3b.
export function createSimulationWorker() {
  const url = URL.createObjectURL(new Blob([SIM_WORKER_SOURCE], { type: 'text/javascript' }));
  let worker;
  try {
    worker = new Worker(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  worker.addEventListener('message', function ready(event) {
    if (event.data?.type !== 'ready') return;
    URL.revokeObjectURL(url);
    worker.removeEventListener('message', ready);
  });
  return worker;
}

globalThis.ArithmeticSimulation = Object.freeze({ createWorker: createSimulationWorker });

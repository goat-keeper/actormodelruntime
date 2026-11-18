const minReplicas = Number(process.env.SIMULATOR_MIN_REPLICAS || 2);
const maxReplicas = Number(process.env.SIMULATOR_MAX_REPLICAS || 10);
const cpuTarget = 60;
const memoryTarget = 70;
const state = {
  replicas: Math.min(maxReplicas, Math.max(minReplicas, Number(process.env.SIMULATOR_INITIAL_REPLICAS || 2))),
  load: false,
  lastScaleDown: 0,
};

function reconcile() {
  const pressure = state.load ? 92 : 18;
  if (state.load && state.replicas < maxReplicas) state.replicas += 1;
  if (!state.load && state.replicas > minReplicas && Date.now() - state.lastScaleDown > 30000) {
    state.replicas -= 1;
    state.lastScaleDown = Date.now();
  }
  return pressure;
}

export function setSimulatedReplicas(replicas) {
  state.replicas = Math.max(0, Math.min(50, replicas));
}

export function setSimulatedLoad(running) {
  state.load = Boolean(running);
}

export function getSimulatedLoad() {
  return state.load;
}

export function getSimulatedClusterStatus() {
  const pressure = reconcile();
  const pods = Array.from({ length: state.replicas }, (_, index) => {
    const name = `actor-worker-sim-${index + 1}`;
    return {
      metadata: { name, namespace: process.env.K8S_NAMESPACE || 'actorlab' },
      status: {
        phase: 'Running',
        podIP: `10.0.0.${index + 10}`,
        conditions: [{ type: 'Ready', status: 'True' }],
      },
      spec: { nodeName: `render-sim-node-${(index % 2) + 1}` },
    };
  });
  const workers = Object.fromEntries(pods.map((pod) => [pod.metadata.name, {
    cpuMillicores: Math.round(100 + pressure * 3),
    memoryBytes: (96 + Math.round(pressure * 1.5)) * 1024 * 1024,
    cpuPercentOfRequest: pressure,
    memoryPercentOfRequest: Math.min(95, pressure),
  }]));
  const deployment = { replicas: state.replicas, selector: { matchLabels: { app: 'actor-worker' } } };
  const deploymentStatus = { readyReplicas: state.replicas, availableReplicas: state.replicas };
  const autoscaler = {
    minReplicas, maxReplicas,
    metrics: [
      { resource: { name: 'cpu', target: { averageUtilization: cpuTarget } } },
      { resource: { name: 'memory', target: { averageUtilization: memoryTarget } } },
    ],
  };
  return {
    connected: true, simulated: true, mode: 'Simulation',
    message: 'Kubernetes is unavailable; displaying a simulated cluster.',
    pods,
    nodes: [1, 2].map((n) => ({ metadata: { name: `render-sim-node-${n}` }, status: { conditions: [{ type: 'Ready', status: 'True' }] } })),
    deployment, deploymentStatus, autoscaler,
    autoscalerStatus: { currentReplicas: state.replicas, desiredReplicas: state.replicas,
      currentMetrics: [
        { resource: { name: 'cpu', current: { averageUtilization: pressure } } },
        { resource: { name: 'memory', current: { averageUtilization: Math.min(95, pressure) } } },
      ], conditions: [{ type: 'AbleToScale', message: state.load ? 'Simulated load is active; replicas scale up.' : 'No simulated load; replicas return to the minimum.' }],
    },
    resourceMetrics: { available: true, workers },
    simulator: { running: state.load, available: true },
  };
}

export function getSimulatedPodLogs(podName) {
  if (!/^actor-worker-sim-\d+$/.test(podName)) throw Object.assign(new Error('Simulated pod not found'), { status: 404 });
  return `[simulator] ${new Date().toISOString()} ${podName} is Running\n[simulator] No real Kubernetes pod or container exists.\n`;
}

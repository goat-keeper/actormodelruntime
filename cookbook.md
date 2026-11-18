# ActorLab Microproject Cookbook

This cookbook explains how to understand, implement, run, demonstrate, and deploy
the ActorLab microproject. The commands use PowerShell on Windows and should be
run from the repository root unless stated otherwise.

ActorLab is an educational distributed actor runtime built with Node.js,
Express, MongoDB, Redis, Docker, and Kubernetes. It is a demonstration project,
not a production-ready service. Review [Limitations and future scope](docs/LIMITATIONS_AND_FUTURE_SCOPE.md)
and [Security considerations](docs/SECURITY_CONSIDERATIONS.md) before exposing
it outside a trusted development environment.

## 1. Understand the Microproject

Before changing code, define the problem and the smallest behavior that proves
the project works:

1. **Problem:** A process-local actor is tied to one worker. Restarting or
	changing workers makes it difficult to preserve actor identity and state.
2. **Goal:** Keep actor identity stable while workers can register, process
	messages, and change over time.
3. **Core behavior:** Create an actor, route a message to its current worker,
	update state, and persist the result.
4. **Supporting behavior:** Track worker heartbeats and ownership in Redis,
	persist actor/message data in MongoDB, and provide a browser console and API.
5. **Scope:** First make the local API and one worker work. Add multiple workers,
	rebalancing, singleton leases, containers, and Kubernetes after that flow is
	understood.

The main code areas are:

| Area | Location | Responsibility |
| --- | --- | --- |
| Server startup and app setup | `src/server.js`, `src/app.js` | Start the API or worker and configure Express |
| API, internal, and page routes | `src/routes/` | Handle client requests, worker coordination, and pages |
| Actor and runtime records | `src/models/` | Store actor state, messages, migrations, and events |
| Worker execution | `src/runtime/worker.js` | Register a worker and process actor messages |
| Coordination and deployment services | `src/services/` | Ownership, message routing, rebalancing, and Kubernetes operations |
| Browser console | `src/views/`, `public/` | Render project status and operations |
| Container and cluster setup | `Dockerfile`, `docker-compose.yml`, `k8s/` | Package and run the services |

For detailed component behavior, see [System architecture](docs/SYSTEM_ARCHITECTURE.md),
[Actor model](docs/ACTOR_MODEL.md), and [API reference](docs/API_REFERENCE.md).

## 2. Implement the Microproject

Use this sequence when building the project from scratch or extending the
existing implementation. Keep each step small enough to run and check before
moving on.

1. **Create the project skeleton.** Set up a Node.js ES-module project, an
	Express entry point, configuration modules, and a health endpoint.
2. **Define actor types and state.** Specify the actor ID, type, initial state,
	supported operations, and state validation rules. Actor identity should not
	depend on a particular worker.
3. **Add persistence.** Store actor state and version in MongoDB. Persist
	messages/results where required so state survives worker restarts.
4. **Build the worker.** Give each worker a unique ID and HTTP endpoint. Register
	it in Redis and refresh its heartbeat while it is alive.
5. **Route actor messages.** Have the API find or assign a live worker, then
	forward the request. Serialize operations per actor and verify ownership
	before committing state changes.
6. **Handle distributed changes.** Add ownership generations and stale-write
	checks before experimenting with worker failure or actor migration. Add
	singleton leases only for work that must have one active owner.
7. **Build the operator experience.** Add API endpoints and pages that expose
	actors, workers, rebalancing, singleton status, and cluster status.
8. **Package the runtime.** Add Docker Compose for a repeatable local setup, then
	Kubernetes manifests for a cluster deployment.
9. **Validate and document.** Run the checks in this cookbook, record actual
	results, and update the relevant documentation when behavior or configuration
	changes.

Follow the repository's existing patterns and check [Configuration](docs/CONFIGURATION.md)
before introducing new environment variables. Do not treat retries or
duplicate suppression as exactly-once message delivery; see the project's
limitations documentation for the guarantees actually provided.

## 3. Get the GitHub Repository

If the project is hosted on GitHub, use its clone URL in place of
`<repository-url>`:

```powershell
git clone <repository-url>
Set-Location <repository-folder>
```

To update an existing local clone later:

```powershell
git pull
```

After cloning, install dependencies and prepare local configuration:

```powershell
npm install
Copy-Item .env.example .env
```

The checked-in `.env.example` contains local development defaults. Keep
credentials and private connection strings out of Git; use a local `.env` for
development and the deployment platform's secret manager for shared
environments.

## 4. Run and Perform the Project Locally

### Option A: Run the API and worker as Node.js processes

Prerequisites: Node.js 22 with npm, Docker Desktop, and the repository cloned.
Start only the data services in Docker:

```powershell
docker compose up -d mongodb redis
```

In the first terminal, start the API:

```powershell
npm start
```

In a second terminal at the repository root, start a worker:

```powershell
npm run worker
```

Open <http://localhost:3000>. For API development with automatic Node.js
restarts, use `npm run dev` in place of `npm start`.

### Option B: Run the full stack with Docker Compose

This starts MongoDB, Redis, the API, and one worker:

```powershell
docker compose up --build
```

Open <http://localhost:3000>. Compose uses service names for container-to-
container connections and keeps database data in named volumes. Stop it with
`Ctrl+C`, or from another terminal run `docker compose down`. The latter keeps
the volumes. The sample Compose database and cache have no authentication and
are intended for local development only.

### Exercise the main actor workflow

With the API and at least one worker running, check health and worker
registration:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/health
Invoke-RestMethod -Uri http://localhost:3000/api/workers
```

Create an actor and send it a message:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/actors `
  -ContentType 'application/json' `
  -Body '{"actorId":"counter-demo","actorType":"CounterActor"}'

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/actors/counter-demo/messages `
  -ContentType 'application/json' `
  -Body '{"operation":"increment","payload":{"amount":2},"messageId":"demo-1"}'

Invoke-RestMethod -Uri http://localhost:3000/api/actors/counter-demo
```

The actor response should show the updated counter state. The API and worker
logs should show their listeners and worker registration. The browser console
also includes `/actors`, `/workers`, `/rebalancing`, `/singletons`, and
`/cluster` pages.

For a repeatable presentation dataset, run `npm run demo:seed` while the data
services are available. This resets demo actors, messages, migrations, and
runtime events, so do not use it where that data must be retained. See
[Presentation guide](docs/PRESENTATION_GUIDE.md) for a walkthrough.

### Verify changes

Run the repository's available checks:

```powershell
npm test
npm run test:integration
```

`npm test` invokes Node's test runner. The integration test requires a running
deployment and `ACTORLAB_API_URL` to be set, for example:

```powershell
$env:ACTORLAB_API_URL = 'http://localhost:3000'
npm run test:integration
```

If no test output is produced, check the test file and current project scripts;
do not report a scenario as verified unless it was actually run. See
[Testing and validation](docs/TESTING_AND_VALIDATION.md) for expected behavior.

## 5. Deploy the Repository

Cloning or pulling source from GitHub does not by itself create a live website
or deployment. This repository provides Docker and Kubernetes deployment
files, but no configured GitHub Actions workflow for automatic build-and-deploy.
Choose a target platform and supply its required infrastructure and secrets.

### Deploy with Docker Compose

On a machine with Docker Compose installed, clone the repository and run:

```powershell
git clone <repository-url>
Set-Location <repository-folder>
docker compose up --build -d
docker compose ps
```

Visit `http://localhost:3000` on that machine. To access it remotely, the host
and network must be configured accordingly; do not expose the sample setup as-is
to the public internet because it has no authentication or database
authentication. Compose is the simplest way to run the complete microproject,
but its supplied configuration is for local development rather than a hardened
public deployment.

### Deploy to Kubernetes with Minikube

For a local Kubernetes demonstration, install Minikube, Docker, and `kubectl`,
then run:

```powershell
minikube start
docker build -t actorlab:latest .
minikube image load actorlab:latest
kubectl apply -f k8s/
kubectl -n actorlab get deployments,pods,services
kubectl -n actorlab port-forward service/actorlab-api 3000:3000
```

Keep the port-forward command running and open <http://localhost:3000>.
To stop the port forward, press `Ctrl+C`. To remove the sample Kubernetes
resources later, run `kubectl delete -f k8s/`; inspect the cluster's storage
reclaim behavior before deleting anything if its data matters.

### Deploy to a remote Kubernetes cluster

The supplied manifests refer to the local image `actorlab:latest`. A remote
cluster cannot pull an image that exists only on your computer. Build and push
an image to a registry reachable by the cluster. Before applying the manifests,
change the `image` value in both `k8s/06-api.yaml` and `k8s/07-workers.yaml` to
the pushed image name, such as `<registry>/<namespace>/actorlab:<tag>`. Configure
registry access in the cluster if the image is private. Then run:

```powershell
docker build -t <registry>/<namespace>/actorlab:<tag> .
docker push <registry>/<namespace>/actorlab:<tag>
kubectl apply -f k8s/
kubectl -n actorlab get deployments,pods,services
```

Before using a shared or public cluster, replace the example connection Secret
with securely managed credentials and configure authentication, TLS,
persistence, network policies, resource limits, and backups. The sample uses
single-replica MongoDB and Redis and is not a production reference architecture.
See [Deployment guide](docs/DEPLOYMENT_GUIDE.md), [Kubernetes integration](docs/KUBERNETES_INTEGRATION.md),
and [Security considerations](docs/SECURITY_CONSIDERATIONS.md).

### Typical GitHub-based update cycle

For a manual deployment update, pull the desired source revision, rebuild the
image, push it to the registry, and update the Kubernetes workload to use that
image. On Minikube, rebuild and reload the image instead. Merely running
`git pull` does not replace a running container or update a Kubernetes Pod.
Automated deployment requires adding and configuring a CI/CD workflow and
repository secrets for the chosen registry and cluster; no such workflow is
included here.

## 6. Troubleshooting Pointers

- API or worker cannot use actor routes: confirm MongoDB and Redis are running
  and that both processes use reachable `MONGODB_URI` and `REDIS_URL` values.
- No workers appear: confirm the worker is running, has a unique `WORKER_ID`,
  and can reach the API at `COORDINATOR_URL`.
- API cannot reach a worker: ensure the worker's advertised host and port are
  reachable from the API process, not merely from your browser.
- Kubernetes pages are unavailable locally: they require a reachable cluster
  and Kubernetes credentials; the rest of the local runtime can be exercised
  without Kubernetes.
- A deployment still runs old code: rebuild and redeploy its container image;
  pulling source alone does not update a running deployment.

For more cases, use [Troubleshooting](docs/TROUBLESHOOTING.md) and
[Configuration](docs/CONFIGURATION.md).

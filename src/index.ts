import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const config = new pulumi.Config();
const namespaceName = config.get("namespace") ?? "cloudflare-tunnel-ingress-controller";
const controllerVersion = config.get("controllerVersion") ?? "v0.5.1";
const installCRDs = config.getBoolean("installCRDs") ?? false;

// Env-first, config fallback for public consumers
const envAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const envApiToken = process.env.CLOUDFLARE_API_TOKEN;
const envTunnelName = process.env.CLOUDFLARE_TUNNEL_NAME;

const cloudflareAccountId = envAccountId && envAccountId.length > 0
  ? envAccountId
  : config.require("cloudflareAccountId");

const cloudflareApiToken = envApiToken && envApiToken.length > 0
  ? pulumi.secret(envApiToken)
  : config.requireSecret("cloudflareApiToken");

const tunnelName = envTunnelName && envTunnelName.length > 0
  ? envTunnelName
  : config.require("tunnelName");

const ns = new k8s.core.v1.Namespace("cf-tunnel-ic-ns", {
  metadata: { name: namespaceName },
});

// No explicit Secret creation; pass token directly to Helm chart values

// Install CRDs if requested (best-effort; chart may already include them)
const crds = installCRDs
  ? new k8s.yaml.ConfigFile(
      "cf-tunnel-ic-crds",
      {
        file:
          `https://raw.githubusercontent.com/STRRL/cloudflare-tunnel-ingress-controller/${controllerVersion}/config/crd/bases/cloudflare-operator.starlo.xyz_tunnels.yaml`,
      },
      { dependsOn: [ns] },
    )
  : undefined;

// Deploy using Helm chart and transform for namespace and env configuration
const clusterScopedKinds = new Set([
  "CustomResourceDefinition",
  "ClusterRole",
  "ClusterRoleBinding",
  "Namespace",
  "Node",
  "PersistentVolume",
  "MutatingWebhookConfiguration",
  "ValidatingWebhookConfiguration",
  "APIService",
  "PriorityClass",
  "StorageClass",
]);

const helmRepo = config.get("helmRepo") ?? "https://helm.strrl.dev";
const helmChart = config.get("helmChart") ?? "cloudflare-tunnel-ingress-controller";
const helmChartVersion = config.get("helmChartVersion") ?? undefined; // optional

const controllerDependsOn: pulumi.Input<pulumi.Input<pulumi.Resource>[]> = [
  ns,
  ...(crds ? [crds] as pulumi.Resource[] : []),
];

const controller = new k8s.helm.v3.Chart(
  "cf-tunnel-ic",
  {
    namespace: namespaceName,
    fetchOpts: { repo: helmRepo },
    chart: helmChart,
    version: helmChartVersion,
    values: {
      cloudflare: {
        apiToken: cloudflareApiToken,
        accountId: cloudflareAccountId,
        tunnelName: tunnelName,
      },
    },
  },
  { dependsOn: controllerDependsOn },
);

export const namespace = ns.metadata.name;

import { config, Helm } from '@homelab/shared'
import { secret } from '@pulumi/pulumi'

const cfg = config('cloudflare-tunnel-ingress-controller')

const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || cfg.require('cloudflareAccountId')
const cloudflareApiToken = secret(process.env.CLOUDFLARE_API_TOKEN || cfg.require('cloudflareApiToken'))
const tunnelName = process.env.CLOUDFLARE_TUNNEL_NAME || cfg.require('tunnelName')

const controller = new Helm('cloudflare-tunnel-ingress-controller', {
  namespace: cfg.get('namespace', 'cloudflare-tunnel-ingress-controller'),
  chart: cfg.get('helmChart', 'cloudflare-tunnel-ingress-controller'),
  repo: cfg.get('helmRepo', 'https://helm.strrl.dev'),
  version: process.env.CLOUDFLARE_TUNNEL_VERSION || cfg.get('helmChartVersion'),
  values: {
    cloudflare: {
      accountId: cloudflareAccountId,
      apiToken: cloudflareApiToken,
      tunnelName: tunnelName,
    },
    replicaCount: 1,
    resources: {
      requests: { cpu: '100m', memory: '128Mi' },
      limits: { cpu: '500m', memory: '256Mi' },
    },
  },
})

export const namespace = controller.namespace.metadata.name
export const release = controller.release.name

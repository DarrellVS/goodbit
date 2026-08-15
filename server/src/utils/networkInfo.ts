import os from 'node:os';

export interface LanEndpoint {
  address: string;
  iface: string;
  url: string;
}

// Virtual adapters (WSL, Hyper-V, Docker, VPNs) hand out private IPs that no
// other device on the LAN can reach. Rank them last rather than dropping them,
// so an unusual setup still gets *something* to try.
const VIRTUAL_IFACE = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|Tailscale|ZeroTier|Radmin|Hamachi/i;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function rank(endpoint: LanEndpoint): number {
  const parts = endpoint.address.split('.').map(Number);
  let score = 0;
  if (VIRTUAL_IFACE.test(endpoint.iface)) score += 100;
  // 192.168.x is the overwhelmingly common home range; prefer it.
  if (parts[0] === 192) score += 0;
  else if (parts[0] === 10) score += 10;
  else score += 20;
  return score;
}

/**
 * LAN addresses this server is reachable at, best candidate first.
 * Used by the client to offer a same-origin local connection that keeps
 * video traffic off the internet.
 */
export function getLanEndpoints(port: number): LanEndpoint[] {
  const endpoints: LanEndpoint[] = [];

  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      // Node <18 reports family as 'IPv4', newer as 4. Accept both.
      const isV4 = addr.family === 'IPv4' || (addr.family as unknown as number) === 4;
      if (!isV4 || addr.internal) continue;
      if (!isPrivateIpv4(addr.address)) continue;
      endpoints.push({ address: addr.address, iface, url: `http://${addr.address}:${port}` });
    }
  }

  return endpoints.sort((a, b) => rank(a) - rank(b));
}

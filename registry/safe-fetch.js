/**
 * OpenBare Registry - SSRF-hardened fetch helper
 *
 * Validates the *resolved* IP address of a request - not the hostname string -
 * before connecting, and re-validates every redirect hop the same way. This
 * closes the gaps a hostname-regex blocklist has: DNS rebinding, alternate
 * IPv4/IPv6 representations, and redirects into private ranges.
 */

const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

// Explicit allow/deny table: everything in these IANA special-purpose ranges
// is rejected. Anything else is treated as a public address.
const blockedRanges = new net.BlockList();
[
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // shared address space (CGNAT)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (includes cloud metadata endpoints)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation (TEST-NET-1)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation (TEST-NET-2)
  ['203.0.113.0', 24], // documentation (TEST-NET-3)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
  ['255.255.255.255', 32], // broadcast
].forEach(([address, prefix]) => blockedRanges.addSubnet(address, prefix, 'ipv4'));

// Note: net.BlockList unifies IPv4 and IPv4-mapped-IPv6 (::ffff:a.b.c.d) address
// spaces automatically, so the IPv4 rules above already cover that form - an
// explicit ::ffff:0:0/96 rule here would be redundant and, since a /96 mapped
// prefix spans the *entire* IPv4 space, would wrongly block all public IPv4
// addresses too.
[
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (can embed private IPv4 addresses)
  ['100::', 64], // discard-only
  ['fc00::', 7], // unique local (ULA)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
].forEach(([address, prefix]) => blockedRanges.addSubnet(address, prefix, 'ipv6'));

/**
 * Pure check: is this canonical IP address a public, routable address?
 * @param {string} address
 * @param {number} family - 4 or 6
 */
function isPublicAddress(address, family) {
  return !blockedRanges.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

function stripBrackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Resolve a hostname (or IP literal) to a single address, rejecting it unless
 * that address is public. IP literals are checked directly - Node's `net`
 * module never invokes a custom `lookup` for them, so they must be validated
 * up front rather than relying solely on the connect-time lookup override.
 * @param {string} hostname
 * @returns {Promise<{address: string, family: number}>}
 */
async function resolveHostname(hostname) {
  const literal = stripBrackets(hostname);
  const literalFamily = net.isIP(literal);

  if (literalFamily) {
    if (!isPublicAddress(literal, literalFamily)) {
      throw ssrfBlockedError(hostname);
    }
    return { address: literal, family: literalFamily };
  }

  const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  const publicAddresses = addresses.filter((a) => isPublicAddress(a.address, a.family));

  if (publicAddresses.length === 0) {
    throw ssrfBlockedError(hostname);
  }

  return publicAddresses[0];
}

function ssrfBlockedError(hostname) {
  const error = new Error(`Blocked: "${hostname}" does not resolve to a public address`);
  error.code = 'ERR_SSRF_BLOCKED';
  return error;
}

function tooManyRedirectsError(maxRedirects) {
  const error = new Error(`Blocked: exceeded ${maxRedirects} redirects`);
  error.code = 'ERR_TOO_MANY_REDIRECTS';
  return error;
}

function requestOnce(urlObj, resolved, { signal, headers }) {
  const transport = urlObj.protocol === 'https:' ? https : http;

  // Pin the connection to the already-validated address: no re-resolution
  // happens between validation and connect, so there is no window for the
  // hostname to resolve somewhere else (DNS rebinding) before we dial out.
  // Node's Happy Eyeballs connect path requests `{ all: true }` and expects an
  // array-style callback, so honor whichever form the caller asked for.
  const pinnedLookup = (_hostname, options, callback) => {
    const entry = { address: resolved.address, family: resolved.family };
    return options && options.all ? callback(null, [entry]) : callback(null, entry.address, entry.family);
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(
      urlObj,
      { method: 'GET', lookup: pinnedLookup, signal, headers },
      (res) => {
        resolve(res);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * SSRF-hardened GET. Resolves and validates the address for every hop
 * (including redirects) before connecting to it.
 * @param {string} urlString
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRedirects]
 * @param {Object} [options.headers]
 * @param {Function} [options.resolveHostname] - injection point for tests only
 * @returns {Promise<{ok: boolean, status: number, statusText: string}>}
 */
async function safeFetch(urlString, options = {}) {
  const {
    timeoutMs,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    headers,
    resolveHostname: resolve = resolveHostname,
  } = options;

  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

  let currentUrl = new URL(urlString);

  for (let hop = 0; ; hop++) {
    if (!['http:', 'https:'].includes(currentUrl.protocol)) {
      const error = new Error(`Blocked: unsupported protocol "${currentUrl.protocol}"`);
      error.code = 'ERR_SSRF_BLOCKED';
      throw error;
    }

    const resolved = await resolve(currentUrl.hostname);
    const res = await requestOnce(currentUrl, resolved, { signal, headers });

    if (REDIRECT_STATUS_CODES.has(res.statusCode) && res.headers.location) {
      res.destroy();

      if (hop + 1 >= maxRedirects) {
        throw tooManyRedirectsError(maxRedirects);
      }

      currentUrl = new URL(res.headers.location, currentUrl);
      continue;
    }

    res.destroy();
    return {
      ok: res.statusCode < 400,
      status: res.statusCode,
      statusText: res.statusMessage,
    };
  }
}

module.exports = {
  safeFetch,
  resolveHostname,
  isPublicAddress,
};

/**
 * safe-fetch Tests
 *
 * Regression tests for the SSRF guard: private/reserved IPv4 and IPv6 ranges,
 * alternate address representations, DNS resolving to a private address, and
 * redirects that cross into private ranges or exceed the redirect limit.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { safeFetch, resolveHostname, isPublicAddress } = require('../safe-fetch');

describe('isPublicAddress', () => {
  it('blocks private and reserved IPv4 ranges', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.1', '169.254.169.254', '0.0.0.0']) {
      assert.strictEqual(isPublicAddress(address, 4), false, `${address} should be blocked`);
    }
  });

  it('blocks private and reserved IPv6 ranges', () => {
    for (const address of ['::1', 'fe80::1', 'fc00::1', '::']) {
      assert.strictEqual(isPublicAddress(address, 6), false, `${address} should be blocked`);
    }
  });

  it('allows public IPv4 and IPv6 addresses', () => {
    assert.strictEqual(isPublicAddress('8.8.8.8', 4), true);
    assert.strictEqual(isPublicAddress('1.1.1.1', 4), true);
    assert.strictEqual(isPublicAddress('2606:4700:4700::1111', 6), true);
  });

  it('blocks the IPv4-mapped-IPv6 form of a private address', () => {
    assert.strictEqual(isPublicAddress('::ffff:127.0.0.1', 6), false);
  });
});

describe('resolveHostname', () => {
  it('rejects private IP literals directly (no DNS involved)', async () => {
    await assert.rejects(resolveHostname('127.0.0.1'), { code: 'ERR_SSRF_BLOCKED' });
    await assert.rejects(resolveHostname('169.254.169.254'), { code: 'ERR_SSRF_BLOCKED' });
    await assert.rejects(resolveHostname('[fe80::1]'), { code: 'ERR_SSRF_BLOCKED' });
  });

  it('rejects a hostname that resolves (via real DNS) to a private address', async () => {
    // 'localhost' reliably resolves to 127.0.0.1/::1 in any environment.
    await assert.rejects(resolveHostname('localhost'), { code: 'ERR_SSRF_BLOCKED' });
  });

  it('resolves a public IP literal', async () => {
    const result = await resolveHostname('8.8.8.8');
    assert.strictEqual(result.address, '8.8.8.8');
    assert.strictEqual(result.family, 4);
  });
});

describe('safeFetch', () => {
  // These tests use a real local HTTP server. `resolveHostname` is
  // dependency-injected only so the "public-looking" origin hostname can
  // point at that local server without needing a real public IP - the
  // private redirect target is still validated by the real, unmodified guard.
  function withLocalServer(handler, fn) {
    return async () => {
      const server = http.createServer(handler);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      try {
        await fn(port);
      } finally {
        server.close();
      }
    };
  }

  function fakeResolveViaOrigin() {
    return async (hostname) => {
      if (hostname === 'origin.test') {
        return { address: '127.0.0.1', family: 4 };
      }
      return resolveHostname(hostname);
    };
  }

  it('follows a redirect to an allowed destination', withLocalServer(
    (req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/final' });
        res.end();
      } else {
        res.writeHead(200);
        res.end('ok');
      }
    },
    async (port) => {
      const result = await safeFetch(`http://origin.test:${port}/redirect`, {
        timeoutMs: 2000,
        resolveHostname: fakeResolveViaOrigin()
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.status, 200);
    }
  ));

  it('rejects a redirect to a private address instead of following it', withLocalServer(
    (req, res) => {
      res.writeHead(302, { Location: 'http://metadata.internal.test/secret' });
      res.end();
    },
    async (port) => {
      const resolve = async (hostname) => {
        if (hostname === 'origin.test') {
          return { address: '127.0.0.1', family: 4 };
        }
        if (hostname === 'metadata.internal.test') {
          return resolveHostname('169.254.169.254');
        }
        return resolveHostname(hostname);
      };

      await assert.rejects(
        safeFetch(`http://origin.test:${port}/redirect`, { timeoutMs: 2000, resolveHostname: resolve }),
        { code: 'ERR_SSRF_BLOCKED' }
      );
    }
  ));

  it('enforces a redirect limit', withLocalServer(
    (req, res) => {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    },
    async (port) => {
      await assert.rejects(
        safeFetch(`http://origin.test:${port}/loop`, {
          timeoutMs: 2000,
          maxRedirects: 3,
          resolveHostname: fakeResolveViaOrigin()
        }),
        { code: 'ERR_TOO_MANY_REDIRECTS' }
      );
    }
  ));

  it('rejects a request whose hostname resolves to a private address', async () => {
    await assert.rejects(
      safeFetch('http://localhost:9/', { timeoutMs: 2000 }),
      { code: 'ERR_SSRF_BLOCKED' }
    );
  });

  it('rejects alternate IPv4 representations of a private address', async () => {
    // WHATWG URL parsing canonicalizes both of these to 127.0.0.1 before the
    // guard ever sees them, so string-based hostname regexes can't be bypassed
    // by using a decimal or octal form instead of dotted-decimal.
    await assert.rejects(
      safeFetch('http://2130706433/', { timeoutMs: 2000 }),
      { code: 'ERR_SSRF_BLOCKED' }
    );
    await assert.rejects(
      safeFetch('http://0177.0.0.1/', { timeoutMs: 2000 }),
      { code: 'ERR_SSRF_BLOCKED' }
    );
  });
});

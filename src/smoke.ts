import {
  MODEL,
  predictOperation,
  sanitizeProviderMetadata,
} from './jev.js';

try {
  const startedAt = performance.now();
  const result = await predictOperation(
    [{ id: 'M1', content: 'The user lives in Shanghai.' }],
    'The user moved to Beijing last month.',
  );
  const latencyMs = performance.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        model: MODEL,
        answer: {
          choice: result.choice,
          probabilities: {
            ADD: result.probabilities.ADD,
            UPDATE: result.probabilities.UPDATE,
            DELETE: result.probabilities.DELETE,
            NOOP: result.probabilities.NOOP,
          },
        },
        latency_ms: latencyMs,
        usage: result.usage,
        providerMetadata: sanitizeProviderMetadata(result.providerMetadata),
      },
      null,
      2,
    ),
  );
} catch (error) {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? String(error.statusCode)
      : 'unknown';
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Smoke test failed (${statusCode}): ${message}`);
  process.exitCode = 1;
}

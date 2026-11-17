export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const { patchOperatorClient } = await import('@/lib/local-operator');
  patchOperatorClient();
}

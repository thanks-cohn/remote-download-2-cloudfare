import { createAgentApi } from './api.mjs';

// Deliberately no caller-selected catalog/root or live runtime connection.
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const args = argv.filter(x => x !== '--json');
const api = createAgentApi();
let input = {};
let operation = args.shift() || 'describe';
if (['explainOperation', 'getForeverLinks'].includes(operation) && args[0] && !args[0].startsWith('--')) input.id = args.shift();
let invalid = false;
while (args.length) {
  const flag = args.shift();
  if (!['--api-version', '--request-id'].includes(flag) || !args.length) { invalid = true; break; }
  const key = flag === '--api-version' ? 'apiVersion' : 'requestId';
  if (input[key] !== undefined) { invalid = true; break; }
  input[key] = args.shift();
}
if (invalid) input.unexpectedArgument = true;
const result = api.query(operation, input);
if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(result.explanation);
  console.log(`Evidence: ${result.evidenceStatus}; source freshness: ${result.freshness.status}`);
  console.log(JSON.stringify(result.error || result.data, null, 2));
  if (result.freshness.findings.length) console.log(JSON.stringify(result.freshness.findings, null, 2));
}
process.exitCode = result.error ? 2 : 0;

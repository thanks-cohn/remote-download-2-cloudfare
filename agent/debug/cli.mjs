import {createDebugApi} from './api.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function runCli(argv) {
  const args = [...argv];
  const operation = args.shift() || 'describe';
  const input = {};
  let json = false, invalid = false;
  if (['getIncident','getHistory'].includes(operation) && args[0] && !args[0].startsWith('--')) input.caseId = args.shift();
  while (args.length) {
    const flag = args.shift();
    if (flag === '--json') {if (json) invalid = true; json = true; continue;}
    const key = {'--api-version':'debugApiVersion','--request-id':'requestId','--state':'state','--severity':'severity'}[flag];
    if (!key || !args.length || args[0].startsWith('--') || Object.hasOwn(input, key)) {invalid = true; break;}
    input[key] = args.shift();
  }
  if (invalid) input.unexpectedArgument = true;
  const result = createDebugApi().query(operation, input);
  const output = json ? JSON.stringify(result, null, 2) : formatHuman(operation, result);
  return {result, output, exitCode:result.error || result.data?.valid === false ? 2 : 0};
}

function formatHuman(operation, result) {
  const lines = [result.explanation, 'Record freshness: ' + result.freshness.status + '; overall behavioral evidence: ' + result.evidenceStatus];
  if (result.error) lines.push('Error: ' + result.error.code);
  else if (operation === 'listIncidents') for (const item of result.data) {
    lines.push(item.incident.caseId + ' [' + item.lifecycle + ', ' + item.incident.severity + '] ' + item.incident.summary);
  }
  else if (operation === 'getHistory') for (const event of result.data) {
    lines.push('\n' + event.sequence + '. ' + event.eventId + ' [' + event.evidenceStatus + ']',
      'Occurred: ' + (event.occurredOn || 'unknown') + '; recorded: ' + event.recordedAt,
      event.claim, 'Provenance: ' + event.provenance.sourceType + '/' + event.provenance.reviewStatus);
  }
  else if (operation === 'getIncident') {
    const data = result.data;
    lines.push('Lifecycle: ' + data.lifecycle + '; ' + data.historyCount + ' retained events.',
      'Provenance: ' + data.incident.provenance.sourceType + '/' + data.incident.provenance.reviewStatus);
    const next = data.latestEvents.find(event=>event.kind==='remediation');
    if (next) lines.push('Proposed next verification: ' + next.claim);
    const refs = data.latestEvents.filter(event=>['source-inspection','remediation'].includes(event.kind)).flatMap(event=>event.sourceRefs);
    for (const ref of refs) lines.push('Reference (' + ref.role + '): ' + ref.path + ' — ' + ref.symbol);
  } else lines.push(JSON.stringify(result.data, null, 2));
  for (const finding of result.freshness.findings) lines.push('Freshness warning: ' + finding.code + ' ' + finding.path);
  return lines.join('\n');
}

// Importable adapter supports tests without spawning or changing global process state.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const {output, exitCode} = runCli(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}

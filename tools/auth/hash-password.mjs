// R-04b (#23, D12): print the scrypt hash for MATCHPILOT_OWNER_PASSWORD_HASH. The password is read from standard input
// (hidden when typed in a terminal), never from arguments or the environment, and is not printed or stored.
//   npm run auth:hash-password            (prompts)
//   printf '%s' "$PASSWORD" | npm run -s auth:hash-password
import {hashPassword} from '../../src/auth/owner-auth.mjs';

const MIN_LENGTH = 12;

async function readPassword() {
  const input = process.stdin;
  if (!input.isTTY) {
    const chunks = [];
    for await (const chunk of input) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  process.stderr.write('Owner password (hidden): ');
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  let value = '';
  return new Promise((done, fail) => {
    input.on('data', key => {
      for (const ch of key) {
        if (ch === '\r' || ch === '\n') { input.setRawMode(false); input.pause(); process.stderr.write('\n'); return done(value); }
        if (ch === '\u0003') { input.setRawMode(false); return fail(new Error('cancelled')); }
        if (ch === '\u007f') value = value.slice(0, -1);
        else value += ch;
      }
    });
  });
}

const password = await readPassword();
if (password.length < MIN_LENGTH) {
  console.error(`The password must be at least ${MIN_LENGTH} characters.`);
  process.exitCode = 2;
} else {
  process.stdout.write(`${await hashPassword(password)}\n`);
}

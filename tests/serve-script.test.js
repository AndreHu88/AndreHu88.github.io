const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const serveScript = path.join(projectRoot, 'serve.sh');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function runServeScript(checkExitCode) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-serve-test-'));
  const binDirectory = path.join(temporaryDirectory, 'bin');
  const commandLog = path.join(temporaryDirectory, 'commands.log');
  fs.mkdirSync(binDirectory);
  fs.writeFileSync(path.join(binDirectory, 'rbenv'), `#!/bin/sh
printf '%s|%s\\n' "$PWD" "$*" >> "$SERVE_TEST_LOG"
if [ "$3" = "check" ]; then
  exit "$SERVE_CHECK_EXIT"
fi
exit 0
`);
  fs.chmodSync(path.join(binDirectory, 'rbenv'), 0o755);

  const result = spawnSync('sh', [serveScript], {
    cwd: temporaryDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      SERVE_TEST_LOG: commandLog,
      SERVE_CHECK_EXIT: String(checkExitCode),
      TMPDIR: temporaryDirectory
    }
  });
  const commands = fs.existsSync(commandLog)
    ? fs.readFileSync(commandLog, 'utf8').trim().split('\n')
    : [];
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  return { result, commands, temporaryDirectory };
}

test('serve script starts Jekyll from the repository with a clean destination', () => {
  const { result, commands, temporaryDirectory } = runServeScript(0);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(commands, [
    `${projectRoot}|exec bundle check`,
    `${projectRoot}|exec bundle exec jekyll serve --livereload --disable-disk-cache --destination ${temporaryDirectory}/blog-jekyll-site`
  ]);
});

test('serve script installs missing gems before starting Jekyll', () => {
  const { result, commands, temporaryDirectory } = runServeScript(1);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(commands, [
    `${projectRoot}|exec bundle check`,
    `${projectRoot}|exec bundle install`,
    `${projectRoot}|exec bundle exec jekyll serve --livereload --disable-disk-cache --destination ${temporaryDirectory}/blog-jekyll-site`
  ]);
});

test('repository pins the supported Ruby, Jekyll, and Bundler versions', () => {
  assert.equal(readProjectFile('.ruby-version').trim(), '3.3.12');
  assert.match(readProjectFile('Gemfile'), /^ruby "~> 3\.3\.0"$/m);
  assert.match(readProjectFile('Gemfile'), /^gem "jekyll", "= 4\.4\.1"$/m);
  assert.match(readProjectFile('Gemfile.lock'), /^    jekyll \(4\.4\.1\)$/m);
  assert.match(readProjectFile('Gemfile.lock'), /^   2\.6\.3$/m);
});

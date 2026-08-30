import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetsDirectory = new URL('../cloudflareWorkes/assets/recipe-templates/v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetsDirectory), 'utf8'));
const wranglerCli = process.env.WRANGLER_CLI_PATH
  || fileURLToPath(new URL('../node_modules/wrangler/wrangler-dist/cli.js', import.meta.url));
const targetName = process.env.RECIPE_ASSET_TARGET || 'staging';
const targets = {
  staging: {
    bucket: 'cookby-appointment-staging',
    config: 'cloudflareWorkes/wrangler.staging.toml',
  },
  production: {
    bucket: 'cookby-appointment',
    config: 'cloudflareWorkes/wrangler.toml',
  },
};
const target = targets[targetName];
if (!target) {
  throw new Error(`Unknown RECIPE_ASSET_TARGET: ${targetName}`);
}
const { bucket, config } = target;
const concurrency = 4;

function assertAssetMatches(asset, filePath, source) {
  const size = statSync(filePath).size;
  const sha256 = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  if (size !== asset.size || sha256 !== asset.sha256) {
    throw new Error(`${source} asset mismatch: ${asset.fileName}`);
  }
}

async function runWrangler(args, successText, label) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wranglerCli, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    });
    let output = '';
    let completionTimer;
    let settled = false;

    const recordOutput = chunk => {
      output += String(chunk);
      if (!completionTimer && output.includes(successText)) {
        completionTimer = setTimeout(() => child.kill('SIGTERM'), 100);
      }
    };
    child.stdout.on('data', recordOutput);
    child.stderr.on('data', recordOutput);

    const hardTimeout = setTimeout(() => child.kill('SIGTERM'), 120000);
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      clearTimeout(completionTimer);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      clearTimeout(completionTimer);
      if (code === 0 || (signal === 'SIGTERM' && output.includes(successText))) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed\n${output}`));
    });
  });
}

async function withNetworkRetries(operation) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = /fetch failed|connectivity issue|network/i.test(String(error));
      if (!retryable || attempt === 4) throw error;
      await delay(attempt * 1000);
    }
  }
  throw lastError;
}

async function uploadAsset(asset) {
  const filePath = fileURLToPath(new URL(asset.fileName, assetsDirectory));
  assertAssetMatches(asset, filePath, 'Local');
  await withNetworkRetries(() => runWrangler([
    'r2', 'object', 'put', `${bucket}/${asset.objectKey}`,
    '--remote', '--file', filePath,
    '--content-type', asset.contentType,
    '--config', config,
  ], 'Upload complete.', `Upload ${asset.fileName}`));
}

async function downloadAndVerifyAsset(asset, directory) {
  const filePath = join(directory, asset.fileName);
  await withNetworkRetries(() => runWrangler([
    'r2', 'object', 'get', `${bucket}/${asset.objectKey}`,
    '--remote', '--file', filePath,
    '--config', config,
  ], 'Download complete.', `Download ${asset.fileName}`));
  assertAssetMatches(asset, filePath, 'Remote');
}

async function runPool(operation, verb) {
  let nextIndex = 0;
  let completed = 0;
  async function runNext() {
    while (nextIndex < manifest.assets.length) {
      const index = nextIndex;
      nextIndex += 1;
      const asset = manifest.assets[index];
      await operation(asset);
      completed += 1;
      console.log(`[${completed}/${manifest.assets.length}] ${verb} ${asset.fileName}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => runNext()));
  return completed;
}

const uploaded = await runPool(uploadAsset, 'uploaded');
const verifyDirectory = mkdtempSync(join(tmpdir(), 'cookby-staging-r2-verify-'));
let verified;
try {
  verified = await runPool(asset => downloadAndVerifyAsset(asset, verifyDirectory), 'verified');
} finally {
  rmSync(verifyDirectory, { recursive: true, force: true });
}
console.log(`Uploaded ${uploaded} and remotely verified ${verified} recipe assets in ${bucket} (${targetName}).`);

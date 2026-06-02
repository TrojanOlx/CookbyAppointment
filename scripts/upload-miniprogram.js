const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ci = require('miniprogram-ci');

const root = path.resolve(__dirname, '..');
const projectConfigPath = path.join(root, 'project.config.json');
const packageJsonPath = path.join(root, 'package.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitValue(args, fallback) {
  try {
    return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return fallback;
  }
}

async function main() {
  const projectConfig = readJson(projectConfigPath);
  const packageJson = readJson(packageJsonPath);
  const appid = process.env.APPID || projectConfig.appid;
  const version = process.env.VERSION || packageJson.version;
  const robot = Number(process.env.ROBOT || 1);
  const privateKeyPath = process.env.PRIVATE_KEY_PATH
    || path.join(process.env.HOME || '', '.config/wechat-miniprogram', `${appid}.private.key`);
  const commit = gitValue(['rev-parse', '--short', 'HEAD'], 'unknown');
  const commitTitle = gitValue(['log', '-1', '--pretty=%s'], 'manual upload');
  const desc = process.env.DESC || `${commit} ${commitTitle}`.slice(0, 120);

  if (!appid) {
    throw new Error('Missing appid. Set APPID or configure project.config.json.');
  }

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key not found: ${privateKeyPath}`);
  }

  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath: root,
    privateKeyPath,
    ignores: ['node_modules/**/*']
  });

  console.log(`Uploading miniprogram appid=${appid} version=${version} robot=${robot}`);
  console.log(`Description: ${desc}`);

  const result = await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: projectConfig.setting || {},
    onProgressUpdate: console.log
  });

  console.log('Upload result:', result);
}

main().catch(error => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});

#!/usr/bin/env node

const { execSync, spawn } = require('node:child_process');
const readline = require('node:readline');

function getAvailableDevices() {
  const raw = execSync('xcrun simctl list devices available -j', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(raw);
  const devicesByRuntime = parsed.devices || {};
  const all = [];

  for (const [runtime, devices] of Object.entries(devicesByRuntime)) {
    for (const device of devices) {
      if (!device.isAvailable) continue;
      if (device.name.includes('iPad') || device.name.includes('iPhone')) {
        all.push({
          name: device.name,
          udid: device.udid,
          state: device.state,
          runtime,
        });
      }
    }
  }

  all.sort((a, b) => a.name.localeCompare(b.name) || a.runtime.localeCompare(b.runtime));
  return all;
}

function promptChoice(max) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('请输入要使用的机型编号: ', (answer) => {
      rl.close();
      const idx = Number(answer.trim());
      if (!Number.isInteger(idx) || idx < 1 || idx > max) {
        reject(new Error(`无效编号: ${answer}`));
        return;
      }
      resolve(idx - 1);
    });
  });
}

async function main() {
  const devices = getAvailableDevices();

  if (devices.length === 0) {
    throw new Error('未找到可用 iOS 模拟器，请先在 Xcode 安装模拟器运行时。');
  }

  console.log('可用 iOS 模拟器:');
  devices.forEach((d, i) => {
    const runtime = d.runtime.replace('com.apple.CoreSimulator.SimRuntime.', '');
    console.log(`${i + 1}. ${d.name} | ${runtime} | ${d.state} | ${d.udid}`);
  });

  const pickedIndex = await promptChoice(devices.length);
  const picked = devices[pickedIndex];
  console.log(`\n已选择: ${picked.name} (${picked.runtime})`);

  const child = spawn('pnpm', ['tauri', 'ios', 'dev', picked.name], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});

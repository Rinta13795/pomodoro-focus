#!/usr/bin/env node
// 把 extension/（唯一的扩展源码）同步到 Safari Xcode 项目的 "Shared (Extension)/Resources"。
//
// 用法：
//   node scripts/sync-extension.mjs          同步（复制新增/变化的文件，删除多余文件）
//   node scripts/sync-extension.mjs --check  只检查是否一致，不一致时退出码为 1
//
// 纯 Node 实现，无第三方依赖，macOS / Windows / Linux 均可运行。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'extension');
const DEST = path.join(ROOT, 'safari-extension', '番茄专注', 'Shared (Extension)', 'Resources');

// 只在仓库里用、不需要打进扩展包的文件
const EXCLUDE = new Set(['README.md']);

function isIgnored(name) {
  return name.startsWith('.') || EXCLUDE.has(name);
}

/** 列出目录下所有文件的相对路径（统一用 / 分隔）。 */
function listFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isIgnored(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

function sameContent(a, b) {
  if (!fs.existsSync(b)) return false;
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(dir, entry.name);
      removeEmptyDirs(sub);
      if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
    }
  }
}

function main() {
  const checkOnly = process.argv.includes('--check');

  if (!fs.existsSync(path.join(SRC, 'manifest.json'))) {
    console.error(`找不到扩展源码：${SRC}`);
    process.exit(2);
  }
  if (!fs.existsSync(path.dirname(DEST))) {
    console.error(`找不到 Safari Xcode 项目目录：${path.dirname(DEST)}`);
    process.exit(2);
  }

  const srcFiles = listFiles(SRC);
  const destFiles = listFiles(DEST);
  const srcSet = new Set(srcFiles);

  const toCopy = srcFiles.filter((rel) => !sameContent(path.join(SRC, rel), path.join(DEST, rel)));
  const toDelete = destFiles.filter((rel) => !srcSet.has(rel));

  if (checkOnly) {
    if (toCopy.length === 0 && toDelete.length === 0) {
      console.log('Safari 扩展资源与 extension/ 一致。');
      return;
    }
    for (const rel of toCopy) console.log(`  需要更新: ${rel}`);
    for (const rel of toDelete) console.log(`  需要删除: ${rel}`);
    console.error('Safari 扩展资源已过期，请运行：node scripts/sync-extension.mjs');
    process.exit(1);
  }

  fs.mkdirSync(DEST, { recursive: true });
  for (const rel of toCopy) {
    const target = path.join(DEST, ...rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SRC, ...rel.split('/')), target);
    console.log(`  复制: ${rel}`);
  }
  for (const rel of toDelete) {
    fs.rmSync(path.join(DEST, ...rel.split('/')));
    console.log(`  删除: ${rel}`);
  }
  removeEmptyDirs(DEST);

  console.log(
    `完成：${toCopy.length} 个文件已更新，${toDelete.length} 个多余文件已删除 → ${path.relative(ROOT, DEST)}`,
  );
}

main();

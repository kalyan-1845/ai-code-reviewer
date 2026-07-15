import fs from 'fs';

const DEFAULT_FS_TIMEOUT = parseInt(process.env.FS_TIMEOUT_MS || '30000', 10);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`FS operation timed out after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

export const fsWithTimeout = {
  readFile: (path, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.readFile(path, options), timeout, `readFile(${path})`),

  writeFile: (path, data, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.writeFile(path, data, options), timeout, `writeFile(${path})`),

  readdir: (path, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.readdir(path, options), timeout, `readdir(${path})`),

  stat: (path, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.stat(path), timeout, `stat(${path})`),

  lstat: (path, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.lstat(path), timeout, `lstat(${path})`),

  realpath: (path, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.realpath(path, options), timeout, `realpath(${path})`),

  rename: (oldPath, newPath, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.rename(oldPath, newPath), timeout, `rename(${oldPath})`),

  unlink: (path, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.unlink(path), timeout, `unlink(${path})`),

  rm: (path, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.rm(path, options), timeout, `rm(${path})`),

  mkdir: (path, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.mkdir(path, options), timeout, `mkdir(${path})`),

  access: (path, mode, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.access(path, mode), timeout, `access(${path})`),

  copyFile: (src, dest, flags, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.copyFile(src, dest, flags), timeout, `copyFile(${src})`),

  appendFile: (path, data, options, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.appendFile(path, data, options), timeout, `appendFile(${path})`),

  chmod: (path, mode, timeout = DEFAULT_FS_TIMEOUT) =>
    withTimeout(fs.promises.chmod(path, mode), timeout, `chmod(${path})`),
};

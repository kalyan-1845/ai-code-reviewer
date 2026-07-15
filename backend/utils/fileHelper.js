import fs from 'fs';
import path from 'path';

// Helper to delete a folder recursively
export function deleteFolderRecursive(directoryPath) {
  let isTopLevelSymlink = false;
  try {
    isTopLevelSymlink = fs.lstatSync(directoryPath).isSymbolicLink();
  } catch {
    // Path does not exist or is inaccessible; fall through to the exists check below.
  }
  if (isTopLevelSymlink) {
    // If the directory path itself is a symlink, remove only the link and
    // never recurse into the target (prevents deleting the symlink target's
    // contents, e.g. /etc or a sibling project directory).
    try {
      fs.unlinkSync(directoryPath);
    } catch {
      // Skip if the symlink cannot be removed (e.g., permission error).
    }
    return;
  }
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      let isSymlink = false;
      try {
        const stat = fs.lstatSync(curPath);
        isSymlink = stat.isSymbolicLink();
      } catch {
        // Entry no longer exists or is inaccessible; skip it.
        return;
      }
      if (isSymlink) {
        // Symlinks are skipped to avoid circular-reference DoS or
        // accidentally deleting the symlink target outside this tree.
        // Broken file-symlinks (dangling) also trigger stat failure and
        // land here via the try block; they are simply unlinked.
        try {
          fs.unlinkSync(curPath);
        } catch {
          // Skip if the symlink cannot be removed (e.g., permission error).
        }
        return;
      }
      // Not a symlink — determine if it is a directory.
      let isDir = false;
      try {
        isDir = fs.statSync(curPath).isDirectory();
      } catch {
        // stat failed but lstat succeeded; treat as a regular file.
        try {
          fs.unlinkSync(curPath);
        } catch {
          // Skip.
        }
        return;
      }
      if (isDir) {
        deleteFolderRecursive(curPath);
      } else {
        try {
          fs.unlinkSync(curPath);
        } catch {
          // Skip files that cannot be deleted (e.g., permission errors).
        }
      }
    });
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
}

// Helper to calculate folder size
export async function getFolderSize(dirPath) {
  let size = 0;
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory() && !file.isSymbolicLink()) {
        size += await getFolderSize(filePath);
      } else if (!file.isSymbolicLink()) {
        const stats = await fs.promises.stat(filePath);
        size += stats.size;
      }
    }
  } catch (err) {
    console.warn(`getFolderSize: could not read path ${dirPath}: ${err.message}`);
  }
  return size;
}

// Helper to resolve and validate paths to prevent directory traversal
export function resolveSafePath(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const absolutePath = path.resolve(resolvedBase, targetPath);

  // Allow the base directory itself, otherwise require it to be strictly inside
  if (!absolutePath.startsWith(resolvedBase + path.sep) && absolutePath !== resolvedBase) {
    throw new Error('Path traversal blocked');
  }

  return absolutePath;
}

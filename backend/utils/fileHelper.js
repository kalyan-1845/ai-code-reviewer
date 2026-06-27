import fs from 'fs';
import path from 'path';

// 🟢 Helper to delete a folder recursively
export async function deleteFolderRecursive(directoryPath) {
  try {
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
  } catch (err) {
    // Ignore errors if folder doesn't exist
  }
}

// 🟢 Helper to calculate folder size
export async function getFolderSize(dirPath) {
  let size = 0;
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += await getFolderSize(filePath);
      } else {
        const stats = await fs.promises.stat(filePath);
        size += stats.size;
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return size;
}

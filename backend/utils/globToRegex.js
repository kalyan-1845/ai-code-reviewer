export function globToRegex(pattern) {
  // Escape regex metacharacters (except the glob wildcards * and ?) so that
  // file names containing them are matched literally.
  let re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Transform glob wildcards (placeholders avoid re-processing replacements):
  //   ?    -> exactly one char, never '/'
  //   **/  -> zero or more directories (optionally incl. the trailing '/')
  //   **   -> anything, including '/'
  //   *    -> any run of chars, never crossing '/'
  re = re
    .replace(/\?/g, '[^/]')
    .replace(/\*\*\//g, '\x01')
    .replace(/\*\*/g, '\x02')
    .replace(/\*/g, '[^/]*')
    .replace(/\x01/g, '(?:.*/)?')
    .replace(/\x02/g, '.*');
  return new RegExp(`^${re}$`);
}

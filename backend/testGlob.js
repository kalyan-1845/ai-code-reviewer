
const pattern = '**/node_modules/**';
const escaped = pattern
    .replace(/[.+^$(){}|[\]\\]/g, '\\$&')
    .replace(/\*\*\/+/g, '__GLOBSTAR__')
    .replace(/\*\*/g, '__GLOBSTAR_END__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GLOBSTAR__/g, '(?:.*/)?')
    .replace(/__GLOBSTAR_END__/g, '.*');
const regex = new RegExp('^' + escaped + '$');
console.log('Regex:', regex);
console.log('1:', regex.test('node_modules/pkg/index.js'));
console.log('2:', regex.test('src/node_modules/pkg/index.js'));
console.log('3:', regex.test('pkg/index.js'));


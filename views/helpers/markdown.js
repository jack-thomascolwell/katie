const { publicURL } = require('../../files');
const baseURL = publicURL('');

module.exports = (() => {
  const md = new require('markdown-it')();
  return function(str, id) {
    if (!str) return '';
    const replacedStr = str.replace(/\!\[([^\]]*)\]\(([^\)]*)\)/g, `![$1](${baseURL}articles/${id}/$2)`);
    return md.render(replacedStr);
  };
})();

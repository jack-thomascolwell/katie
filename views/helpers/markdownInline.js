module.exports = (() => {
  const md = new require('markdown-it')();
  return function(str, id) {
    if (!str) return '';
    return md.renderInline(str);
  };
})();

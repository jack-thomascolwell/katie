module.exports = (() => {
  const md = new require('markdown-it')();
  return function(str, id) {
    return md.renderInline(str);
  };
})();

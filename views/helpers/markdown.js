module.exports = (() => {
  const md = new require('markdown-it')();
  return function(str, id) {
    const replacedStr = str.replace(/\!\[([^\]]*)\]\(([^\)]*)\)/g, `![$1](/articles/${id}/images/$2))`);
    return md.render(replacedStr);
  };
})();

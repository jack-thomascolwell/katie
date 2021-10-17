module.exports = (() => {
  const md = new require('markdown-it')();
  return function(str, id) {
    const replacedStr = str.replace(/\!\[([^\]]*)\]\(([^\)]*)\)/g, `![$1](/articles/${id}/images/$2)`);
    console.log([str, replacedStr])
    return md.render(replacedStr);
  };
})();

module.exports = function (str, id) {
  const replacedStr = str.replace(/\!\[([^\]]*)\]\(([^\)]*)\)/g, `![$1](/articles/${id}/images/$2))`);

  const md = new require('markdown-it')();
  return md.render(replacedStr);
};

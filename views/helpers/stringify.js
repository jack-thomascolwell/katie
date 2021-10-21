module.exports = (() => {
  return function(obj) {
    if (!obj) return '';
    return JSON.stringify(obj);
  };
})();

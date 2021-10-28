'use strict';

const { publicURL } = require('../../files');
const baseURL = publicURL('');

module.exports = function(path, options) {
  return baseURL;
};

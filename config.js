module.exports = {
  server: {
    port: parseInt(process.env.PORT) || 4000,
    baseUrl: 'localhost:4000'
  },
  mongodb: {
    url: `mongodb+srv://catscratchmagazine:${process.env.DBPASS || "<password>"}@catscratch.ejqy0.mongodb.net/catscratch?retryWrites=true&w=majority`
  },
  auth: {
    cookieName: 'auth'
  },
  paginate: {
    articles: 10,
    zine: 5,
    radio: 5
  }
};

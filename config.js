module.exports = {
  server: {
    port: parseInt(process.env.PORT) || 4000,
    //host: 'localhost'
  },
  mongodb: {
    url: `mongodb+srv://catscratchmagazine:${process.env.DBPASS || "<password>"}@catscratch.ejqy0.mongodb.net/catscratch?retryWrites=true&w=majority`
  },
  auth: {
    cookieName: 'auth'
  },
  paginate: {
    articles: 5,
    zines: 3,
    radio: 5
  }
};

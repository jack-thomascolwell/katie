module.exports = {
  server: {
    port: parseInt(process.env.PORT) || 4000,
    baseUrl: 'localhost:4000'
  },
  mongodb: {
    url: `mongodb+srv://catscratchmagazine:${process.env.DBPASS || "<password>"}@catscratch.ejqy0.mongodb.net/catscratch?retryWrites=true&w=majority`
  },
  gcloud: {
    jsonAuth: process.env.GOOGLE_CLOUD_JSON,
    jsonPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    bucket: process.env.GCLOUD_STORAGE_BUCKET
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

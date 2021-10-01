module.exports = {
  server: {
    port: parseInt(process.env.PORT) || 4000,
    //host: 'localhost'
  },
  mongodb: {
    url: 'mongodb+srv://jack-thomascolwell:K2H1cIxbGONkhasE@cluster0.vk82t.mongodb.net/myFirstDatabase?retryWrites=true&w=majority'
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

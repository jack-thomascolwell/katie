'use strict';

const Bcrypt = require('bcrypt');
const Hapi = require('@hapi/hapi');
const Joi = require('joi');
const config = require('./config');

const start = async function() {

  const server = Hapi.server({
    port: config.server.port,
    //host: config.server.host
  });

  // PLUGINS
  await server.register(require('@hapi/cookie'));
  await server.register(require('@hapi/vision'));
  await server.register(require('@hapi/inert'));

  // DB
  console.log("Connecting to mongodb")
  await server.register({
    plugin: require('hapi-mongodb'),
    options: {
      url: config.mongodb.url,
      settings: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      },
      decorate: true
    }
  });
  console.log("Connected to mongodb")

  // AUTH
  server.auth.strategy('session', 'cookie', {
    cookie: {
      name: config.auth.cookieName,
      password: '!wsYhFA*C2U6nz=Bu^%A@^F#SF3&kSR6',
      isSecure: false
    },
    redirectTo: '/login',
    validateFunc: async (request, session) => {
      const account = await request.mongo.db.collection('users').findOne({
        _id: new request.mongo.ObjectId(session._id)
      });

      if (!account) return {
        valid: false
      };

      return {
        valid: true,
        credentials: account
      };
    }
  });

  server.auth.default('session');

  // VIEWS
  server.views({
    engines: {
      html: require('handlebars')
    },
    relativeTo: __dirname,
    path: 'views',
    layoutPath: 'views/layouts',
    helpersPath: 'views/helpers',
    partialsPath: 'views/partials',
    layout: 'layout'
  });

  // STATIC
  server.route({
    method: 'GET',
    path: '/public/{param*}',
    handler: {
      directory: {
        path: 'public',
        redirectToSlash: true
      }
    },
    options: {
      auth: false
    }
  });

  // ROUTES
  server.route(require('./routes/user.js'));
  server.route(require('./routes/articles.js'));
  server.route(require('./routes/radioArchive.js'));
  server.route(require('./routes/zine.js'));
  server.route(require('./routes/author.js'));

  server.route([{
    method: 'GET',
    path: '/',
    handler: async function(request, h) {
      const articles = await request.mongo.db.collection('articles').find({}, {
        projection: {
          title: 1,
          abstract: 1,
          author: 1,
          published: 1,
          _id: 1
        }
      }).sort({
        published: -1,
        _id: -1
      }).limit(6).toArray();

      for (let i in articles) {
        let author = await request.mongo.db.collection('authors').findOne({
          _id: articles[i].author
        }, {
          projection: {
            name: 1,
            bio: 1,
            email: 1,
            _id: 1
          }
        });
        articles[i].author = author;
      }

      const featuredArticle = articles[0];
      return h.view('index', {
        articles: articles.slice(1),
        featuredArticle: featuredArticle,
        landing: true,
        admin: (request.auth.isAuthenticated && (request.auth.credentials.admin === true))
      });
    },
    options: {
      auth: {
        mode: 'try'
      }
    }
  }, {
    method: 'GET',
    path: '/about',
    handler: async function(request, h) {
      return h.view('about');
    },
    options: {
      auth: false
    }
  }, {
    method: 'GET',
    path: '/login',
    handler: function(request, h) {
      if (request.auth.isAuthenticated)
        return h.redirect('/');

      return h.view('login');
    },
    options: {
      auth: {
        mode: 'try'
      }
    }
  }, {
    method: 'POST',
    path: '/login',
    handler: async (request, h) => {
      if (request.auth.isAuthenticated)
        return h.redirect('/');

      let payload = request.payload;
      if (payload.email) payload.email = payload.email.toLowerCase();

      const schema = Joi.object({
        _id: Joi.any().forbidden(),
        email: Joi.string().required(),
        password: Joi.string().required(),
      });

      const {
        error,
        value
      } = schema.validate(payload);

      if (error) return h.view('login', {
        email: payload.email
      });

      const {
        email,
        password
      } = payload;

      const account = await request.mongo.db.collection('users').findOne({
        email: email
      });

      if (!account || !(await Bcrypt.compare(password, account.password))) {
        return h.view('login', {
          error: 'Incorrect username or password',
          email: email
        });
      }

      request.cookieAuth.set({
        _id: account._id
      });

      return h.redirect('/');
    },
    options: {
      auth: {
        mode: 'try'
      }
    }
  }]);

  await server.start();
  console.log('server running at: ' + server.info.uri);
};

start();

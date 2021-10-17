'use strict';

const Bcrypt = require('bcrypt');
const Hapi = require('@hapi/hapi');
const Joi = require('joi');
const config = require('./config');
const Throttle = require('throttle');
const Stream = require('stream');

function shuffle(array) {
  return array //.sort(() => Math.random() - 0.5);
}

class StreamQueue {
  constructor(io, mongo) {
    this._io = io;
    this._mongo = mongo;
    this._sinks = [];
    this._currentSong = null;
    this._songs = [];
    this.stream = new Stream.EventEmitter();
  }
  makeSink() {
    const sink = Stream.PassThrough();
    this._sinks.push(sink);
    return sink;
  }
  _broadcast(chunk) {
    for (const sink of this._sinks)
      sink.write(chunk);
  }
  _getBitRate(song) {
    const bitRate = 320048 //ffprobeSync(`${__dirname}/songs/${song}`).format.bit_rate;
    return bitRate //parseInt(bitRate);
  }
  async _getSongs() {
    const radio = await this._mongo.db.collection('radio').find({}, {
      projection: {
        _id: 1
      }
    }).toArray();

    return radio;
  }
  async _playLoop() {
    if (this._songs.length == 0) { // queue is empty
      this._songs = await this._getSongs();
    }
    if (this._songs.length == 0) return;
    const id = this._songs.pop()._id;
    this._currentSong = await this._mongo.db.collection('radio').findOne({
      _id: id
    }, {
      projection: {
        _id: 1,
        title: 1,
        author: 1,
        published: 1,
        artist: 1,
        blurb: 1,
        song: 1,
      }
    });
    if (!this._currentSong) return this._playLoop();
    const author = await this._mongo.db.collection('authors').findOne({
      _id: this._currentSong.author
    }, {
      projection: {
        name: 1,
        _id: 1
      }
    });
    console.log(author);
    this._currentSong.author = author.name;

    try {
      this._io.emit('newSong', this._currentSong);
    } catch (e) {
      console.log(e);
    }

    console.log(`Now playing ${this._currentSong.title} by ${this._currentSong.artist}`);
    const bitRate = this._getBitRate(this._currentSong.song);

    const bucket = new this._mongo.lib.GridFSBucket(this._mongo.db);

    const readable = bucket.openDownloadStream(this._currentSong.song); // Fs.createReadStream(`${__dirname}/songs/${this._currentSong.song}`);
    const throttleTransformable = new Throttle(bitRate / 8);
    throttleTransformable.on('data', (chunk) => this._broadcast(chunk)).on('end', () => this._playLoop());

    readable.pipe(throttleTransformable);
  }
  startStreaming() {
    this._playLoop();
  }
  songData() {
    return this._currentSong;
  }
}

const start = async function() {

  const server = Hapi.server({
    port: config.server.port,
    //host: config.server.host
  });

  const io = require("socket.io")(server.listener, {
    path: "/streamMeta"
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

  // STREAM
  const queue = new StreamQueue(io, server.mongo);
  queue.startStreaming();
  console.log("Started stream");

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
        console.log([author, articles[i].author]);
        articles[i].author = author;
      }
      console.log(articles)

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
    path: '/radio',
    handler: async function(request, h) {
      const currentSongData = queue.songData();
      return h.view('radio', {
        songData: currentSongData,
        radio: true
      });
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
  }, {
    method: 'GET',
    path: '/logout',
    handler: async (request, h) => {
      request.cookieAuth.clear();
      return h.redirect('/');
    }
  }, {
    method: 'GET',
    path: '/stream',
    handler: async (request, h) => {
      const sink = queue.makeSink();
      return h.response(sink).type('audio/mpeg');
    },
    options: {
      auth: false
    }
  }]);

  await server.start();
  console.log('server running at: ' + server.info.uri);
};

start();

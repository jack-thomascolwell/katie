const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');
/*
Author Schema
{
_id: ObjectID
profile: ObjectID,
name: String,
bio: Date,
email: String,
}
*/

module.exports = [{
  method: 'GET',
  path: '/authors',
  handler: async (request, h) => {
    const page = (parseInt(request.query.page) || 1) - 1;
    const perPage = config.paginate.articles;

    const authors = await request.mongo.db.collection('authors').find({}, {
      projection: {
        name: 1,
        bio: 1,
        email: 1,
        _id: 1
      }
    }).sort({
      name: 1,
      _id: -1
    }).skip(page * perPage).limit(perPage).toArray();


    const pages = await request.mongo.db.collection('authors').count({});

    return h.view('authors', {
      authors: authors,
      admin: (request.auth.isAuthenticated && (request.auth.credentials.admin === true)),
      maxPage: Math.ceil(pages / perPage),
      page: page + 1
    });
  },
  options: {
    auth: {
      mode: 'try'
    }
  }
}, {
  method: 'GET',
  path: '/authors/{id}',
  handler: async (request, h) => {
    const page = (parseInt(request.query.page) || 1) - 1;
    const perPage = config.paginate.articles;

    const id = request.params.id;
    const author = await request.mongo.db.collection('authors').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        email: 1,
        bio: 1,
        name: 1,
        _id: 1,
      }
    });
    if (!author) return h.redirect('/authors');
    let articles = await request.mongo.db.collection('articles').find({
      author: author._id,
    }, {
      projection: {
        title: 1,
        author: 1,
        published: 1,
        abstract: 1,
        _id: 1
      }
    }).sort({
      name: 1,
      _id: -1,
    }).skip(page * perPage).limit(perPage).toArray();
    articles = articles.map(article => {
      article.author = author;
      return article;
    });
    console.log(articles);

    const pages = await request.mongo.db.collection('articles').count({
      author: author._id,
    });

    return h.view('author', {
      author: author,
      admin: (request.auth.isAuthenticated && (request.auth.credentials.admin === true)),
      articles: articles,
      maxPage: Math.ceil(pages / perPage),
      page: page + 1
    });
  },
  options: {
    auth: {
      mode: 'try'
    },
    validate: {
      params: Joi.object({
        id: Joi.string().required()
      })
    }
  }
}, {
  method: 'GET',
  path: '/authors/profile/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const author = await request.mongo.db.collection('authors').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        _id: 1,
        profile: 1
      }
    });
    if (!author) return h.response('Author not found').code(404);

    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    const profileFiles = await bucket.find({
      _id: author.profile
    }).project({
      _id: 1,
      filename: 1,
      metadata: 1,
    }).toArray();
    if (!profileFiles || !profileFiles[0]) return h.response('Profiile not found').code(404);
    const stream = bucket.openDownloadStream(profileFiles[0]._id);
    return h.response(stream).header('Content-Disposition', `attachment; filename= ${profileFiles[0].metadata.originalFilename}`).type(profileFiles[0].metadata.type);
  },
  options: {
    auth: false,
    validate: {
      params: Joi.object({
        id: Joi.string().required()
      })
    }
  }
}, {
  method: 'GET',
  path: '/authors/new',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    return h.view('author-new');
  }
}, {
  method: 'POST',
  path: '/authors/new',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    let payload = request.payload;

    if (payload.profile.hapi.filename == '') payload.profile = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      bio: Joi.string().required(),
      name: Joi.string().required(),
      profile: Joi.any().required(),
      email: Joi.string().required()
    });
    const {
      error,
      value
    } = schema.validate(payload);

    if (error) return h.view('author-new', {
      error: error,
      author: payload
    });

    // File uploads
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);

    const profileUploadStream = bucket.openUploadStream('profile', {
      chunkSizeBytes: 1048576,
      metadata: {
        originalFilename: payload.profile.hapi.filename,
        type: payload.profile.hapi.headers['content-type']
      }
    });
    const profileID = new request.mongo.ObjectID(payload.profile.pipe(profileUploadStream).id);

    const author = {
      name: payload.name,
      bio: payload.bio,
      profile: profileID,
      email: payload.email
    };

    const status = await request.mongo.db.collection('authors').insertOne(author);
    if (status.acknowledged === true) return h.redirect(`/authors`);
    return status.acknowledged;
  },
  options: {
    payload: {
      maxBytes: 500 * 1048576, //500MB
      output: 'stream',
      parse: true,
      multipart: true
    },
  }
}, {
  method: 'DELETE',
  path: '/authors/{id}',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    const author = await request.mongo.db.collection('authors').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        pdf: 1,
        _id: 1
      }
    });
    if (!author) return false;

    // delete associated images
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    await bucket.delete(author.profile);
    const status = await request.mongo.db.collection('authors').deleteOne({
      _id: new request.mongo.ObjectID(id)
    });
    return status.acknowledged;
  },
  options: {
    validate: {
      params: Joi.object({
        id: Joi.string().required()
      })
    }
  }
}];

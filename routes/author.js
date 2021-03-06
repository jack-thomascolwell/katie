const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');

const {deleteFile, uploadFileStream } = require('../files');

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
      page: page + 1,
      metatitle: "authors",
      metadesc: "cat scratch magazine is a platform for creativity and critical analysis based in the digital underground. Our pieces explore up-and-coming artists through the lens of armchair psychology and literary dramatization, while remaining well-researched and thoughtfully edited. By continuing the literary tradition of zine curation, we hope to educate and excite our readers by allowing a brief glance into the minds of their favorite artists."
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

    const pages = await request.mongo.db.collection('articles').count({
      author: author._id,
    });

    return h.view('author', {
      author: author,
      admin: (request.auth.isAuthenticated && (request.auth.credentials.admin === true)),
      articles: articles,
      maxPage: Math.ceil(pages / perPage),
      page: page + 1,
      metatitle: author.name,
      metadesc: author.bio
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
    console.log('new author')
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

    const author = {
      name: payload.name,
      bio: payload.bio,
      email: payload.email
    };

    const status = await request.mongo.db.collection('authors').insertOne(author);
    if (status.acknowledged !== true) return false;

    // File uploads
    const blobStream = uploadFileStream(`authors/${status.insertedId}/profile`);
    payload.profile.pipe(blobStream);

    return h.redirect(`/authors/${status.insertedId}`);
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
        profile: 1,
        _id: 1
      }
    });
    if (!author) return false;

    // check for associated records
    const articles = await request.mongo.db.collection('authors').find({
      author: author._id
    }).toArray();
    const radio = await request.mongo.db.collection('radio').find({
      author: author._id
    }).toArray();
    if (articles.length != 0 || radio.length != 0) return false;

    // delete associated images
    await deleteFile(`authors/${id}/profile`);
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
}, {
  method: 'GET',
  path: '/authors/{id}/edit',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    let author = await request.mongo.db.collection('authors').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        name: 1,
        bio: 1,
        email: 1,
        _id: 1
      }
    });
    if (!author) return h.response('Author not found').code(404);

    return h.view('author-edit', {
      author: author,
    });
  },
  options: {
    validate: {
      params: Joi.object({
        id: Joi.string().required()
      })
    }
  }
}, {
  method: 'POST',
  path: '/authors/{id}/edit',
  handler: async (request, h) => {
    //auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;

    let author = await request.mongo.db.collection('authors').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        name: 1,
        bio: 1,
        email: 1,
        _id: 1
      }
    });

    if (!author) return h.redirect('/authors')

    let payload = request.payload;
    if (payload.profile && payload.profile.hapi.filename == '') payload.profile = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      bio: Joi.string(),
      name: Joi.string(),
      profile: Joi.any(),
      email: Joi.string()
    });

    const {
      error,
      value
    } = schema.validate(payload);

    if (error) {
      return h.view('author-edit', {
        error: error,
        author: payload
      });
    }

    const authorUpdate = {
      name: payload.name,
      bio: payload.bio,
      email: payload.email,
    };

    if (payload.profile) {
      await deleteFile(`authors/${id}/profile`);
      const blobStream = uploadFileStream(`authors/${id}/profile`);
      payload.profile.pipe(blobStream);
    }

    const status = await request.mongo.db.collection('authors').updateOne({
      _id: new request.mongo.ObjectID(id)
    }, {
      $set: authorUpdate
    });
    if (status.acknowledged === true) return h.redirect(`/authors/${id}`);
    return status.acknowledged;
  },
  options: {
    validate: {
      params: Joi.object({
        id: Joi.string().required()
      })
    },
    payload: {
      maxBytes: 500 * 1048576, //500MB
      output: 'stream',
      parse: true,
      multipart: true
    },
  }
}];

const Joi = require('joi');
const Stream = require('stream');
/*
Article Schema
{
_id: ObjectID
title: String
body: String (MD)
images: [ObjectID] (IMG)
cover: ObjectID (IMG)
author: String
published: Date
abstract: String
}
*/

module.exports = [{
  method: 'GET',
  path: '/articles',
  handler: async (request, h) => {
    const articles = await request.mongo.db.collection('articles').find({}, {
      projection: {
        title: 1,
        author: 1,
        published: 1,
        abstract: 1,
        _id: 1
      }
    }).sort({
      _id: -1
    }).toArray();
    return h.view('articles', {
      articles: articles
    });
  },
  options: {
    auth: false
  }
}, {
  method: 'GET',
  path: '/articles/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const article = await request.mongo.db.collection('articles').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        title: 1,
        body: 1,
        author: 1,
        published: 1,
        _id: 1,
      }
    });
    if (!article) return h.redirect('/articles');
    return h.view('article', {
      article: article,
      admin: (request.auth.isAuthenticated || (request.auth.credentials.admin === true))
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
  path: '/articles/{id}/images/{imageName}',
  handler: async (request, h) => {
    const id = request.params.id;
    const imageName = request.params.imageName;
    const article = await request.mongo.db.collection('articles').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        cover: 1,
        images: 1,
        _id: 1,
      }
    });
    console.log('article')
    console.log(article)
    if (!article) return h.response('Image not found').code(404);
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    const matchingIDs = await bucket.find({
      _id: {
        $in: [article.cover, ...article.images]
      },
      filename: imageName
    }).project({
      _id: 1,
      filename: 1,
      metadata: 1,
    }).toArray();
    console.log([article.cover, ...article.images])
    console.log(matchingIDs);
    console.log(!matchingIDs || !matchingIDs[0])
    if (!matchingIDs || !matchingIDs[0]) return h.response('Image not found').code(404);
    const stream = bucket.openDownloadStream(matchingIDs[0]._id);
    return h.response(stream).header('Content-Disposition', `attachment; filename= ${matchingIDs[0].metadata.originalFilename}`).type(matchingIDs[0].metadata.type);
  },
  options: {
    auth: false,
    validate: {
      params: Joi.object({
        id: Joi.string().required(),
        imageName: Joi.string().required()
      })
    }
  }
}, {
  method: 'GET',
  path: '/articles/{id}/edit',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    const article = await request.mongo.db.collection('articles').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        title: 1,
        body: 1,
        author: 1,
        published: 1,
        abstract: 1,
        _id: 1
      }
    });
    return h.view('article-edit', {
      article: article
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
  path: '/articles/{id}/edit',
  handler: async (request, h) => {
    //auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;

    const article = await request.mongo.db.collection('articles').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        title: 1,
        body: 1,
        author: 1,
        published: 1,
        images: 1,
        cover: 1,
        abstract: 1,
        _id: 1
      }
    });

    if (!article) return h.redirect('/articles')

    let payload = request.payload;
    if (!Array.isArray(payload.images) && payload.images.hapi.filename != '') payload.images = [payload.images];
    else if (!Array.isArray(payload.images) && payload.images.hapi.filename == '') payload.images = undefined;

    if (payload.cover.hapi.filename == '') payload.cover = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      title: Joi.string(),
      published: Joi.date(),
      body: Joi.string(),
      abstract: Joi.string(),
      author: Joi.string(),
      images: Joi.array(),
      cover: Joi.any()
    });
    const {
      error,
      value
    } = schema.validate(payload);

    if (error) return h.view('article-edit', {
      error: error,
      article: payload
    });

    const articleUpdate = {
      title: payload.title,
      published: payload.published,
      body: payload.body,
      abstract: payload.abstract,
      author: payload.author,
    };
    if (payload.cover || payload.images) {
      // File uploads -> delete and reupload
      console.log("UPDATING FILES")
      const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
      if (payload.cover) {
        console.log("UPDATING COVER")
        const oldCover = article.cover;
        const oldCoverDoc = await bucket.find({ _id: oldCover });
        if (oldCover && oldCover[0]) await bucket.delete(oldCover);
        const newCover = (payload.cover.pipe(bucket.openUploadStream('cover', {
          chunkSizeBytes: 1048576,
          metadata: {
            originalFilename: payload.cover.hapi.filename,
            type: payload.cover.hapi.headers['content-type']
          }
        })).id);
        articleUpdate.cover = newCover;
      }
      if (payload.images) {
        console.log("UPDATING IMAGES")
        const oldImages = article.images;
        oldImages.forEach(async image => {
          const imageDoc = await bucket.find({ _id: image });
          if (imageDoc && imageDoc[0]) await bucket.delete(image);
        });
        const newImages = payload.images.map(image => (image.pipe(bucket.openUploadStream(image.hapi.filename, {
          chunkSizeBytes: 1048576,
          metadata: {
            filename: image.hapi.filename,
            type: image.hapi.headers['content-type']
          }
        })).id));
        articleUpdate.images = newImages;
      }
      console.log("UPDATED FILES")
    }
    console.log(id)
    console.log(articleUpdate);
    const status = await request.mongo.db.collection('articles').updateOne({
      _id: new request.mongo.ObjectID(id)
    }, { $set: articleUpdate });
    console.log(status);
    if (status.acknowledged === true) return h.redirect(`/articles/${id}`);
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
}, {
  method: 'GET',
  path: '/articles/new',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    return h.view('article-new');
  }
}, {
  method: 'POST',
  path: '/articles/new',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    let payload = request.payload;

    if (!Array.isArray(payload.images) && payload.images.hapi.filename != '') payload.images = [payload.images];
    else if (!Array.isArray(payload.images) && payload.images.hapi.filename == '') payload.images = undefined;

    if (payload.cover.hapi.filename == '') payload.cover = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      title: Joi.string().required(),
      published: Joi.date().required(),
      body: Joi.string().required(),
      abstract: Joi.string().required(),
      author: Joi.string().required(),
      images: Joi.array().required(),
      cover: Joi.any().required()
    });
    const {
      error,
      value
    } = schema.validate(payload);


    if (error) return h.view('article-new', {
      error: error,
      article: payload
    });

    // File uploads
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);

    const coverID = (payload.cover.pipe(bucket.openUploadStream('cover', {
      chunkSizeBytes: 1048576,
      metadata: {
        originalFilename: payload.cover.hapi.filename,
        type: payload.cover.hapi.headers['content-type']
      }
    })).id);

    const imageIDs = payload.images.map(image => (image.pipe(bucket.openUploadStream(image.hapi.filename, {
      chunkSizeBytes: 1048576,
      metadata: {
        originalFilename: image.hapi.filename,
        type: image.hapi.headers['content-type']
      }
    })).id));

    const article = {
      title: payload.title,
      published: payload.published,
      body: payload.body,
      abstract: payload.abstract,
      author: payload.author,
      cover: coverID,
      images: imageIDs
    };

    const status = await request.mongo.db.collection('articles').insertOne(article);
    if (status.acknowledged === true) return h.redirect(`/articles/${status.insertedId}`);
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
  path: '/articles/{id}',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    const id = request.params.id;
    const article = await request.mongo.db.collection('articles').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        images: 1,
        cover: 1,
        _id: 1
      }
    });

    if (!article) return false;

    // delete associated images
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    bucket.delete(article.cover);
    article.images.forEach(image => {
      bucket.delete(image);
    });

    const status = await request.mongo.db.collection('articles').deleteOne({
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

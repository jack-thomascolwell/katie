const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');
/*
Article Schema
{
_id: ObjectID
title: String
body: String (MD)
images: [ObjectID] (IMG)
cover: ObjectID (IMG)
author: ObjectID
published: Date
abstract: String
}
*/

module.exports = [{
  method: 'GET',
  path: '/articles',
  handler: async (request, h) => {
    const page = (parseInt(request.query.page) || 1) - 1;
    const perPage = config.paginate.articles;

    let articles = await request.mongo.db.collection('articles').find({}, {
      projection: {
        title: 1,
        author: 1,
        published: 1,
        abstract: 1,
        _id: 1
      }
    }).sort({
      published: -1,
      _id: -1
    }).skip(page * perPage).limit(perPage).toArray();

    articles.forEach(async article => {
      let author = await request.mongo.db.collection('authors').findOne({
        _id: article.author
      }, {
        projection: {
          name: 1,
          bio: 1,
          email: 1,
          _id: 1
        }
      });
      article.author = author;
    });

    const pages = await request.mongo.db.collection('articles').count({});

    return h.view('articles', {
      articles: articles,
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

    let author = await request.mongo.db.collection('authors').findOne({
      _id: article.author
    }, {
      projection: {
        name: 1,
        bio: 1,
        email: 1,
        _id: 1
      }
    });

    return h.view('article', {
      article: article,
      author: author,
      admin: (request.auth.isAuthenticated && (request.auth.credentials.admin === true))
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
    let article = await request.mongo.db.collection('articles').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        title: 1,
        body: 1,
        author: 1,
        published: 1,
        abstract: 1,
        images: 1,
        _id: 1
      }
    });
    if (!article) return h.response('Article not found').code(404);

    const authors = await request.mongo.db.collection('authors').find({}, {
      projection: {
        name: 1,
        _id: 1
      }
    }).sort({
      name: 1,
      id: -1
    }).toArray();

    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    const matchingImages = await bucket.find({
      _id: {
        $in: article.images
      }
    }).project({
      _id: 1,
      filename: 1,
      metadata: 1,
    }).toArray();
    article.images = matchingImages;
    return h.view('article-edit', {
      article: article,
      authors: authors
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
    if (!Array.isArray(payload.newImages) && payload.newImages.hapi.filename != '') payload.newImages = [payload.newImages];
    else if (!Array.isArray(payload.newImages) && payload.newImages.hapi.filename == '') payload.newImages = undefined;

    if (payload.cover.hapi.filename == '') payload.cover = undefined;

    if (payload.oldImages) payload.oldImages = JSON.parse(payload.oldImages);

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      title: Joi.string(),
      published: Joi.date(),
      body: Joi.string(),
      abstract: Joi.string(),
      author: Joi.any(),
      newImages: Joi.array(),
      cover: Joi.any(),
      oldImages: Joi.array(),
    });
    const {
      error,
      value
    } = schema.validate(payload);

    if (!error) {
      const author = await request.mongo.db.collection('authors').findOne({
        _id: new request.mongo.ObjectID(payload.author)
      }, {
        projection: {
          name: 1,
          _id: 1
        }
      });
      if (!author) error = 'Author does not exist'
    }

    if (error) {
      payload.images = article.images;

      const authors = await request.mongo.db.collection('authors').find({}, {
        projection: {
          name: 1,
          _id: 1
        }
      }).sort({
        name: 1,
        id: -1
      }).toArray();

      return h.view('article-edit', {
        error: error,
        article: payload,
        authors: authors
      });
    }

    const articleUpdate = {
      title: payload.title,
      published: payload.published,
      body: payload.body,
      abstract: payload.abstract,
      author: new request.mongo.ObjectID(payload.author),
    };

    let images = article.images;

    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    if (payload.cover) {
      console.log("UPDATING COVER")
      const oldCover = article.cover;
      const oldCoverDoc = await bucket.find({
        _id: oldCover
      });
      if (oldCoverDoc && oldCoverDoc[0]) await bucket.delete(oldCover);
      const newCover = (payload.cover.pipe(bucket.openUploadStream('cover', {
        chunkSizeBytes: 1048576,
        metadata: {
          originalFilename: payload.cover.hapi.filename,
          type: payload.cover.hapi.headers['content-type']
        }
      })).id);
      articleUpdate.cover = newCover;
    }

    if (payload.oldImages) {
      console.log("DELETING OLD IMAGES")
      payload.oldImages.forEach(async image => {
        const imageID = new request.mongo.ObjectID(id);
        const imageDoc = await bucket.find({
          _id: imageID
        });
        if (imageDoc && imageDoc[0]) await bucket.delete(image);
        images = images.splice(article.images.indexOf(imageID), 1);
      });
    }

    if (payload.newImages) {
      console.log("INSERTING NEW IMAGES")
      const newImages = payload.newImages.map(image => (image.pipe(bucket.openUploadStream(image.hapi.filename, {
        chunkSizeBytes: 1048576,
        metadata: {
          filename: image.hapi.filename,
          type: image.hapi.headers['content-type']
        }
      })).id));
      images = images.concat(newImages);
    }

    articleUpdate.images = images;

    const status = await request.mongo.db.collection('articles').updateOne({
      _id: new request.mongo.ObjectID(id)
    }, {
      $set: articleUpdate
    });
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

    const authors = await request.mongo.db.collection('authors').find({}, {
      projection: {
        name: 1,
        _id: 1
      }
    }).sort({
      name: 1,
      id: -1
    }).toArray();

    return h.view('article-new', {
      authors: authors
    });
  }
}, {
  method: 'POST',
  path: '/articles/new',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    let payload = request.payload;

    if (!Array.isArray(payload.images) && payload.images.hapi.filename != '') payload.images = [payload.images];
    else if (!Array.isArray(payload.images) && payload.images.hapi.filename == '') payload.images = [];

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


    if (!error) {
      const author = await request.mongo.db.collection('authors').findOne({
        _id: new request.mongo.ObjectID(payload.author)
      }, {
        projection: {
          name: 1,
          _id: 1
        }
      });
      if (!author) error = 'Author does not exist'
    }

    if (error) {
      const authors = await request.mongo.db.collection('authors').find({}, {
        projection: {
          name: 1,
          _id: 1
        }
      }).sort({
        name: 1,
        id: -1
      }).toArray();

      return h.view('article-new', {
        error: error,
        article: payload,
        authors: authors
      });
    }

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
      author: new request.mongo.ObjectID(payload.author),
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

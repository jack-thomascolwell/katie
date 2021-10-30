const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');

const {
  deleteFile,
  uploadFileStream
} = require('../files');

/*
Radio Schema
{
_id: ObjectID
title: String,
blurb: String,
artist: String,
author: String,
published: Date,
song: ObjectID,
art: ObjectID,
}
*/

async function getQueue(request) {
  const radio = await request.mongo.db.collection('radio').find({}, {
    projection: {
      title: 1,
      artist: 1,
      author: 1,
      published: 1,
      blurb: 1,
      _id: 1,
    }
  }).toArray();

  for (let i = 0; i < radio.length; i++) {
    const author = await request.mongo.db.collection('authors').findOne({
      _id: radio[i].author
    }, {
      projection: {
        name: 1,
        _id: 1
      }
    });
    radio[i].author = author.name;
  }

  for (let i = radio.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = radio[i];
    radio[i] = radio[j];
    radio[j] = temp;
  }
  return radio;
}

module.exports = [{
  method: 'GET',
  path: '/radioArchive',
  handler: async (request, h) => {
    const page = (parseInt(request.query.page) || 1) - 1;
    const perPage = config.paginate.radio;

    const radioArchive = await request.mongo.db.collection('radio').find({}, {
      projection: {
        title: 1,
        artist: 1,
        author: 1,
        published: 1,
        blurb: 1,
        _id: 1
      }
    }).sort({
      published: -1,
      title: 1,
      _id: -1
    }).skip(page * perPage).limit(perPage).toArray();

    for (let i = 0; i < radioArchive.length; i++) {
      const author = await request.mongo.db.collection('authors').findOne({
        _id: radioArchive[i].author
      }, {
        projection: {
          name: 1,
          _id: 1
        }
      });
      radioArchive[i].author = author.name;
    }

    const pages = await request.mongo.db.collection('radio').count({});

    return h.view('radioArchive', {
      songData: radioArchive,
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
  path: '/radioArchive/new',
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

    return h.view('radioArchive-new', {
      authors: authors
    });
  }
}, {
  method: 'POST',
  path: '/radioArchive/new',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    let payload = request.payload;

    if (payload.song.hapi.filename == '') payload.song = undefined;
    if (payload.art.hapi.filename == '') payload.art = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      title: Joi.string().required(),
      blurb: Joi.string().required(),
      artist: Joi.string().required(),
      author: Joi.string().required(),
      published: Joi.date().required(),
      song: Joi.any().required(),
      art: Joi.any().required()
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

      return h.view('radioArchive-new', {
        error: error,
        radioArchive: payload,
        authors: authors
      });
    }

    const radioArchive = {
      title: payload.title,
      blurb: payload.blurb,
      artist: payload.artist,
      author: new request.mongo.ObjectID(payload.author),
      published: payload.published,
    };

    const status = await request.mongo.db.collection('radio').insertOne(radioArchive);
    if (status.acknowledged !== true) false;

    // File uploads
    const songBlobStream = uploadFileStream(`radioArchive/${status.insertedId}/song`);
    payload.song.pipe(songBlobStream);

    const artBlobStream = uploadFileStream(`radioArchive/${status.insertedId}/art`);
    payload.art.pipe(artBlobStream);

    return h.redirect('/radioArchive');
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
  path: '/radioArchive/{id}',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    const radio = await request.mongo.db.collection('radio').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        art: 1,
        song: 1,
        _id: 1
      }
    });
    if (!radio) return false;

    // delete associated images
    await deleteFile(`radioArchive/${id}/song`);
    await deleteFile(`radioArchive/${id}/art`);
    const status = await request.mongo.db.collection('radio').deleteOne({
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
  path: '/radio',
  handler: async (request, h) => {
    const queue = await getQueue(request);
    const startSong = queue.pop();
    return h.view('radio', {
      startSong: startSong,
      streamQueue: JSON.stringify(queue)
    });
  },
  options: {
    auth: false
  }
}, {
  method: 'GET',
  path: '/streamQueue',
  handler: async (request, h) => {
    const queue = await getQueue(request);
    return queue;
  },
  options: {
    auth: false
  }
}, {
  method: 'GET',
  path: '/radioArchive/{id}/edit',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    let radio = await request.mongo.db.collection('radio').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        title: 1,
        blurb: 1,
        author: 1,
        published: 1,
        artist: 1,
        _id: 1,
      }
    });
    if (!radio) return h.response('Radio entry not found').code(404);

    const authors = await request.mongo.db.collection('authors').find({}, {
      projection: {
        name: 1,
        _id: 1
      }
    }).sort({
      name: 1,
      id: -1
    }).toArray();

    return h.view('radioArchive-edit', {
      radioArchive: radio,
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
  path: '/radioArchive/{id}/edit',
  handler: async (request, h) => {
    //auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;

    const radio = await request.mongo.db.collection('radio').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        title: 1,
        blurb: 1,
        author: 1,
        published: 1,
        artist: 1,
        _id: 1
      }
    });

    if (!radio) return h.redirect('/radioArchive')

    let payload = request.payload;

    if (payload.art && payload.art.hapi.filename == '') payload.art = undefined;
    if (payload.audio && payload.audio.hapi.filename == '') payload.audio = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      title: Joi.string(),
      blurb: Joi.string(),
      artist: Joi.string(),
      author: Joi.string(),
      published: Joi.date(),
      song: Joi.any(),
      art: Joi.any()
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

      return h.view('radioArchive-edit', {
        error: error,
        radioArchive: payload,
        authors: authors
      });
    }

    const radioUpdate = {
      title: payload.title,
      blurb: payload.blurb,
      author: new request.mongo.ObjectID(payload.author),
      published: payload.published,
      artist: payload.artist
    };

    if (payload.art) {
      await deleteFile(`radioArchive/${id}/art`);
      const artBlobStream = uploadFileStream(`radioArchive/${id}/art`);
      payload.art.pipe(artBlobStream);
    }

    if (payload.audio) {
      await deleteFile(`radioArchive/${id}/audio`);
      const audioBlobStream = uploadFileStream(`radioArchive/${id}/audio`);
      payload.audio.pipe(audioBlobStream);
    }

    const status = await request.mongo.db.collection('radio').updateOne({
      _id: new request.mongo.ObjectID(id)
    }, {
      $set: radioUpdate
    });
    if (status.acknowledged === true) return h.redirect(`/radioArchive`);
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

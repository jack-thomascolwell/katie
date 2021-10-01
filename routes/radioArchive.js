const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');
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
art: ObjectID
}
*/

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
      _id: -1
    }).skip(page * perPage).limit(perPage).toArray();

    const pages = await request.mongo.db.collection('radio').count({});

    return h.view('radioArchive', {
      songData: radioArchive,
      admin: (request.auth.isAuthenticated && (request.auth.credentials.admin === true)),
      maxPage: Math.ceil(pages / perPage),
      page: page
    });
  },
  options: {
    auth: {
      mode: 'try'
    }
  }
}, {
  method: 'GET',
  path: '/radioArchive/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const radio = await request.mongo.db.collection('radio').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        _id: 1,
        title: 1,
        artist: 1,
        author: 1,
        published: 1,
        blurb: 1,
        art: 1,
        song: 1,
      }
    });
    if (!radio) return h.response('Radio entry not found').code(404);
    return h.response(radio);
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
  path: '/radioArchive/stream/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const radio = await request.mongo.db.collection('radio').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        _id: 1,
        song: 1
      }
    });
    if (!radio) return h.response('Radio entry not found').code(404);

    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    const radioFiles = await bucket.find({
      _id: radio.song
    }).project({
      _id: 1,
      filename: 1,
      metadata: 1,
    }).toArray();
    if (!radioFiles || !radioFiles[0]) return h.response('Song not found').code(404);
    const stream = bucket.openDownloadStream(radioFiles[0]._id);
    return h.response(stream).header('Content-Disposition', `attachment; filename= ${radioFiles[0].metadata.originalFilename}`).type(radioFiles[0].metadata.type);
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
  path: '/radioArchive/art/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const radio = await request.mongo.db.collection('radio').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        _id: 1,
        art: 1
      }
    });
    if (!radio) return h.response('Radio entry not found').code(404);

    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    const artFiles = await bucket.find({
      _id: radio.art
    }).project({
      _id: 1,
      filename: 1,
      metadata: 1,
    }).toArray();
    if (!artFiles || !artFiles[0]) return h.response('Art not found').code(404);
    const stream = bucket.openDownloadStream(artFiles[0]._id);
    return h.response(stream).header('Content-Disposition', `attachment; filename= ${artFiles[0].metadata.originalFilename}`).type(artFiles[0].metadata.type);
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
  path: '/radioArchive/new',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    return h.view('radioArchive-new');
  }
}, {
  method: 'POST',
  path: '/radioArchive/new',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    let payload = request.payload;

    //if (payload.song.hapi.filename == '') payload.song = undefined;
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

    if (error) return h.view('radioArchive-new', {
      error: error,
      radioArchive: payload
    });

    // File uploads
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);

    const songUploadStream = bucket.openUploadStream('song', {
      chunkSizeBytes: 1048576,
      metadata: {
        originalFilename: payload.song.hapi.filename,
        type: payload.song.hapi.headers['content-type']
      }
    });
    const songID = new request.mongo.ObjectID(payload.song.pipe(songUploadStream).id);
    payload.art.pipe((require('fs')).createWriteStream('./tmp/art'));

    const artUploadStream = bucket.openUploadStream('art', {
      chunkSizeBytes: 1048576,
      metadata: {
        originalFilename: payload.art.hapi.filename,
        type: payload.art.hapi.headers['content-type']
      }
    });
    let artID = new request.mongo.ObjectID(payload.art.pipe(artUploadStream).id);

    const radioArchive = {
      title: payload.title,
      blurb: payload.blurb,
      artist: payload.artist,
      author: payload.author,
      published: payload.published,
      song: songID,
      art: artID
    };

    const status = await request.mongo.db.collection('radio').insertOne(radioArchive);
    if (status.acknowledged === true) return h.redirect(`/radioArchive/${status.insertedId}`);
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
  path: '/radioArchive/{id}',
  handler: async (request, h) => {
    console.log('deleting')
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
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    bucket.delete(radio.song);
    bucket.delete(radio.art);
    const status = await request.mongo.db.collection('radio').deleteOne({
      _id: new request.mongo.ObjectID(id)
    });
    console.log(status);
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

const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');
/*
Zine Schema
{
_id: ObjectID
pdf: ObjectID,
issue: Integer,
published: Date
}
*/

module.exports = [{
  method: 'GET',
  path: '/zine',
  handler: async (request, h) => {
    const page = (parseInt(request.query.page) || 1) - 1;
    const perPage = config.paginate.articles;

    const zines = await request.mongo.db.collection('zine').find({}, {
      projection: {
        issue: 1,
        published: 1,
        _id: 1
      }
    }).sort({
      _id: -1
    }).skip(page * perPage).limit(perPage).toArray();

    const pages = await request.mongo.db.collection('zine').count({});

    return h.view('zines', {
      zines: zines,
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
  path: '/zine/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const zine = await request.mongo.db.collection('zine').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        issue: 1,
        published: 1,
        _id: 1,
      }
    });
    if (!zine) return h.redirect('/zine');
    return h.view('zine', {
      zine: zine,
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
  path: '/zine/pdf/{id}',
  handler: async (request, h) => {
    const id = request.params.id;
    const zine = await request.mongo.db.collection('zine').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        _id: 1,
        pdf: 1
      }
    });
    if (!zine) return h.response('Zine not found').code(404);

    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    const pdfFiles = await bucket.find({
      _id: zine.pdf
    }).project({
      _id: 1,
      filename: 1,
      metadata: 1,
    }).toArray();
    if (!pdfFiles || !pdfFiles[0]) return h.response('Pdf not found').code(404);
    const stream = bucket.openDownloadStream(pdfFiles[0]._id);
    return h.response(stream).header('Content-Disposition', `attachment; filename= ${pdfFiles[0].metadata.originalFilename}`).type(pdfFiles[0].metadata.type);
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
  path: '/zine/new',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    return h.view('zine-new');
  }
}, {
  method: 'POST',
  path: '/zine/new',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');

    let payload = request.payload;

    if (payload.pdf.hapi.filename == '') payload.pdf = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      issue: Joi.number().required(),
      published: Joi.date().required(),
      pdf: Joi.any().required(),
    });
    const {
      error,
      value
    } = schema.validate(payload);

    if (error) return h.view('zine-new', {
      error: error,
      zine: payload
    });

    // File uploads
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);

    const pdfUploadStream = bucket.openUploadStream('zine', {
      chunkSizeBytes: 1048576,
      metadata: {
        originalFilename: payload.pdf.hapi.filename,
        type: payload.pdf.hapi.headers['content-type']
      }
    });
    const pdfID = new request.mongo.ObjectID(payload.pdf.pipe(pdfUploadStream).id);

    const zine = {
      issue: payload.issue,
      published: payload.published,
      pdf: pdfID,
    };

    const status = await request.mongo.db.collection('zine').insertOne(zine);
    if (status.acknowledged === true) return h.redirect(`/zine/${status.insertedId}`);
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
  path: '/zine/{id}',
  handler: async (request, h) => {
    // auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    const zine = await request.mongo.db.collection('zine').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        pdf: 1,
        _id: 1
      }
    });
    if (!zine) return false;

    // delete associated images
    const bucket = new request.mongo.lib.GridFSBucket(request.mongo.db);
    bucket.delete(zine.pdf);
    const status = await request.mongo.db.collection('zine').deleteOne({
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

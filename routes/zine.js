const Joi = require('joi');
const Stream = require('stream');
const config = require('../config');

const {deleteFile, uploadFileStream } = require('../files');

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
    const perPage = config.paginate.zine;

    const zines = await request.mongo.db.collection('zine').find({}, {
      projection: {
        issue: 1,
        published: 1,
        _id: 1
      }
    }).sort({
      published: -1,
      _id: -1
    }).skip(page * perPage).limit(perPage).toArray();

    const pages = await request.mongo.db.collection('zine').count({});
    return h.view('zines', {
      zines: zines,
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

    const zine = {
      issue: payload.issue,
      published: payload.published,
    };

    const status = await request.mongo.db.collection('zine').insertOne(zine);
    if (status.acknowledged !== true) return false;

    // File uploads
    const blobStream = uploadFileStream(`zine/${status.insertedId}/pdf`);
    payload.pdf.pipe(blobStream);

    return h.redirect(`/zine/${status.insertedId}`);
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
        _id: 1
      }
    });
    if (!zine) return false;

    // delete pdf
    await deleteFile(`zine/${id}/pdf`);
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
}, {
  method: 'GET',
  path: '/zine/{id}/edit',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    let zine = await request.mongo.db.collection('zine').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        issue: 1,
        published: 1,
        _id: 1
      }
    });
    if (!zine) return h.response('Zine not found').code(404);

    return h.view('zine-edit', {
      zine: zine,
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
  path: '/zine/{id}/edit',
  handler: async (request, h) => {
    //auth
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;

    let zine = await request.mongo.db.collection('zine').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        issue: 1,
        published: 1,
        _id: 1
      }
    });

    if (!zine) return h.redirect('/zine')

    let payload = request.payload;
    if (payload.pdf && payload.pdf.hapi.filename == '') payload.pdf = undefined;

    const schema = Joi.object({
      _id: Joi.any().forbidden(),
      issue: Joi.string(),
      published: Joi.date(),
      pdf: Joi.any()
    });

    const {
      error,
      value
    } = schema.validate(payload);

    if (error) {
      return h.view('zine-edit', {
        error: error,
        zine: payload
      });
    }

    const zineUpdate = {
      issue: payload.issue,
      published: payload.published,
    };

    if (payload.pdf) {
      await deleteFile(`zine/${id}/pdf`);
      const blobStream = uploadFileStream(`zine/${id}/pdf`);
      payload.pdf.pipe(blobStream);
    }

    const status = await request.mongo.db.collection('zine').updateOne({
      _id: new request.mongo.ObjectID(id)
    }, {
      $set: zineUpdate
    });
    if (status.acknowledged === true) return h.redirect(`/zine/${id}`);
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

const Joi = require('joi');
const Bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = [{
    method: 'GET',
    path: '/users',
    handler: async (request, h) => {
      if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
        return h.redirect('/');
      const users = await request.mongo.db.collection('users').find({
        _id: {
          $not: {
            $in: [request.auth.credentials._id]
          }
        }
      }, {
        projection: {
          email: 1,
          admin: 1,
          _id: 1
        }
      }).sort({
        _id: -1
      }).toArray();
      return h.view('users', {
        users: users,
        self: request.auth.credentials
      });
    }
  },
  /*{
  method: 'GET',
  path: '/users/{id}',
  handler: async (request, h) => {
    if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
      return h.redirect('/');
    const id = request.params.id;
    const user = await request.mongo.db.collection('users').findOne({
      _id: new request.mongo.ObjectID(id),
    }, {
      projection: {
        email: 1,
        admin: 1,
        _id: 1
      }
    });
    return h.view('user', {
      user: user
    });
  },
  options: {
    validate: {
      params: Joi.object({
        id: Joi.string().required()
      })
    }
  }
}, */
  {
    method: 'PUT',
    path: '/users/{id}',
    handler: async (request, h) => {
      if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
        return h.redirect('/');
      const userId = request.auth.credentials._id;
      const id = request.params.id;
      if (userId == id) return h.response('Cannot edit own user').code(401);
      const status = await request.mongo.db.collection('users').updateOne({
        _id: new request.mongo.ObjectID(id)
      }, {
        $set: request.payload
      });
      return status;
    },
    options: {
      validate: {
        params: Joi.object({
          id: Joi.string().required()
        }),
        payload: Joi.object({
          _id: Joi.any().forbidden(),
          email: Joi.any().forbidden(),
          password: Joi.any().forbidden(),
          admin: Joi.boolean()
        })
      }
    }
  }, {
    method: 'GET',
    path: '/register',
    handler: async (request, h) => {
      if (request.auth.isAuthenticated)
        return h.redirect('/');
      return h.view('register');
    },
    options: {
      auth: {
        mode: 'try'
      }
    }
  }, {
    method: 'POST',
    path: '/register',
    handler: async (request, h) => {

      if (request.auth.isAuthenticated)
        return h.redirect('/');

      let payload = request.payload;

      if (payload.email) payload.email = payload.email.toLowerCase();

      const schema = Joi.object({
        _id: Joi.any().forbidden(),
        email: Joi.string().email(),
        password: Joi.string(),
        repeat_password: Joi.ref('password'),
        admin: Joi.any().forbidden()
      });
      const {
        error,
        value
      } = schema.validate(payload);

      if (error) return h.view('register', {
        error: error,
        user: payload
      });

      const existingUsers = await request.mongo.db.collection('users').find({
        email: payload.email,
      }).toArray();

      if (existingUsers.length > 0) return h.view('register', {
        error: 'User with email already exists',
        user: payload
      });

      const newUser = {
        email: payload.email,
        password: await Bcrypt.hash(payload.password, saltRounds),
        admin: false
      }

      const status = await request.mongo.db.collection('users').insertOne(newUser);
      console.log(status);
      if (status.acknowledged) return h.redirect('/');
      return status;
    },
    options: {
      auth: {
        mode: 'try'
      }
    }
  }, {
    method: 'DELETE',
    path: '/users/{id}',
    handler: async (request, h) => {
      if (!request.auth.isAuthenticated || (request.auth.credentials.admin !== true))
        return h.redirect('/');
      const status = await request.mongo.db.collection('users').deleteOne({
        _id: new request.mongo.ObjectID(request.params.id)
      });
      return status;
    },
    options: {
      validate: {
        params: Joi.object({
          id: Joi.string().required()
        })
      }
    }
  }
];

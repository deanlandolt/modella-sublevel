var Secondary = require('level-secondary')
var dezalgo = require('dezalgo')
var through = require('through2')

module.exports = function(Model) {
  //
  // model methods
  //
  Model.attach = attach

  Model.create = function (attrs) {
    return new Model(attrs)
  }

  // TODO: modella's mixing of static and instance methods is a trainwreck!
  Model.save = Model.update = function (model, cb) {
    // instance variant
    if (typeof model === 'function') {
      cb = model
      model = this
    }

    var record = model.toJSON()
    Model.store.put(model.primary(), record, function (err, values) {
      cb(err, err ? null : record)
    })
  }

  Model.remove = function (model, cb) {
    // instance variant
    if (typeof model === 'function') {
      cb = model
      model = this
    }

    var key = typeof model === 'string' ? model : model.primary()

    Model.store.del(key, cb)
  }

  Model.find = function (id, cb) {
    var Model = this

    Model.store.get(id, function(err, result) {
      if (err && err.notFound) {
        cb(new Error('Unable to find ' + Model.modelName + ' with id: ' + id))
      }
      else {
        cb(err, err ? null : Model.create(result))
      }
    })
  }

  function byField(method, field, value, cb) {
    if (field === Model.primaryKey) {
      // TODO: short-circuit primary key
    }

    var getBy = ('by' + field).toLowerCase()
    if (!Model.store[getBy]) {
      return cb(new Error('Attribute index does not exist'))
    }

    Model.store[getBy][method](value, function(err, value_) {
      cb(err, err ? null : Model.create(value_))
    })
  }

  Model.findBy = function (field, value, cb) {
    return byField('get', field, value, cb)
  }

  Model.removeBy = function (field, value, cb) {
    return byField('del', field, value, cb)
  }

  // add secondary indexes
  // TODO: bytespace needs more love for hooks to work over multilevel
  var indexedAttrs = []

  for (var attr in Model.attrs) {
    if (Model.attrs[attr].index) {
      // Model.store[('by' + attr).toLowerCase()] = Secondary(Model.store, attr)
    }
  }

  return Model
}

function attach(store) {
  var Model = this

  if (!store || typeof store.sublevel !== 'function') {
    throw new Error('Requires a sublevel-compatible backing store')
  }

  if (!Model.primaryKey) {
    return cb(new Error('No primary key set on model'))
  }

  // keep a reference to store
  Model.store = store

  // TODO: kill the `methods` hackary?
  store.methods || (store.methods = {})

  //
  // client invokes RPC methods exposed by host
  //
  var base = {}
  if (!store.isClient) {
    store.get && (store.methods.get = { type: 'async' })

    if (!Model.readonly) {
      store.del && (store.methods.del = { type: 'async' })
      store.put && (store.methods.put = { type: 'async' })
      store.batch && (store.methods.batch = { type: 'async' })
    }

    //
    // route client writes through host
    //
    base.del = store.del
    store.del = function (k, opts, cb) {
      // TODO: option for verifying existence before delete
      base.del.call(store, k, opts, cb)
    }

    base.put = store.put
    store.put = function (k, v, opts, cb) {
      if (typeof opts === 'function') {
        cb = opts
        opts = {}
      }
      cb = dezalgo(cb)
      opts || (opts = {})
      opts.valueEncoding = 'json'

      //
      // instantiate model check validity
      //
      var model = v
      if (!(v instanceof Model)) {
        // copy k to primary key field and create model instance
        v[Model.primaryKey] = k
        model = Model.create(v)
      }

      //
      // ensure primary key and check validity
      //
      if (k) {
        if (model.primary() !== k) {
          cb(new TypeError('Primary key mismatch'))
        }
      }
      else if (store.generateKey) {
        model.primary(store.generateKey())
      }
      else {
        cb(new TypeError('Primary key required'))
      }

      // validate
      if (!model.isValid()) {
        cb(new TypeError('Invalid model'))
      }

      // call base put with model record JSON
      var record = model.toJSON()
      base.put.call(store, k, record, opts, function (err) {
        cb(err, err ? null : record)
      })
    }

    // var _batch = store.batch
    // store.batch = ...
  }

  //
  // set `query` and `tail` methods if stream constructors are available
  //
  if (store.createReadStream) {
    store.methods.createReadStream = { type: 'readable' }
    Model.query = function (opts) {
      opts || (opts = {})
      opts.keys = false
      opts.values = true
      return store.createReadStream(opts).pipe(modeledStream(Model, opts))
    }
  }

  if (store.createLiveStream) {
    store.methods.createLiveStream = { type: 'readable' }
    Model.tail = function (opts) {
      return store.createLiveStream(opts).pipe(modeledStream(Model))
    }
  }

  // detach model from store
  Model.detach = function () {

    // replace original methods on store
    for (var key in base) {
      store[key] = base[key]
    }

    // remove store reference
    Model.store = store = base = null

    // noop detach
    Model.detach = function () {}

    return Model
  }

  return Model
}

//
// returns a transform stream to lift value of each stream result into a model
//
function modeledStream(Model, opts) {
  var keys = opts.keys !== false
  var values = opts.values !== false
  var keysOnly = keys && !values
  var valuesOnly = !keys && values

  return through.obj(function (data, enc, cb) {
    if (keysOnly) {
      return cb(null, data)
    }

    try {
      var value = valuesOnly ? data : data.value
      value && (value = new Model(value))
      if (valuesOnly) {
        data = value
      }
      else {
        data.value = value
      }
      cb(null, data)
    }
    catch (err) {
      cb(err)
    }
  })
}

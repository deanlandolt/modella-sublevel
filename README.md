# modella-sublevel

Modella plugin to attach a model to a `sublevel`-based backing store, with optional secondary indexing.

## Usage

```js
var sublevel = require('modella-sublevel')

var MyModel = model('MyModel')
  .use(sublevel)

  // primary key field required (defaults to `id` or `_id` attr per modella API
  .attr('mykey', {
    primaryKey: true
  })

  // unindexed attribute
  .attr('somefield', {
    defaultValue: 'xxx'
  })

  // explicitly indexed field
  .attr('indexedfield', {
    index: true
  })

  // unique fields are implicitly implicitly indexed to verify uniqueness
  .attr('uniquefield', {
    unique: true
  })

// model initialized, but saving instances will throw until store is attached
var model = new Model({
  mykey: 'a',

  // unique fields are inherently `required: true`
  uniquefield: 'foo'
})

model.save(function(err, model) {
  err.message === 'No store available'
})
```


### Attaching a store

```js
// some time later, assuming `db` is in scope...
var store = db.sublevel('MyModel')

// attach new sublevel as backing store for our model
MyModel.attach(store)

// now we can save model instances
model.save(function (err, model_) {
  // no error this time
  err == null

  // callback is invoked with the same instance of model
  model_ === model
})
```


### Model-aware store methods

```js
// the backing store is made available on the `store` key
MyModel.store === store

// store methods are overriden to do model creation/validation
myStore.put('b', {
  // id will be set to `primaryKey` field defined by model
  uniquefield: 'bar'
}, function (err, record) {
  // `store.put` overridden to return created JSON record
  record.key === 'a'

  // this will include any attributes generated by model instantiation
  record.somefield === 'xxx'
})
```


### Store-aware model methods

```js
// modella API extended with some static convenience methods
MyModel.create({
  mykey: 'c',
  uniquefield: 'baz'
}).save(err, model) {
  // again, result of save is a model instance, which we can manipulate
  model.somefield('yyy')

  model.save(function (err) {
    // our changes are now persisted
  })
})

// convenient static methods are available for interfacing with the store
MyModel.add({
  // ensures key is new
  mykey: 'd',
  uniquefield: 'quux'
})

// query by primary key (if `createReadStream` available on sublevel)
Model.query({ gt: 'b' }).on('data', function (model) {
  // invoked with model instances
  model.primary() >= 'b'
})

// query on a secondary index explicitly (if supported by sublevel)
Model.query.uniquefield({ gt: 'bar' }).on('data', function (model) {
  model.uniquefield() > 'bar'
})

// observe changes on an indexed attribute (if `createLiveStream` avaialable)
Model.tail.indexedfield().on('data', function (data) {
  if (data.type !== 'del') {
    // data.model.get('indexedfield')
  }
})
```


### Detaching a store

The `attach` method can be called without a store reference to detach store from model:

```js
OtherModel.attach()
OtherModel.store === undefined
```

When detaching, any methods overwritten on the backing store instance will be replaced with their original versions.

import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert } from './util'

let Vue // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    if (process.env.NODE_ENV !== 'production') {
      // 在这里通过断言来判断和保证Vue的存在，也就是在实例化store之前，保证之前的install安装方法已经执行了，并成功
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      /*
        Vuex的源码是依赖于ES6的，所以他必须保证Promise的支持（浏览器可能不支持ES6）

        一个框架的健壮性源于我们对业务的规划/考虑
      */
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `Store must be called with the new operator.`)
    }

    const {
      plugins = [],
      strict = false
    } = options
    // 接收到Options里面的对象
    // store internal state
    // 通过Vue来使用的，this一般都表示Vue对象本身
    this._committing = false // 标志一个提交状态，作用是保证对Vuex里面的state修改，只能在mutation中回调
    this._actions = Object.create(null) // 存储用户定义的方法actions
    this._actionSubscribers = []
    this._mutations = Object.create(null) // 用来存储用户定义的mutaions
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options) // 存储用户运行的modules
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = [] // 存储所有对mutaion变化的订阅者（开发者）
    this._watcherVM = new Vue()

    // bind commit and dispatch to self
    const store = this
    const { dispatch, commit } = this
    // 让dispatch和commit指向store实例，也就是this当前对象
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict // 是否使用严格模式
    // 因为检测变化会耗费一定性能，关闭严格模式进而一定程度上保证性能
    // 注意在这里，严格模式下，会观察所有state的变化，建议在开发环境开启严格模式，而线上一定记得关闭
    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    installModule(this, state, [], this._modules.root) // Vuex的一个核心

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    resetStoreVM(this, state)

    // apply plugins
    plugins.forEach(plugin => plugin(this))

    if (Vue.config.devtools) {
      devtoolPlugin(this)
    }
  }

  get state () {
    return this._vm._data.$$state
  }

  set state (v) {
    if (process.env.NODE_ENV !== 'production') {
      assert(false, `Use store.replaceState() to explicit replace store state.`)
    }
  }
  // 是action和mutaion的桥梁
  // type：mutation的类型、payload：额外的参数、options：一些配置
  commit (_type, _payload, _options) { // commit也就为mutaion成为唯一的操作state对象的保证
    // check object-style commit
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }
    const entry = this._mutations[type] // state可能不存在
    if (!entry) { // 找不到则输出错误
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown mutation type: ${type}`) //报错，并提示是那个对象
      }
      return // 结束
    }
    this._withCommit(() => { // 遍历 type 对应的 mutation 对象数组
      entry.forEach(function commitIterator (handler) {
        handler(payload) // 执行注册回调函数，当前模块的 state和参数作为形参传入
      })
    })
    // 订阅（注册监听） store 的 mutation
    this._subscribers.forEach(sub => sub(mutation, this.state))

    if (
      process.env.NODE_ENV !== 'production' &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }

  dispatch (_type, _payload) { // type：action类型，payload：额外的参数
    // check object-style dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }
    const entry = this._actions[type]
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    this._actionSubscribers.forEach(sub => sub(action, this.state))

    return entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)
  }

  subscribe (fn) {
    return genericSubscribe(fn, this._subscribers)
  }

  subscribeAction (fn) {
    return genericSubscribe(fn, this._actionSubscribers)
  }

  watch (getter, cb, options) {
    if (process.env.NODE_ENV !== 'production') {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    this._modules.register(path, rawModule)
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters...
    resetStoreVM(this, this.state)
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    this._modules.unregister(path)
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    resetStore(this)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

  _withCommit (fn) { // 修改state时，通过改方法包装，保证数据同步
    const committing = this._committing
    this._committing = true // 保持状态为true，这样当我们观测 state 的变化时，如果值不为 true，则判断状态修改是有问题的
    fn()
    this._committing = committing
  }
}

function genericSubscribe (fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}

function resetStoreVM (store, state, hot) {
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    computed[key] = () => fn(store)
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  Vue.config.silent = true
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  if (store.strict) {
    enableStrictMode(store)
  }

  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}
// 传入的store就是构造器本身的属性了
/*
  store：Store实例，
  rootState：表示根state
  path：当前嵌套模块的路径（数组）
  module：安装的模块
  hot：当动态改变modules或者热更新的时候为true
*/
function installModule (store, rootState, path, module, hot) {
   // 递归安装模块时，这里的isRoot是true的
  const isRoot = !path.length // 获取长度，是否为根元素
  const namespace = store._modules.getNamespace(path) // 获取module的namespace

  // register in namespace map 如果有namespace则在_modulesNamespaceMap中注册
  if (module.namespaced) {
    store._modulesNamespaceMap[namespace] = module
  }

  // set state 判断当不为根且非热更新
  if (!isRoot && !hot) {
    // 传入rootState和path，计算出当前模块的父模块的 state，由于模块中的 path 是根据模块的名称通过concat 连接的，所以 path 的最后一个元素就是当前模块的模块名
    const parentState = getNestedState(rootState, path.slice(0, -1)) // 拿到module父级的state,
    const moduleName = path[path.length - 1]  // 拿到当前所在的moduleName
    store._withCommit(() => { // 调用store._withCommit()
      Vue.set(parentState, moduleName, module.state) // 当前模块的state添加到parentState
    })
  }

  const local = module.context = makeLocalContext(store, namespace, path)
 // 遍历注册mutation，commit同样也会执行保证“commit”
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  // 遍历注册 action
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })
  // 遍历注册getter
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })
  // 递归安装mudule
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
    /* 通过遍历 modules，
      递归调用 installModule 去安装子模块。
      这里传入了 store、rootState、path.concat(key)、和 modules[key]，
      注意这里path 不为空，module 对应为子模块
    */
  })

  // 如果我们实例化 Store 的时候通过 options 传入这些对象，那么会分别进行注册
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext (store, namespace, path) {
  const noNamespace = namespace === ''

  const local = {
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }

      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

function makeLocalGetters (store, namespace) {
  const gettersProxy = {}

  const splitPos = namespace.length
  Object.keys(store.getters).forEach(type => {
    // skip if the target getter is not match this namespace
    if (type.slice(0, splitPos) !== namespace) return

    // extract local getter type
    const localType = type.slice(splitPos)

    // Add a port to the getters proxy.
    // Define as getter property because
    // we do not want to evaluate the getters in this time.
    Object.defineProperty(gettersProxy, localType, {
      get: () => store.getters[type],
      enumerable: true
    })
  })

  return gettersProxy
}
// store 的 mutation 的初始化
/*
  store：当前Store实例
  type：mutation的key
  handler：mutation 执行的回调函数
  path：为当前模块的路径
  同步修改模块中的state（）

*/
function registerMutation (store, type, handler, local) {
  //
  const entry = store._mutations[type] || (store._mutations[type] = [])  // 通过type拿到对应的mutaion数组
  entry.push(function wrappedMutationHandler (payload) { // state对象，state之外额外的参数，payload其他的参数
    handler.call(store, local.state, payload) // 调用mutaion的回调函数
  })
}

// 对 store的action的初始化
// action修改state依然会提交一个mutaion，通过mutaion修改state
function registerAction (store, type, handler, local) {
  // 通过传入的type拿到action对象数组
  const entry = store._actions[type] || (store._actions[type] = [])
  entry.push(function wrappedActionHandler (payload, cb) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload, cb)
    // 对函数返回值判断
    if (!isPromise(res)) { // 注意此方法只是单纯的判断是否有一个子属性方法叫"then"
      res = Promise.resolve(res) // 如果不是Promise对象，强行改为Promise
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}
// 是对store的getters初始化
function registerGetter (store, type, rawGetter, local) {
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  // getter有一个定义：不允许重复
  store._wrappedGetters[type] = function wrappedGetter (store) {
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (process.env.NODE_ENV !== 'production') {
      assert(store._committing, `Do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

function getNestedState (state, path) {
  return path.length
    ? path.reduce((state, key) => state[key], state)
    : state
}

function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) { // 判断type类型
    options = payload
    payload = type
    type = type.type
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof type === 'string', `Expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options } // 返回
}
// 插件中的install安装，是初始化的意思
export function install (_Vue) {//在Vue.use(vuex)的时候调用install
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    // 表示已经安装过了
    return
  }
  Vue = _Vue // 表示已经安装过了
  applyMixin(Vue)
}

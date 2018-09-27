export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) { // 判断版本大于2
    // 在vue的beforeCreate的时候，调用并初始化Vuex
    Vue.mixin({ beforeCreate: vuexInit }) // 注入一个$store的属性
  } else { // 下面是小于2的判断
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */

  function vuexInit () {
    const options = this.$options
    // store injection
    /*
      Vuex：state   通过store拿到的
      给vue的实例
      为什么store对象能够在组件中，通过this.$store.xxx访问到vuex的各种状态和数据
    */
    if (options.store) {
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}

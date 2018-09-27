import { Store, install } from './store' // 实际上咱们引入的时候引入了两个对象
// store是vuex的核心入口
// install方法会在
import { mapState, mapMutations, mapGetters, mapActions, createNamespacedHelpers } from './helpers'

export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
}

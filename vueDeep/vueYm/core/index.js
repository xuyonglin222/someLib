//Vue的核心方法
import Vue from './instance/index'
//初始化全局API
import { initGlobalAPI } from './global-api/index'
//获取布尔值变量判断是不是SSR
import { isServerRendering } from 'core/util/env'
// 这里开始执行初始化全局变量
initGlobalAPI(Vue)
// 为Vue原型定义属性$isServer
Object.defineProperty(Vue.prototype, '$isServer', {
    get: isServerRendering
})
// 为Vue原型定义属性$ssrContext
Object.defineProperty(Vue.prototype, '$ssrContext', {
    get () {
        /* istanbul ignore next */
        return this.$vnode && this.$vnode.ssrContext
    }
})

Vue.version = '__VERSION__'

export default Vue

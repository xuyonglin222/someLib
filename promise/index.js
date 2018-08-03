/**
 * author:xuyonglin
 * justplay
 */
var PENDING = 0;
var FULFILLED = 1;
var REJECTED = 2;

function Promise(fn) {
    //状态
    var state = PENDING;
    //传递的值
    var value = null;
    //包含onFulfilled和onRejected的函数的对象的容器
    var handlers = [];

    function fulfill(result) {
        state = FULFILLED;
        value = result;
    }

    function reject(err) {
        state = REJECTED;
        value = error;
    }

    function resolve(result) {
        try {
            //如果是result是promise返回then函数，否则返回null
            var then = getThen(result);
            if (then) {
                doResolve(then.bind(result), resolve, reject)
                return;
            }
            fulfill(result);
        } catch (e) {
            reject(e);
        }
    }

    /**
     * Check if a value is a Promise and, if it is,
     * return the `then` method of that promise.
     *
     * @param {Promise|Any} value
     * @return {Function|Null}
     */
    function getThen(value) {
        var t = typeof value;
        if (t && (t === 'object' || t === 'function')) {
            var then = value.then;
            if (typeof then === 'function') {
                return then;
            }
        }
        return null;
    }


    function doResolve(fn, onFulfilled, onRejected) {
        var done = false;
        try {
            fn(function (value) {
                if (done) return;
                done = true;
                onFulfilled(value);
            }, function (reason) {
                if (done) return
                done = true;
                onRejected(reason);
            })
        } catch (ex) {
            if (done) return
            done = true;
            onRejected(ex);
        }
    }

    function handle(handler) {
        if (state === PENDING) {
            handlers.push(handler);
        } else {
            if (state === FULFILLED &&
                typeof handler.onFulfilled === 'function') {
                handler.onFulfilled(value);
            }
            if (state === REJECTED &&
                typeof handler.onRejected === 'function') {
                handler.onRejected(value);
            }
        }
    }

    this.done = function(onFulfilled, onRejected){
        //确保是异步执行
        setTimeout(function(){
            handle({
                onFulfilled: onFulfilled,
                onRejected:onRejected
            })
        },0)
    }

    this.then = function(onFulfilled, onRejected){
        var self = this;
        return new Promise(function(resolve,reject){
            return self.done(function (result){
                if(typeof onFulfilled === 'function'){
                    try {
                        return resolve(onFulfilled(result));
                    }catch(ex){
                        return resolve(ex);
                    }
                }else{
                    return resolve(result);
                }
            },function(error){
                if (typeof onRejected === 'function') {
                    try {
                      return resolve(onRejected(error));
                    } catch (ex) {
                      return reject(ex);
                    }
                  } else {
                    return reject(error);
                  }
            })
        })
    }

    doResolve(fn,resolve,reject);
}

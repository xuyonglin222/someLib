var PENDING = 0;
var FULFILLED = 1;
var REJECTED = 2;

function myPromise(fn) {
    var state = PENDING;
    var value = null;
    var handlers = [];
    var e =null;

    function resolve(val) {
        if (val instanceof myPromise) {
            try{
                val.then(resolve);
            }catch(e){
                reject(e)
            }
            return;
        }
        state = FULFILLED;
        value = val;
        setTimeout(function () {
            handlers.map(function (handler) {
                handle(handler)
            })
        }, 0)
    }

    function reject(err) {
        state = REJECTED;
        e = err
    }

    function handle(handler) {
        if (state === PENDING) {
            handlers.push(handler);
            return;
        }
        // if(typeof handler.onFulfilled==='function'){
        //     handler.onFulfilled(value);
        //     return;
        // }
        try{
            if (state === FULFILLED && typeof handler.onFulfilled === 'function') {
                let ret = handler.onFulfilled(value);
                handler.resolve(ret);
            }
        }catch(e){
            reject(e)
        }
    }

    this.then = function (onFulfilled, onRejected) {
        return new myPromise(function (resolve, reject) {
            handle({
                onFulfilled,
                resolve,
            })
        })
    }

    fn(resolve, reject);
}
myPromise.all = function (arr) {
    return new myPromise(function(resolve){
        let res =[];
        function iterator(i){
            if(i<3){
                arr[i]().then(function(val){
                    res.push(val);
                    iterator(i+1);
                })
            }else{
                resolve(res)
            }
        }
        iterator(0)   
    }) 
}
new myPromise(function (resolve, reject) {
    setTimeout(function () {
        resolve('ss')
    }, 0)
}).then(function (val) {
    console.log(val);
    return new myPromise(function (resolve, reject) {
        setTimeout(function () {
            resolve(val + 'xyl')
        }, 0)
    })
}).then(function (val) {
    console.log(val);
    return new myPromise(function (resolve, reject) {
        setTimeout(function () {
            resolve(val + 'xyl222')
        }, 0)
    })
}).then(function (val) {
    console.log(val);
})

let p1 = function () {
    return new myPromise(function (resolve) {
        setTimeout(function () {
            resolve('3000')
        }, 3000);
    });
}



let p2 = function () {
    return new myPromise(function (resolve) {
        setTimeout(function () {
            resolve('2000')
        }, 2000);
    });
}
let p3 = function () {
    return new myPromise(function (resolve) {
         setTimeout(function () {
            resolve('1000')
        }, 1000);
    });
}
myPromise.all([p1, p2, p3]).then(function (res) {
    console.log(res)
})
var fn1 = function(){
  return async function(next){
    console.log('go1');
    await next();
    console.log('back1');
  }
}
var fn2 = function(){
  return async function(next){
    console.log('go2');
    await next();
    console.log('back2');
  }
}
var fn3 = function(){
  return async function(next){
    console.log('go3');
    await next();
    console.log('back3');
  }
}

function compose(middleware){
  var index = -1;
  return function(){
    return dispatch(0)
    function dispatch(i){
      if(i>=middleware.length) return Promise.resolve();
      if(i<=index) throw new error('next 不能调用多次');
      index = i;
      var fn = middleware[i];
      return Promise.resolve(fn(function(){
        dispatch(++i);
      }))
    }
  }
}
compose([fn1(),fn2(),fn3()])()

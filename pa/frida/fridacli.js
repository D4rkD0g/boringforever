function main() {
  Java.perform(function() {
    var MainActivity = Java.use("com.lambdax.fridacli.MainActivity")
    MainActivity.calc.overload('int', 'int').implementation = function(x, y) {
        console.log("x => ", x, "y => ", y)
        var calc_ret = this.calc(1024, -1337)
        return calc_ret
    }
    MainActivity.calc.overload('java.lang.String').implementation = function(s) {
      console.log("s => ", s)
      var calc_ret = s.toUpperCase()
      return calc_ret
    }
    MainActivity.thisisastaticsecret()

    Java.choose("com.lambdax.fridacli.MainActivity", {
      onMatch: function(instance) {
        console.log("Lambdax.frida: instance found", instance)
        instance.thisisanothersecret()
      },
      onComplete: function() {
        console.log("Lambdax.frida: search complete")
      }
    })
  })
}

setImmediate(main)
## 0x00 背景  

当年。。。宇宙洪荒，日月无光。。。  
测试安卓程序，或者说DSP，可以看作前后端，前端APK，调用SO，再到后边的DSP  
没有直接写C的harness来测，因为当时需求不明。但是后来发现国外研究人员这么做，并且收割了一波，Sad。。。  
当时用frida主要是为了分析函数调用流程，后来才试了试修改数据进行测试  
关于frida的fuzz，有[frida-fuzzer](https://github.com/andreafioraldi/frida-fuzzer)、[fpicker](https://github.com/ttdennis/fpicker)等，近期还有[fuzzing firefox with frida](https://academy.fuzzinglabs.com/courses/introduction-browser-fuzzing/457402-fuzzing-firefox-asan-build-using-in-process-fuzzing-with-frida/3085392-video-complete-step-by-step-tutorial)。不过我都没看过   

## 0x01 基本命令

两种方式：  
1. CLI模式。命令行将JS注入进程  
2. RPC模式。使用Python注入JS  

操纵APP两种模式：  
1. Spawn。`frida -f`  
2. Attach。通过ptrace注入

电脑上执行，可以看到手机上运行的程序(当然，手机上先要运行frida-server)，新版frida有了图标显示

```bash
➜  ~ frida-ps -U
  PID  Name

10632   Calendar
10978   Camera
11125   Magisk
10413   Messages
11568   Personal Safety
10207   Photos
 7672   Settings
11202   YouTube
```

之前主要用的frida-trace，用来trace函数，`-i`指定trace的函数名称，`-I`指定trace的库，`-U`指定trace的包

```bash
frida-trace -i open -I librpc.so -U com.qti.image
```

这个过程会自动生成JS模板，其中有onEnter、onLeave来写具体的操作，比如[获取数据](https://github.com/D4rkD0g/boringforever/blob/main/pa/frida/trace_getdata.js)、[修改数据](https://github.com/D4rkD0g/boringforever/blob/main/pa/frida/trace_mutator.js)

## 0x03 Frida Cli

注入举个例子

```javascript
function main() {
	Java.perform(function() {
		console.log("Hello")
	})
}
setTimeout(main, 5000)
```

setTimeout用于延时注入，也就是说注入App 5秒后才打印。可用setImmediate即时执行  
frida的APIJava.perform将脚本注入到Java运行库，任何对App中Java层的操作都要在这个函数中

```bash
➜  ~ frida -U -l Desktop/hello.js com.google.android.settings.intelligence
     ____
    / _  |   Frida 15.1.8 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
Attaching...
Hello
[Pixel 2::com.google.android.settings.intelligence]->
```

`-U`:指USB设备  
`-l`:js的路径

为什么这里没用-f呢

下边来个高级点的栗子  

```java
package com.lambdax.fridacli;

import androidx.appcompat.app.AppCompatActivity;

import android.os.Bundle;
import android.util.Log;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        while (true) {
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
            calc(1024, 1337);
            Log.d("Lambdax.fridacli", calc("0XDeadBeAf"));
        }
    }

    void calc(int x, int y) {
        Log.d("LambdaX.fridacli", String.valueOf(x+y));
    }

    String calc(String s) {
        return s.toLowerCase();
    }

    void thisisasecret() {
        Log.d("Lambdax.frida", "xixixi");
    }
    void thisisanothersecret() {
        Log.d("Lambdax.frida", "xixixi!another!");
    }
    static void thisisastaticsecret() {
        Log.d("Lambdax.frida", "xixixi!static!");
    }
}
```

目的有：  
1. 替换calc的整数参数  
2. 替换calc操作字符串时，改为大写  
3. 调用类函数thisisastaticsecret    
4. 调用实例方法thisisanothersecret  

```javascript
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
```

效果如下  

```BASH
2021-10-27 12:40:03.017 22186-22186/com.lambdax.fridacli D/LambdaX.fridacli: 2361
2021-10-27 12:40:03.017 22186-22186/com.lambdax.fridacli D/Lambdax.fridacli: 0xdeadbeaf
2021-10-27 12:40:04.020 22186-22186/com.lambdax.fridacli D/LambdaX.fridacli: 2361
2021-10-27 12:40:04.021 22186-22186/com.lambdax.fridacli D/Lambdax.fridacli: 0xdeadbeaf
2021-10-27 12:40:05.535 22186-22261/com.lambdax.fridacli D/Lambdax.frida: xixixi!static!
2021-10-27 12:40:05.556 22186-22261/com.lambdax.fridacli D/Lambdax.frida: xixixi!another!
2021-10-27 12:40:06.033 22186-22186/com.lambdax.fridacli D/LambdaX.fridacli: -313
2021-10-27 12:40:06.034 22186-22186/com.lambdax.fridacli D/Lambdax.fridacli: 0XDEADBEAF
```

因为calc函数有重载，所以需要`MainActivity.calc.overload('参数签名')`来指定特定的函数。`this.calc`来执行原始的函数  
类函数`thisisastaticsecret`可以直接被调用，但是实例函数需要使用`Java.choose()`在Java的堆上找指定类的实例，然后通过实例调用实例方法  

## 0x04 Frida RPC

还是没懂RPC的优势。类似刚才的例子  

```java
package com.lambdax.fridacli;

import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;

public class MainActivity extends AppCompatActivity {
    private String prefix = "hello";
    static  String sprefix = "world";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }

    void thisisasecret() {
        prefix += " LambdaX";
        Log.d("Lambdax.frida", "xixixi");
    }
    void thisisanothersecret() {
        Log.d("Lambdax.frida", "xixixi!another!");
    }
    static void thisisastaticsecret() {
        Log.d("Lambdax.frida", "xixixi!static!");
    }
}
```

python的架子

```python
import frida, sys

def on_message(msg, data):
    if msg["type"] == "send":
        print("Send: {}".format(msg["payload"]))
    else:
        print(msg)

device = frida.get_usb_device() 
process = device.attach("fridacli")  #attach进程

jscode = '''
    ...
'''

script = process.create_script(jscode)
script.on("message", on_message)
script.load() # 装载JS代码

script.exports.callsec() #调用js中exports的函数
script.exports.getdata()
script.exports.callsec()
```

js代码如下

```js
function getdata() {
    Java.perform(function() {
        var MainActivity = Java.use("com.lambdax.fridacli.MainActivity")
        MainActivity.thisisastaticsecret()
        //MainActivity可以获取sprefix.value，但不能prefix.value

        Java.choose("com.lambdax.fridacli.MainActivity", {
        onMatch: function(instance) {
            console.log("Lambdax.frida: instance found", instance)
            console.log("string => ", instance.prefix.value)
        },
        onComplete: function() {
            console.log("Lambdax.frida: search complete")
        }
        })
    })
}
function callsec() {
    Java.perform(function() {
        var MainActivity = Java.use("com.lambdax.fridacli.MainActivity")

        Java.choose("com.lambdax.fridacli.MainActivity", {
        onMatch: function(instance) {
            console.log("Lambdax.frida: instance found", instance)
            instance.thisisasecret()
        },
        onComplete: function() {
            console.log("Lambdax.frida: search complete")
        }
        })
    })
}
rpc.exports = {
    getdata: getdata,
    callsec: callsec
};
```

emmmm，到目前未知，都是基本的内容，似乎并没有一个实用的样子

0x03和0x04两部分主要参考肉丝姐r0ysue的书，你要问我需不需要买，书的排版有很多问题，内容更多像讲义。。。后边部分还没看。。。
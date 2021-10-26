
两种方式：  
1. CLI模式。命令行将JS注入进程  
2. RPC模式。使用Python注入JS

操纵APP两种模式：  
1. Spawn。`frida -f`  
2. Attach。通过ptrace注入


电脑上执行，可以看到手机上运行的程序(当然，手机上先要运行frida-server)，新版frida有了图标显示
➜  ~ frida-ps -U
  PID  Name
-----  -----------------------------------------------------------------------------------------------------
10632   Calendar
10978   Camera
11402   Chrome
10907   Contacts
10899   Files by Google
10696   Gmail
 6589   Google
 9796   Google Play Store
11125   Magisk
10413   Messages
11568   Personal Safety
10207   Photos
 7672   Settings
11202   YouTube


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



-U:指USB设备
-l:js的路径

为什么这里没用-f呢





# 2021.08.26

[说说JAVA反序列化 ](https://www.anquanke.com/post/id/251223)  
适合科普，给了个demo以及JBoss的真实案例  
```java
//实现Serializable接口，重写readObject()函数
class MyObject implements Serializable{
    public String name;
    private void readObject(java.io.ObjectInputStream in) throws IOException, ClassNotFoundException{
        in.defaultReadObject();
        Runtime.getRuntime().exec("C:/Windows/System32/cmd.exe /c calc");
    }
}
```

[编码bash](http://www.jackson-t.ca/runtime-exec-payloads.html)   
[ysoserial](https://github.com/frohoff/ysoserial)  

> JAVA反序列化漏洞检测：1)白盒方式，以ObjectInputStream.readObject()为例，检测readObject()方法调用时判断其对象是否为java.io.ObjectOutputStream。如果此时ObjectInputStream对象的初始化参数来自外部请求输入参数则基本可以确定存在反序列化漏洞；2)黑盒方式，JAVA序列化的数据一般会以标记（ac ed 00 05）开头，base64编码后的特征为rO0AB，对于这种流量特征的入口，可调用ysoserial并依次生成各个第三方库的利用payload，构造为访问特定url链接的payload，根据http访问请求记录判断反序列化漏洞是否利用成功。
> 修复手段包括：1)类白名单校验，在ObjectInputStream中resolveClass里只是进行了 class是否能被load，自定义ObjectInputStream, 重载resolveClass的方法，对className进行白名单校验;2)禁止JVM执行外部命令Runtime.exec，通过扩展SecurityManager可以实现;3)根据实际情况，需要及时更新commons-collections、commons-io等第三方库版本。
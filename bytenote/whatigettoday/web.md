
# 2021.08.20

[projectdiscovery之nuclei源码阅读](https://xz.aliyun.com/t/9988)  
nuclei在国内似乎并不火  
文章提到了“nuclei的最新版本支持基于chromium的headless访问”，可以通过yaml定义事件  
代码里有“go类型中的interface可以看成是任意类型，但是在使用时需要将他转换成我们指定的类型”，实际具体用的https://github.com/spf13/cast，可以用于fuzz了  

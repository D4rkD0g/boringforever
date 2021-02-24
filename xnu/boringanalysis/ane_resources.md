## 0x00 Background

几周前看到阿里天穹实验室的吴潍浠在BH ASIA 2021中投了一篇[Apple ANE](https://www.blackhat.com/asia-21/briefings/schedule/#apple-neural-engine-internal-from-ml-algorithm-to-hw-registers-22039)  

我就又不开心了。。。上车完、起步慢    
就把ANE相关的资料发一下吧  

iOS/macOS和机器学习相关的框架，对应不同处理器

CPU: BNNS, Accelerate框架的一部分
GPU: Metal Performance Shaders (MPS)
ANE: private frameworks

CoreML能够分割模型，然后不同的部分可能跑在不同的处理器上，因此CPU、GPU和ANE可能会共享内存。不过基于Intel的mac中，GPU会有自己的内存空间VRAM。

ANE目前有四份资料

## 0x01 The Neural Engine — what do we know about it?

偏向于开发的[neural-engine](https://github.com/hollance/neural-engine)

2017年的iPhone 8，搭载A11芯片，其中已经包含ANE；2020的iPad Air、iPhone 12、iPhone 12 Mini搭载A14芯片，其中还有机器学习加速组件AMX blocks。
macOS设备的话，只有M1有ANE功能。

ANE并不支持所有的层类型，因此并不是所有的模型都能在其上进行推理。最终能不能运行在ANE之上，苹果并没有给出具体的文档，因此大部分都只是测试推断出来的。(有时甚至和模型大小有关系)

```c
let config = MLModelConfiguration()
config.computeUnits = .all
//config.computeUnits = .cpuAndGPU //不会跑在ANE上

let model = try MyModel(configuration: config)
```
上边的配置，可能会跑在ANE之上。目前只能通过CoreML来操纵ANE，但是下一章节中会使用逆向私有API的方式，直接操作。
如果线程中出现H11ANEServicesThread，则可能运行在ANE上；或者可以下断点：`-[_ANEModel program]`，断下时则会在ANE上，还有几个可能有用的断点

```
Espresso::MPSEngine::context::__launch_kernel
Espresso::BNNSEngine::convolution_kernel::__launch
Espresso::elementwise_kernel_cpu::__launch
-[_ANEClient evaluateWithModel...] //评估在ANE上的时间
```

(Espresso到底是干啥的。。。。)  

``` 
(lldb) image list Espresso
得到path
(lldb) image dump symtab 'path'
```

```bash
$ log show --archive system_logs.logarchive --predicate '(subsystem IN {"com.apple.espresso","com.apple.coreml"}) && (category IN {"espresso","coreml"})' --info --debug --last 1d
$ log stream --predicate '(subsystem IN {"com.apple.espresso","com.apple.coreml"}) && (category IN {"espresso","coreml"})' --info --debug
```

## 0x02 tinygrad-ane

大佬的[tinygrad](https://github.com/geohot/tinygrad/tree/master/ane)  

主要从逆向的角度，直接使用API进行模型的执行

clang非xcode的话，可能需要

`SDKROOT=$(xcrun --sdk macosx --show-sdk-path)`

编译后需要entitlement，首先查看本机sign值，然后codesign

```
security find-identity -v -p codesigning
codesign --force --entitlements entitlements.xml -s "19FA89ED7D0FBFE2F622A07BD4E905FF3FE0943D" a.out
//可能还需要设置boot-args
nvram -p
sudo nvram boot-args="amfi_get_out_of_my_way=1"
```

`/Library/Developer/CommandLineTools/SDKs/MacOSX11.1.sdk/System/Library/PrivateFrameworks/ANECompiler.framework/`

补一句，这个大佬在YouTube中有几个数小时的视频，来逆向、调试ANE  

## 0x03 ANETOOLS

就是吴潍浠发的相关资料[ANETOOLS](https://github.com/antgroup-arclab/ANETools)  
感觉和tinygrad中的差不多

## 0x04 漏洞介绍与漏洞

见ANE_exp与anexploit

## 0x05 其他

[iOS-Runtime-Headers](https://github.com/nst/iOS-Runtime-Headers/tree/master/PrivateFrameworks/AppleNeuralEngine.framework)  
还有一个20多G的dyld_cache i64[文件](https://github.com/everettjf/dyld_shared_cache_ida)  


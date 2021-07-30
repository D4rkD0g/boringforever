主要针对微软的这套[AI-System](https://microsoft.github.io/AI-System/)，做一下笔记以及思考记录  
（不得不说这教程有查漏补缺的作用，之前的大部分资料来源于MindSpore、MegEngine、Oneflow等架构类的文章，多多少少的能够了解一个大概，但是并没有整体特别健全的框架）

## 0x01 基本概念(第三课)

AI框架的[八卦史](https://mp.weixin.qq.com/s/PQLQ0nN0fM4PPkhEUXfOmw)  
现在的framework主打灵活和高效。灵活主要是像Python这种前端语言的支持以及动态图这种动态调试。记得是说在Theano之前，并没有Python这种前端？  

高效主要是后端C++代码的高效执行，包含各种优化以及并行。优化这部分又涉及到一个问题：传统的编译器和ML编译器有什么[区别](https://www.zhihu.com/question/396105855)。个人目前看到的有多层IR、矩阵计算优化以及并行等。 可以先进行图级别的优化，在生成具体执行代码的时候，再进行指令级别的优化。 

基于数据流DAG的框架：数据结构Tensor与运算单元Operator。让Tensor流动起来，所以是TensorFlow。这里又扯到一个概念：SoN，Sea of Node，在V8等编译器里也有。数据流图具有use-def？的属性，包含了数据之间的依赖关系，因此适用于并发调度。  
Operator的概念更类似于接口，真正的实现叫做kernel，针对不同设备而言，同一种operator会有不同的kernel实现    

由于NN中最基本的还有求导，所以自动微分or自动求导就是标配了。类似于换元法？链式求导。  


#### 2.【自动求导需要补一下】
https://sangyx.com/1759

#### 3. 静态图与动态图的对比

```
静态：
	优点： 
		1. 效率高，因为可以进行全局的图优化
		2. 内存使用率高，因为可以根据固定的计算图判断内存使用情况。比如可以进行内存复用
	缺点：
		1. 难调试，不能得到某一步的结果
		2. 对控制流图支持不友好
动态：
	优点：
		1. 好调试
		2. 可以用Python直接表示控制流
	缺点：
		1. 优化、内存使用
```

现在的框架基本都支持动静转化，比如pytorch的tracing与scripting？

```
 efficiency
     ^
     |	Layer-based: Caffe
     |
     |	静态图：Tensorflow
     |
     |	动态图：PyTorch
     |
     |	Python-like：Numpy
     v
flexibility
```

PPT有说新一代AI编译器或者AI语言，就是DSC和DSL了  

## 0x02 编译优化(第九课)

课程里说了四种优化：图优化、内存优化、kernel优化、调度优化。

#### 1. 图优化

针对计算图进行：  
1. 表达式化简：等价替换  
2. CSE  
3. 常数传播：可能需要消耗大量内存。常量折叠可能涉及到计算，而传播只是用具体值替代  
4. operator batch：GEMM自动融合实现并行  
5. 算子融合  
6. 子图替换    
这个子图替换有点东西



https://hjchen2.github.io/2019/12/26/%E5%9B%BE%E6%9B%BF%E6%8D%A2/  
[TASO](https://zhuanlan.zhihu.com/p/110417288)

#### 2. 内存优化

1. 基于拓扑序的最小内存：基于拓扑序的内存复用  
2. 整数线性规划求解最优内存放置：怎么感觉不像是人话。目标是对任意的计算图，最小化执行时间。因为涉及快速内存（GPU内存），所以就是张量数据放置在哪的问题？相关方法的论文叫做[autoTM](https://dl.acm.org/doi/10.1145/3373376.3378465)，但不知道目前AISys中是否有在用  
3. 张量swap in/out，感觉和上边的一个道理啊，而且也算是计算机体系结构中的一个问题？这个其实是Capuchin这篇论文，但是有人提出了[疑问](https://zhuanlan.zhihu.com/p/98704479)

> 一个就是在Capuchin的benchmark里，选的都是batch size > 1的baseline，关注显存优化的工作，通常都知道在单卡能够hold batch size为1的训练场景的时候，实际上通过Gradient Accumulation这样的手段就可以比较廉价的解决掉显存问题了（这里忽略BN这样的计算层的影响，因为目前只是了解到在某些模型上，非Sync-BN可能带来收敛性影响，还并不是一个有足够多业务支持的需求）。另一个就是作者在调研related work的时候，没有提到微软发表在ISCA 18上的GIST的工作，GIST的工作在我看来是一个和swap-in/out和re-computation机制有本质区别的显存优化的工作。

内存优化这部分，目前只知道天元的[加强版亚线性显存优化技术](https://megengine.org.cn/blog/engine-tao-sublinear-memory-optimization)

> 亚线性优化方法采用简单的网格搜索（grid search）选择检查点，MegEngine 在此基础上增加遗传算法，采用边界移动、块合并、块分裂等策略，实现更细粒度的优化，进一步降低了显存占用。

此外，天元最近引入了DTR，基于完全动态的启发式策略，选择要被释放的张量，让被使用的显存低于阈值。策略有：  
1. 重计算的开销越小越好 —— 事少    
2. 占用的显存越大越好 —— 钱多  
3. 在显存中停留的时间越长越好 —— 离家近    
这样的张量优先被释放😹

#### 3. Kernel优化

1. 算子优化  

2. 分离计算与调度

计算逻辑：kernel的功能实现代码  
调度逻辑：如何加速计算，如利用并行、内存宽度等 <= 个人理解   

TVM、Halide、TACO、TC、FlexTensor  

比如TVM实现最基本的张量加法

```c
//TVM
C = tvm.compute((n,), lambda i: A[i] + B[i])
s = tvm.create_schedule(C.op)

//生成
for (int i = 0; i < n; ++i){
	C[i] = A[i] + B[i];
}
```
经过一步步的调度优化

```c
//TVM
C = tvm.compute((n,), lambda i: A[i] + B[i])
s = tvm.create_schedule(C.op)
xo, xi = s[C].split(s[C].axis[0], factor=32)
s[C].recorder(xi, xo)
s[C].bind(xo, tvm.thread_axis("blockIdx.x"))  //这不是Cuda的结构么
s[C].bind(xi, tvm.thread_axis("threadIdx.x"))

//生成
int i = threadIdx.x * 32 + blockIdx.x
if(i < n) {
	C[i] = A[i] + B[i];
}
```

3. 自动搜索与代码生成  
auto Tuner  <- autotvm

#### 4. 调度优化

把算子或者子图，协同调度并精确分配给每个计算单元。会有错误依赖以及死锁的问题  

调度这部分，可以参考oneflow[动态调度的“诅咒”| 原有深度学习框架的缺陷](https://zhuanlan.zhihu.com/p/383357707)

优化这部分，感觉稍微有点脱离实际，更多的是书本上的知识，或者是传统编译领域的东西  
还有，很多优化措施像是解决静态图  

## 0x03 推理(第八课)

推理部分主要考虑：延迟、吞吐、效率、灵活、扩展

[长尾延迟](https://blog.shunzi.tech/post/tail-latency/)，金丝雀策略

这部分涉及的更多的是一种业务层面的东西，偏向于平台  

## 0x04 分布式(第五、六、七课)

OneFlow主打分布
MindSpore中
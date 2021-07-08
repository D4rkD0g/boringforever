主要针对微软的这套[AI-System](https://microsoft.github.io/AI-System/)的第三课和第九课，做一下笔记以及思考记录  
（不得不说这教程有查漏补缺的作用，之前的大部分资料来源于MindSpore、MegEngine、Oneflow等架构类的文章，多多少少的能够了解一个大概，但是并没有整体特别健全的框架）

AI框架的[八卦史](https://mp.weixin.qq.com/s/PQLQ0nN0fM4PPkhEUXfOmw)  
现在的framework主打灵活和高效。灵活主要是像Python这种前端语言的支持以及动态图这种动态调试。记得是说在Theano之前，并没有Python这种前端？  

高效主要是后端C++代码的高效执行，包含各种优化以及并行。优化这部分又涉及到一个问题：传统的编译器和ML编译器有什么[区别](https://www.zhihu.com/question/396105855)。个人目前看到的有多层IR、矩阵计算优化以及并行等。 可以先进行图级别的优化，在生成具体执行代码的时候，再进行指令级别的优化。 

基于数据流DAG的框架：数据结构Tensor与运算单元Operator。让Tensor流动起来，所以是TensorFlow。这里又扯到一个概念：SoN，Sea of Node，在V8等编译器里也有。数据流图具有use-def？的属性，包含了数据之间的依赖关系，因此适用于并发调度。  
Operator的概念更类似于接口，真正的实现叫做kernel，针对不同设备而言，同一种operator会有不同的kernel实现    

由于NN中最基本的还有求导，所以自动微分or自动求导就是标配了。类似于换元法？链式求导。  


【自动求导需要补一下】
https://sangyx.com/1759

静态图与动态图的对比

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

PPT有说新一代AI编译器或者AI语言，就是DSC和DSL了  

图优化、内存优化、kernel优化、调度优化


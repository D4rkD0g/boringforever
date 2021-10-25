## 0x01 Compile

[官网](https://klee.github.io/build-llvm9/)，用的LLVM 12也可以。  
后端求解用的Z3，没加Gtest，但加了香菜和孜然  
编译libcxx的时候，需要的是wllvm  

```bash
sudo pip3 install wllvm
export LLVM_COMPILER=clang
LLVM_VERSION=12 SANITIZER_BUILD= BASE=/home/lambda/dev/libcxx REQUIRES_RTTI=1 DISABLE_ASSERTIONS=1 ENABLE_DEBUG=0 ENABLE_OPTIMIZED=1 ./scripts/build/build.sh libcxx
````
过程中会下载libcxx源码到指定的目录中并编译。然后再加一个uClibc。  
一大坨，编译

```bash
cmake \
  -DENABLE_SOLVER_Z3=ON \
  -DENABLE_POSIX_RUNTIME=ON \
  -DENABLE_KLEE_UCLIBC=ON \
  -DKLEE_UCLIBC_PATH=/home/lambda/dev/klee-uclibc \
  -DENABLE_KLEE_LIBCXX=ON \
  -DKLEE_LIBCXX_DIR=/home/lambda/dev/libcxx/libc++-install-120 \
  -DKLEE_LIBCXX_INCLUDE_DIR=/home/lambda/dev/libcxx/libc++-install-120/include/c++/v1 \
  -DENABLE_KLEE_EH_CXX=ON \
  -DKLEE_LIBCXXABI_SRC_DIR=/home/lambda/dev/libcxx/llvm-120/libcxxabi \
  -DENABLE_UNIT_TESTS=OFF \
  -DLLVM_CONFIG_BINARY=/usr/local/bin/llvm-config \
  -DLLVMCC=/usr/local/bin/clang \
  -DLLVMCXX=/usr/local/bin/clang++ ..
```

## 0x02 Harness

这部分需要修改源码，加入符号化的信息，然后再交给klee去跑  
这里在tflite的kernel找个算子，修改如下

```C++
#include "klee/klee.h"
...

TfLiteStatus Prepare(TfLiteContext* tcontext, TfLiteNode* tnode) {
  TfLiteContext* context = new TfLiteContext;
  TfLiteNode* node = new TfLiteNode;
  klee_make_symbolic(context, sizeof(*context), "context");
  klee_make_symbolic(node, sizeof(*node), "node");

  klee_assume(node->inputs != nullptr);
  klee_assume(node->outputs != nullptr);
  klee_assume(NumInputs(node) != -1);  //lite/c/commom.h:558
  klee_assume(NumOutputs(node) != -1);
  ...
}
```

最基本的需要klee的头文件，因为需要`klee_make_symbolic`来设置符号变量，以及可以用`klee_assume`来对符号变量做一些限制  
一般这种项目，编译单个源码文件，会提示缺少各种库、头文件，所以选择gllvm之类的，完整编译整个项目，然后get-bc提取bitcode。当然，对于“友好”的项目来讲，做完以上修改之后编译，会提示找不到klee头文件，并且会打印类似如下的编译指令

```bash
clang++ -emit-llvm -c -DEIGEN_MPL2_ONLY -DNOMINMAX=1 -DPTHREADPOOL_NO_DEPRECATED_API=1 -I /home/lambda/Tools/klee/include -I/home/lambda/targets/tf260/tensorflow/lite/schema -I/home/lambda/targets/tf260 -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/pthreadpool-source/include -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/FP16-source/include -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/xnnpack/include -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/cpuinfo-source -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/eigen -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/neon2sse -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/abseil-cpp -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/farmhash/src -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/flatbuffers/include -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/gemmlowp/public -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/gemmlowp -I/home/lambda/targets/tf260/tensorflow/lite/examples/minimal/build/ruy -g -fPIC -DTFLITE_BUILD_WITH_XNNPACK_DELEGATE -DTFL_STATIC_LIBRARY_BUILD -Wno-deprecated-declarations -pthread -std=gnu++14 -o depth_to_space.cc.o.bc -O0 -Xclang -disable-O0-optnone ../depth_to_space.cc
```

上边的是修改版，就是把单个源码文件摘出来，独自编译就好，加入`-I`以及`-emit-llvm -c`直接生成bitcode

## 0x03 Run

`klee --entry-point="_ZN6tflite3ops7builtin14depth_to_space7PrepareEP13TfLiteContextP10TfLiteNode" depth_to_space.cc.o.bc`

直接传入入口函数，由于C++的demangle，这个是直接执行Prepare函数

```bash
KLEE: WARNING: undefined reference to function: TfLiteIntArrayCreate
KLEE: WARNING: undefined reference to function: TfLiteTypeGetName
KLEE: WARNING: undefined reference to function: _ZN6tflite12GetInputSafeEPK13TfLiteContextPK10TfLiteNodeiPPK12TfLiteTensor
KLEE: WARNING: undefined reference to function: _ZN6tflite13GetOutputSafeEPK13TfLiteContextPK10TfLiteNodeiPP12TfLiteTensor
KLEE: WARNING: undefined reference to function: __gxx_personality_v0
KLEE: WARNING: undefined reference to function: printf
KLEE: WARNING ONCE: Alignment of memory from call "_Znwm" is not modelled. Using alignment of 8.
KLEE: ERROR: ../depth_to_space.cc:53: memory error: out of bound pointer
KLEE: NOTE: now ignoring this error at this location
KLEE: ERROR: ../depth_to_space.cc:54: memory error: out of bound pointer
KLEE: NOTE: now ignoring this error at this location
KLEE: ERROR: ../depth_to_space.cc:62: invalid function pointer
KLEE: NOTE: now ignoring this error at this location
```

然后就会报一些问题，主要还是由于符号化的结构体，并没有完整的成员？导致一个空指针？反正跑很久也不出什么完整的结构体信息  
数据在klee-last中，使用ktest-tool查看具体的信息  

```bash
ktest-tool klee-last/test000003.ktest
ktest file : 'klee-last/test000003.ktest'
args       : ['./depth_to_space.cc.o.ass.bc']
num objects: 2
object 0: name: 'context'
object 0: size: 176
object 0: data: b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
object 0: hex : 0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
object 0: text: ................................................................................................................................................................................
object 1: name: 'node'
object 1: size: 80
object 1: data: b'\x800\x8f\x86?V\x00\x00\x001\x8f\x86?V\x00\x00\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f\x8f'
object 1: hex : 0x80308f863f56000000318f863f5600008f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f
```

一时半会生成不了什么有效的东西，可以使用klee_assume使其满足初始的，比如输入个数信息，但是后续依旧很难生成新的东西，耗时。。。。。。

## 0x04 Test

那么klee能不能恢复一些结构体的信息呢

```c++
#include "klee/klee.h"
#include <assert.h>
#include <stdio.h>

typedef struct BFArray {
  int size;
  float data;
} BFArray;

int main(int argc, char *argv[]) {
  BFArray* bfa = new BFArray;
  klee_make_symbolic(bfa, sizeof(*bfa), "bfa");

  if (bfa->data == 1.1) {
    if (bfa->size == 1) {
      klee_assert(0);
    }
  }

  return 0;
}
```

But

```bash
ktest file : 'klee-last/test000001.ktest'
args       : ['lbtest.bc']
num objects: 1
object 0: name: 'bfa'
object 0: size: 8
object 0: data: b'\x00\x00\x00\x00\x00\x00\x00\x00'
object 0: hex : 0x0000000000000000
object 0: int : 0
object 0: uint: 0
object 0: text: ........
```

EMmmmm想起来，klee似乎不支持浮点数，有个单独的[klee-float](https://srg.doc.ic.ac.uk/projects/klee-float/getting-started.html)项目来研究这个问题。。。。。。也就是个五六年前的项目吧，难受。。。。。。

如果BFArray结构体是两个int  

```C++
  if (bfa->size == 1) {
    if (bfa->data == 0x1337) {
      klee_assert(0);
    }
  }
```

还是可以出结果的


```bash
KLEE: ERROR: lbtest.cc:49: ASSERTION FAIL: 0
KLEE: NOTE: now ignoring this error at this location

KLEE: done: total instructions = 30
KLEE: done: completed paths = 2
KLEE: done: partially completed paths = 1
KLEE: done: generated tests = 3
lambda@sirius:~/project/sest$ ktest-tool klee-last/test000003.ktest ktest file : 'klee-last/test000003.ktest'
args       : ['lbtest.bc']
num objects: 1
object 0: name: 'bfa'
object 0: size: 8
object 0: data: b'\x01\x00\x00\x007\x13\x00\x00'
object 0: hex : 0x0100000037130000
object 0: int : 21126944129025
object 0: uint: 21126944129025
object 0: text: ....7...
```

所以为什么不支持float，以及其他SE可以么？比如Symcc

## 0x05 Advanced Test

Emmm，刚才的额结构体太简单了，加点东西。。。  

```C++
typedef struct BFArray {
  int size;
  int data;
} BFArray;

typedef struct BFNode {
  BFArray* link;
  int size;
} BFNode;

int main(int argc, char *argv[]) {
    BFArray* bfa = new BFArray;
    BFNode* bfn = new BFNode;

    klee_make_symbolic(bfa, sizeof(BFArray), "bfa");
    klee_make_symbolic(bfn, sizeof(BFNode), "bfn");

    if (bfn->size == 3) {
      if (bfn->link->data == 0x1337) {
        klee_assert(0);
      }
    }

  return 0;
}
```

结果如下，代码中并没有用到bfa，但是还是有了数据，并且看起来还是和bfn有关系的数据...这是什么神奇的操作，难道知道bfn->link指向了bfa？？？  

```bash
ktest file : 'klee-last/test000011.ktest'
args       : ['lbtest.bc']
num objects: 2
object 0: name: 'bfa'
object 0: size: 8
object 0: data: b'\x00\x00\x00\x007\x13\x00\x00'
object 0: hex : 0x0000000037130000
object 0: int : 21126944129024
object 0: uint: 21126944129024
object 0: text: ....7...
object 1: name: 'bfn'
object 1: size: 16
object 1: data: b'h\xa2\xd5\xbd\xe9U\x00\x00\x03\x00\x00\x00\x00\x00\x00\x00'
object 1: hex : 0x68a2d5bde95500000300000000000000
object 1: text: h....U..........
```

不过这样子看不出bfn->link到底是怎么样子的，来一个数组瞧瞧  

```c++
typedef struct BFArray {
  int size;
  int data;
} BFArray;

typedef struct BFNode {
  BFArray* link;
  int size;
} BFNode;

int main(int argc, char *argv[]) {
    BFArray *bfa[5];
    klee_make_symbolic(&bfa, sizeof(bfa), "bfa");

    BFNode* bfn = new BFNode;
    klee_make_symbolic(bfn, sizeof(BFNode), "bfn");
    int *p = (int *)&bfa;
    memcpy(&bfn->link, &p, sizeof(BFArray *));

    if (bfn->size == 3) {
      if (bfn->link[2].data == 0x1337) {
        klee_assert(0);
      }
    }

  return 0;
}
```

这个对bfn->link赋值是真的费劲，可以先写具体执行的，然后再改为符号化的  
Emmmm，所以这种对bfn赋值后，bfn就没有值了，而值在bfa中。bfn->size没有被赋值，所以可以约束求解计算  
bfa中每个8字节，共5个

```bash
num objects: 2
object 0: name: 'bfa'
object 0: size: 40
object 0: data: b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x007\x13\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
object 0: hex : 0x00000000000000000000000000000000000000003713000000000000000000000000000000000000
object 0: text: ....................7...................
object 1: name: 'bfn'
object 1: size: 16
object 1: data: b'\x00\x00\x00\x00\x00\x00\x00\x00\x03\x00\x00\x00\x00\x00\x00\x00'
object 1: hex : 0x00000000000000000300000000000000
object 1: text: ................
```

终极来一个符号化的长度

```c++
typedef struct BFArray {
  int size;
  int data;
} BFArray;

typedef struct BFNode {
  BFArray* link;
  int size;
} BFNode;

int main(int argc, char *argv[]) {
    int cnt;
    klee_make_symbolic(&cnt, sizeof(int), "cnt");
    klee_assume(cnt <= 100); //为了防止下边对bfa符号化时，内存过大

    BFArray *bfa[cnt];
    klee_make_symbolic(&bfa, sizeof(BFArray *)*cnt, "bfa");

    BFNode* bfn = new BFNode;
    int *p = (int *)&bfa;
    klee_make_symbolic(bfn, sizeof(BFNode), "bfn");
    memcpy(&bfn->link, &p, sizeof(BFArray *));
    bfn->size = cnt;

    if (bfn->size >= 3) {
      if (bfn->link[2].data == 0x1337) {
        klee_assert(0);
      }
    }

  return 0;
}
```

结果如下

```bash
KLEE: Using Z3 solver backend
WARNING: this target does not support the llvm.stacksave intrinsic.
KLEE: NOTE: found huge malloc, returning 0
KLEE: ERROR: lbtest.cc:21: concretized symbolic size
KLEE: NOTE: now ignoring this error at this location
KLEE: ERROR: lbtest.cc:22: memory error: invalid pointer: make_symbolic
KLEE: NOTE: now ignoring this error at this location
KLEE: WARNING ONCE: Alignment of memory from call "_Znwm" is not modelled. Using alignment of 8.
KLEE: ERROR: lbtest.cc:35: ASSERTION FAIL: 0
KLEE: NOTE: now ignoring this error at this location

KLEE: done: total instructions = 215
KLEE: done: completed paths = 1
KLEE: done: partially completed paths = 3
KLEE: done: generated tests = 4


$ ktest-tool klee-last/test000003.ktest 
ktest file : 'klee-last/test000003.ktest'
args       : ['lbtest.bc']
num objects: 3
object 0: name: 'cnt'
object 0: size: 4
object 0: data: b'\x19\x00\x00\x00'
object 0: hex : 0x19000000
object 0: int : 25
object 0: uint: 25
object 0: text: ....
object 1: name: 'bfa'
object 1: size: 200
object 1: data: b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x007\x13\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
object 1: hex : 0x0000000000000000000000000000000000000000371300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
object 1: text: ....................7...................................................................................................................................................................................
object 2: name: 'bfn'
object 2: size: 16
object 2: data: b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
object 2: hex : 0x00000000000000000000000000000000
object 2: text: ................
lambda@sirius:~/project/sest$ 
```

bfn全被赋值，所以没有计算的结果。`bfn->size = cnt`，也就是25，所以bfa为`25*8`  

#### 0x00 背景

最近想接着搞搞LLVM IR以及程序分析，找了个教程[llvm-tutor](https://github.com/banach-space/llvm-tutor)，包含以下内容

HelloWorld			visits all functions and prints their names 	Analysis
OpcodeCounter		prints a summary of LLVM IR opcodes in the input module 	Analysis
InjectFuncCall 		instruments the input module by inserting calls to printf 	Transformation
StaticCallCounter 	counts direct function calls at compile-time (static analysis) 	Analysis
DynamicCallCounter 	counts direct function calls at run-time (dynamic analysis) 	Transformation
MBASub 				obfuscate integer sub instructions 	Transformation
MBAAdd 				obfuscate 8-bit integer add instructions 	Transformation
FindFCmpEq 			finds floating-point equality comparisons 	Analysis
ConvertFCmpEq 		converts direct floating-point equality comparisons to difference comparisons 	Transformation
RIV 				finds reachable integer values for each basic block 	Analysis
DuplicateBB 		duplicates basic blocks, requires RIV analysis results 	CFG
MergeBB 			merges duplicated basic blocks 	CFG

给出了这些pass。可以在根目录下执行cmake，但是要求的LLVM12，改改CMakeList就好

#### 0x01 HelloWorld

HelloWorld给出了一个pass最基本的架构：继承FunctionPass，然后runOnFunction，获取函数名字F.getName()以及函数参数个数F.arg_size()，这些信息可以当作函数签名，使用场景比如：代码相似性比对

#### 0x02 OpcodeCounter

在程序分析时可能经过多道不同的pass，因此需要Manager管理。opt执行pass的时候有两种方式

1. Legacy Pass Manager: 使用`-analyze`. This option is used to instruct opt to print the results of the analysis pass that has just been run.  
2. New Pass Manager: Simply use the printing pass that corresponds to OpcodeCounter. This pass is called print<opcode-counter>. No extra arguments are needed, but it's a good idea to add -disable-output (it is not required when using -analyze).

说实话，我没看懂。[这里](https://github.com/banach-space/llvm-tutor#about-pass-managers-in-llvm)又给了一个解释：Legacy Pass Manager you register a new command line option for opt, whereas New Pass Manager simply requires you to define a pass pipeline (with -passes=)

```C
//-----------------------------------------------------------------------------
// Legacy PM Registration
//-----------------------------------------------------------------------------
char LegacyOpcodeCounter::ID = 0;

// #1 REGISTRATION FOR "opt -analyze -legacy-opcode-counter"
static RegisterPass<LegacyOpcodeCounter> X(/*PassArg=*/"legacy-opcode-counter",
                                           /*Name=*/"Legacy OpcodeCounter Pass",
                                           /*CFGOnly=*/true,
                                           /*is_analysis=*/false);

// #2 REGISTRATION FOR "-O{0|1|2|3}"
// Register LegacyOpcodeCounter as a step of an existing pipeline. The insertion
// point is set to 'EP_EarlyAsPossible', which means that LegacyOpcodeCounter
// will be run automatically at '-O{0|1|2|3}'.
static llvm::RegisterStandardPasses
    RegisterOpcodeCounter(llvm::PassManagerBuilder::EP_EarlyAsPossible,
                          [](const llvm::PassManagerBuilder &Builder,
                             llvm::legacy::PassManagerBase &PM) {
                            PM.add(new LegacyOpcodeCounter());
                          });

//-----------------------------------------------------------------------------
// New PM Registration
//-----------------------------------------------------------------------------
llvm::PassPluginLibraryInfo getOpcodeCounterPluginInfo() {
  return {
    LLVM_PLUGIN_API_VERSION, "OpcodeCounter", LLVM_VERSION_STRING,
        [](PassBuilder &PB) {
          // #1 REGISTRATION FOR "opt -passes=print<opcode-counter>"
          // Register OpcodeCounterPrinter so that it can be used when
          // specyfying pass pipelines with `-passes=`.
          PB.registerPipelineParsingCallback(
              [&](StringRef Name, FunctionPassManager &FPM,
                  ArrayRef<PassBuilder::PipelineElement>) {
                if (Name == "print<opcode-counter>") {
                  FPM.addPass(OpcodeCounterPrinter(llvm::errs()));
                  return true;
                }
                return false;
              });
          // #2 REGISTRATION FOR "-O{1|2|3|s}"
          // Register OpcodeCounterPrinter as a step of an existing pipeline.
          // The insertion point is specified by using the
          // 'registerVectorizerStartEPCallback' callback. To be more precise,
          // using this callback means that OpcodeCounterPrinter will be called
          // whenever the vectoriser is used (i.e. when using '-O{1|2|3|s}'.
          PB.registerVectorizerStartEPCallback(
              [](llvm::FunctionPassManager &PM,
                 llvm::PassBuilder::OptimizationLevel Level) {
                PM.addPass(OpcodeCounterPrinter(llvm::errs()));
              });
          // #3 REGISTRATION FOR "FAM.getResult<OpcodeCounter>(Func)"
          // Register OpcodeCounter as an alysis pass. This is required so that
          // OpcodeCounterPrinter (or any other pass) can requests the results
          // of OpcodeCounter.
          PB.registerAnalysisRegistrationCallback(
              [](FunctionAnalysisManager &FAM) {
                FAM.registerPass([&] { return OpcodeCounter(); });
              });
          }
        };
}
```

用上边这个OpcodeCounter的代码来解释，那么Legacy其实是命令驱动的，类似一种被动行为？而New的这种，直接在LLVM的pipeline中插入pass，pipeline本来就是主动在走，然后主动执行插入的pass。  
目前，LLVM(11,12?)在优化的pipeline中默认使用NewPass(https://llvm.org/docs/WritingAnLLVMPass.html#introduction-what-is-a-pass)  
[一个知乎回答](https://www.zhihu.com/question/45051197)  

OpcodeCounter：遍历BB(for (auto &BB : Func))以及BB中的Inst(for (auto &Inst : BB))，分析Inst中的OpcodeName(StringRef Name = Inst.getOpcodeName();)   
这个pass分析到opcode级别，可以代码相似性、代码复杂度或者混淆等

#### 0x03 InjectFuncCall

InjectFuncCall：在每个函数之前注入新的代码，这是一个Transformation性质的pass。依旧使用的HelloWorld的测试用例，默认不输出任何数据(lli ./input_for_hello.bc)。  
`opt-11 -load-pass-plugin ../lib/libInjectFuncCall.so  -passes="inject-func-call"  input_for_hello.bc -o input_for_hello_print.bc`  
在此运行lli，发现可以输出。可以用于覆盖率收集，属于静态插桩。比如把二进制提升到LLVMIR，然后修改，再写回二进制。  

```C
bool InjectFuncCall::runOnModule(Module &M) {
  bool InsertedAtLeastOnePrintf = false;

  auto &CTX = M.getContext();
  PointerType *PrintfArgTy = PointerType::getUnqual(Type::getInt8Ty(CTX));

  // STEP 1: Inject the declaration of printf
  // ----------------------------------------
  // Create (or _get_ in cases where it's already available) the following
  // declaration in the IR module:
  //    declare i32 @printf(i8*, ...)
  // It corresponds to the following C declaration:
  //    int printf(char *, ...)
  FunctionType *PrintfTy = FunctionType::get(
      IntegerType::getInt32Ty(CTX),
      PrintfArgTy,
      /*IsVarArgs=*/true);

  FunctionCallee Printf = M.getOrInsertFunction("printf", PrintfTy);

  // Set attributes as per inferLibFuncAttributes in BuildLibCalls.cpp
  Function *PrintfF = dyn_cast<Function>(Printf.getCallee());
  PrintfF->setDoesNotThrow();
  PrintfF->addParamAttr(0, Attribute::NoCapture);
  PrintfF->addParamAttr(0, Attribute::ReadOnly);


  // STEP 2: Inject a global variable that will hold the printf format string
  //设置格式化字符
  llvm::Constant *PrintfFormatStr = llvm::ConstantDataArray::getString(
      CTX, "(llvm-tutor) Hello from: %s\n(llvm-tutor)   number of arguments: %d\n");

  Constant *PrintfFormatStrVar =
      M.getOrInsertGlobal("PrintfFormatStr", PrintfFormatStr->getType());
  dyn_cast<GlobalVariable>(PrintfFormatStrVar)->setInitializer(PrintfFormatStr);

  // STEP 3: For each function in the module, inject a call to printf
  // ----------------------------------------------------------------
  for (auto &F : M) {
    if (F.isDeclaration())
      continue;

    // Get an IR builder. 入口BB块的最开始
    IRBuilder<> Builder(&*F.getEntryBlock().getFirstInsertionPt());

    // Inject a global variable that contains the function name
    auto FuncName = Builder.CreateGlobalStringPtr(F.getName());

    // Printf requires i8*, but PrintfFormatStrVar is an array: [n x i8]. Add
    // a cast: [n x i8] -> i8*
    llvm::Value *FormatStrPtr =
        Builder.CreatePointerCast(PrintfFormatStrVar, PrintfArgTy, "formatStr");

    // The following is visible only if you pass -debug on the command line
    // *and* you have an assert build.
    LLVM_DEBUG(dbgs() << " Injecting call to printf inside " << F.getName()
                      << "\n");

    // Finally, inject a call to printf
    //插入printf("格式化字符",参数1，参数2)
    Builder.CreateCall(
        Printf, {FormatStrPtr, FuncName, Builder.getInt32(F.arg_size())});

    InsertedAtLeastOnePrintf = true;
  }

  return InsertedAtLeastOnePrintf;
}
```

对比一下前后的IR  

```C
; 未修改
define dso_local i32 @foo(i32 %0) #0 {
  %2 = alloca i32, align 4
  store i32 %0, i32* %2, align 4
  %3 = load i32, i32* %2, align 4
  %4 = mul nsw i32 %3, 2
  ret i32 %4
}

; 修改后
@PrintfFormatStr = global [68 x i8] c"(llvm-tutor) Hello from: %s\0A(llvm-tutor)   number of arguments: %d\0A\00"
@0 = private unnamed_addr constant [4 x i8] c"foo\00", align 1
define dso_local i32 @foo(i32 %0) #0 {
  %2 = call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([68 x i8], [68 x i8]* @PrintfFormatStr, i32 0, i32 0), i8* getelementptr inbounds ([4 x i8], [4 x i8]* @0, i32 0, i32 0), i32 1)
  %3 = alloca i32, align 4
  store i32 %0, i32* %3, align 4
  %4 = load i32, i32* %3, align 4
  %5 = mul nsw i32 %4, 2
  ret i32 %5
}
```

AFL中的有一部分插桩代码可以看看[AFL-LLVM-Mode](https://kiprey.github.io/2020/07/AFL-LLVM-Mode/)

#### 0x04 StaticCallCounter&&DynamicCallCounter

StaticCallCounter可以理解为代码中出现函数调用的次数，而DynamicCallCounter是实际函数被调用的次数(比如在循环中)  
StaticCallCounter中三段循环获取指令，dyn_cast<CallBase>(&Ins)判断是否是call， CB->getCalledFunction()判断是否是直接调用。函数原型定义在[InstrTypes](https://llvm.org/doxygen/InstrTypes_8h_source.html#l01396)  
如果不想依赖于opt,可以使用parseIRFile直接处理bc文件,编写独立的二进制程序:`std::unique_ptr<Module> M = parseIRFile(InputModule.getValue(), Err, Ctx);`

DynamicCallCounter是在0x03 InjectFuncCall的基础上实现的，主要还是通过插桩的方式，先插桩生成新的bc，然后lli执行，获取运行时的函数调用情况。这样的话，还不如用Pin动态插桩。

```C
LoadInst *Load2 = Builder.CreateLoad(Var);
Value *Inc2 = Builder.CreateAdd(Builder.getInt32(1), Load2);
Builder.CreateStore(Inc2, Var);
```

StaticCallCounter可以确定"热点"函数,fuzz的话可以优先测试,或者优化掉直接返回执行的结果.  
那么以上的这些API,可以做基本的静态分析确定函数,然后选择性插桩.  

#### 0x05 MBASub && MBAAdd

0x02中提到过这种opcode的混淆  
构建IRBuilder<> Builder(BinOp),然后Builder.CreateMul、Builder.CreateAdd、Builder.CreateXor等，需要注意参数。最后ReplaceInstWithInst(BB.getInstList(), Inst, NewInst);

之前的pass更多的是添加功能，这个就可以修改了，比如0x05说的优化"热点"函数

#### 0x06 FindFCmpEq && ConvertFCmpEq

看名字以为只是判断opcode来选指令  
其实还是pass流程上的知识点  
1. how to separate printing logic into a separate printing pass  
2. how to register it along with an analysis pass at the same time  
3. how to parse pass pipeline elements to conditionally register a pass  

  llvm::PassBuilder::registerAnalysisRegistrationCallback()   
  llvm::PassBuilder::registerPipelineParsingCallback()  

但是这两个在之前已经出现过了。以我有限的知识，registerAnalysisRegistrationCallback与FunctionAnalysisManager一起，registerPipelineParsingCallback与FunctionPassManager一起

FindFCmpEq中有一个没有用到的getComparisons函数，是在ConvertFCmpEq中使用。  
这个pass使用了FindFCmpEq的结果，可以学习到如何串联多个pass

`opt-11 -load-pass-plugin ../lib/libFindFCmpEq.so  -load-pass-plugin ../lib/libConvertFCmpEq.so -passes=convert-fcmp-eq  -S input_for_fcmp_eq_o0.ll -o input_for_fcmp_eq_convert.ll`

这个例子需要重新编译一下input：`clang -emit-llvm -S -Xclang -disable-O0-optnone \
  -c input_for_fcmp_eq.c -o input_for_fcmp_eq_o0.ll`。当然，如果编译bc时已经加入了优化选项，也是可以的。因为代码中有

```C
    // Functions marked explicitly 'optnone' should be ignored since we shouldn't
  // be changing anything in them anyway.
  if (Func.hasFnAttribute(Attribute::OptimizeNone)) {
    LLVM_DEBUG(dbgs() << "Ignoring optnone-marked function \"" << Func.getName()
                      << "\"\n");
    Modified = false;
  }
```

因为我在测试的时候，并没有预想的结果，于是想触发这段代码中的LLVM_DEBUG，but，opt没有[debug](https://llvm.org/docs/ProgrammersManual.html#the-llvm-debug-macro-and-debug-option)  的选项，教程后边其实已经介绍了，可能debug版的opt以及pass才能用？  

#### 0x07 RIV 	

编译的时候可以加`-fno-discard-value-names`保留变量名称等信息。  
这个pass终于优点CFG的影子了，使用了支配树的自带pass。原理内容可以参考《编译器设计2nd 9.2》  
我理解是在做变量存活检测，但是看到输出结果就有点不明白了  

感觉是DT的应用

#### 0x08 DuplicateBB && MergeBB 

数据流混淆与反混淆？是不是可以参考OLLVM了

#### 0x09 突然的总结

笔记的后边多多少少有点烂尾，主要是暂时没有应用场景。目前应用最多的就是插桩以及静态分析了。。。    
下一步是去把LLVM Pass的框架整理一下，免得每次用到的时候都要从头开始。  
然后看看AFL的插桩方式以及[instrim](https://github.com/csienslab/instrim)    
再看看symcc，应该就差不多了。程序改写方面没有什么想法，所以暂时掠过。对了，还有MLIR。  
哦 还有SVF和DG，不过和LLVM似乎没有特别大的关系？也算有关系。。。酱



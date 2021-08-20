
# 2021.08.20

[基于AFL改进的内存敏感的模糊测试工具MemAFL](https://xz.aliyun.com/t/10023)
改进AFL的一个毕设，有类似libfuzzer的strcmp对比数据，以及减少插桩（不插开头与结尾的BB）  
代码[开源](https://github.com/treebacker/MemAFL/blob/main/mm_metric/llvm_mode/afl-llvm-pass.so.cc)  
其中根据全局变量找User  
```C
    for (User *Usr : GVar.users()) {
      if(Usr == nullptr)
        continue;
      Instruction *Inst = dyn_cast<Instruction>(Usr);
      if (Inst == nullptr) {
        // If Usr is not an instruction, like i8* getelementptr...
        // Dig deeper to find Instruction.
        for (User *DirecUsr : Usr->users()) {
          if(DirecUsr == nullptr)
            continue;
          Inst = dyn_cast<Instruction>(DirecUsr);
          if (Inst == nullptr) {
            continue;
          }
        }
       。。。
```
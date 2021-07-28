## 0x00 没啥背景  

最近想砸一砸编译和反编译的知识，正好找一个工业级开源的来看看。了解一下反编译的过程，中间结构的保存形式以及上层分析的相关脚本、算法等    

[记一次对Ghidra反编译的修复](https://www.freebuf.com/articles/network/278014.html)：这文章从作者在用IDA、Ghidra逆Rust的时候，发现伪代码很奇怪，毕竟Ghidra开源，可以改来来取，于是开始了作者bug定位以及修改之路。其中有几个关键信息：  
1. Ghidra的反编译器是使用C++写的，源码在`Ghidra/Features/Decompiler/src/decompiler/cpp/`下  
2. `ActionDatabase::universalAction@coreaction.cc`文件中定义了反编译的步骤。有addAction和addRule两种操作，Action一般对函数进行操作；Rule在特定的IR指令上操作。
3. `make decomp_dbg`直接编译反汇编器，入口在`main@consolemain.cc`  
4. 文档主要是docmain.hh和doccore.hh，docmain里有反汇编的15个步骤  

## 0x01 环境  

目前并不涉及上层Java的东西，但还是列一下几个命令。项目使用[gradle](https://gradle.org/install/#manually)进行构建，最先当然是安装gradle

```bash
#环境：Ubuntu
gradle -I gradle/support/fetchDependencies.gradle init
gradle prepdev buildNatives_linux64 #eclipse
gradle buildGhidra
#最后在 build/dist/下生成zip
```

最开始的文章提到可以直接在`Ghidra/Features/Decompiler/src/decompiler/cpp/`下`make decomp_dbg`，但是生成的decomp_dbg需要指定Ghidra的路径，而且是处理器相关的目录。所以还是需要编译好的Ghidra

`/lambdax/ghidra-master/Ghidra/Features/Decompiler/src/decompile/cpp# ./decomp_dbg -s /lambdab/ghidra-master/build/dist/ghidra_10.1_DEV/Ghidra/Processors/x86/data/languages/`

最开始不知道加`-s`，到后来加`-s`指定的目录不对，过程只能看源码了  

```c
//1. bdf_arch.cc
void BfdArchitecture::buildLoader(DocumentStorage &store)

{
  LoadImageBfd *ldr;

  collectSpecFiles(*errorstream);
  if (getTarget().find("binary")==0)
    ldr = new LoadImageBfd(getFilename(),"binary");
  else if (getTarget().find("default")==0)
    ldr = new LoadImageBfd(getFilename(),"default");
  else
    ldr = new LoadImageBfd(getFilename(),getTarget());
  ldr->open();
  if (adjustvma!=0)
    ldr->adjustVma(adjustvma);
  loader = ldr;
}

//2. sleigh_arch.cc
/// This is run once when spinning up the decompiler.
/// Look for the root .ldefs files within the normal directories and parse them.
/// Use these to populate the list of \e language \e ids that are supported.
/// \param errs is an output stream for writing error messages
void SleighArchitecture::collectSpecFiles(ostream &errs)

{
  if (!description.empty()) return; // Have we already collected before

  vector<string> testspecs;
  vector<string>::iterator iter;
  specpaths.matchList(testspecs,".ldefs",true);
  for(iter=testspecs.begin();iter!=testspecs.end();++iter)
    loadLanguageDescription(*iter,errs);
}

//3. filemanage.cc
void FileManage::matchList(vector<string> &res,const string &match,bool isSuffix) const

{
  vector<string>::const_iterator iter;

  for(iter=pathlist.begin();iter!=pathlist.end();++iter)
    matchListDir(res,match,isSuffix,*iter,false);
}
```

一般反汇编器打开二进制文件，首先是要判断架构的，然后才能使用对应的指令集规则去解析。在`SleighArchitecture::collectSpecFiles`的`specpaths.matchList(testspecs,".ldefs",true)`中，specpaths就是传入的路径，然后找后缀`.ldefs`的文件，找到后，`loadLanguageDescription`函数会获取相应的描述信息，然后与二进制的架构信息做判断，如果Ghidra找到自己有对应的解析能力，才会进行反编译。  

## 0x02 docmain.hh

#### 1. 概览

这个库提供RTL(Register Transfer Language)，也就是p-code  
SLEIGH：PSL(processor specification language), 形式化的描述了特定处理器的机器指令到人类可读的汇编指令与p-code，后边有一节来介绍  
有一个文档描述核心类以及方法，同时有一个文档总结了反汇编分析中用到的简化规则（都还没找到）  

#### 2. 能力

能力没写，但都懂

#### 3. 设计

反编译的设计思想主要来自于编译原理，两者都是把一种语言转换成另外一种，并且有一个共同的工作流程：  
- Parse输入  
- IR+AST  
- 操作优化AST  
- 生成  

和编译相似的操作：  
- RTL(p-code)  
- SSA  
- 基本块与CFG  
- Term rewriting rules  
- DCE   
- 符号表与域 

一般，高级语言能够很精确的得到程序的信息，而低级语言智能靠推断（这也是编译优化转为IR的过程，需要尽可能的保存程序信息）  
反编译特有的一些操作：  
- 合并变量(寄存器分配着色？？)  
- 类型传播  
- 重建控制流    
- 恢复函数原型    
- 恢复表达式  

#### 4. 流程

```
step0-4
step5
  step5a
  Adjust p-code in special situations.
  step5b
  step5c
  step5d
  step5e
  step5f
step6-14
```

1. step0 指定入口
  
  The user specifies a starting address for a particular function.

  \subsection step1 Generate Raw P-code

  The p-code generation engine is called \b SLEIGH. Based on a
  processor specification file, it maps binary encoded
  machine instructions to sequences of p-code operations.
  P-code operations are generated for a single machine
  instruction at a specific address.  The control flow
  through these p-code operations is followed to determine
  if control falls through, or if there are jumps or calls.
  A work list of new instruction addresses is kept and is
  continually revisited until there are no new instructions.
  After the control flow is traced, additional changes may
  be made to the p-code.

    -# PIC constructions are checked for, now that the
       extent of the function is known.  If a call is to a
       location that is still within the function, the call
       is changed to a jump.
    -# Functions which are marked as inlined are filled in
       at this point, before basic blocks are generated.
       P-code for the inlined function is generated
       separately and control flow is carefully set up to
       link it in properly.

   \subsection step2 Generate Basic Blocks and the CFG

   Basic blocks are generated on the p-code instructions
   (\e not the machine instructions) and a control flow graph
   of these basic blocks is generated.  Control flow is
   normalized so that there is always a unique start block
   with no other blocks falling into it.  In the case of
   subroutines which have branches back to their very first
   machine instruction, this requires the creation of an
   empty placeholder start block that flows immediately into
   the block containing the p-code for the first instruction.

   \subsection step3 Inspect Sub-functions

      -# Addresses of direct calls are looked up in the
         database and any parameter information is
         recovered.
      -# If there is information about an indirect call,
         parameter information can be filled in and the
         indirect call can be changed to a direct call.
      -# Any call for which no prototype is found has a
         default prototype set for it.
      -# Any global or default prototype recovered at this
         point can be overridden locally.

   \subsection step4 Adjust/Annotate P-code

     -# The context database is searched for known values of
        memory locations coming into the function.  These
        are implemented by inserting p-code \b COPY
        instructions that assign the correct value to the
        correct memory location at the beginning of the
        function.
     -# The recovered prototypes may require that extra
        p-code is injected at the call site so that certain
        actions of the call are explicit to the analysis
        engine.
     -# Other p-code may be inserted to indicate changes a
        call makes to the stack pointer.  Its possible that
        the change to the stack pointer is unknown. In this
        case \b INDIRECT p-code instructions are inserted to
        indicate that the state of the stack pointer is
        unknown at that point, preparing for the extrapop
        action.
     -# For each p-code call instruction, extra inputs are
        added to the instruction either corresponding to a
        known input for that call, or in preparation for the
        prototype recovery actions.  If the (potential)
        function input is located on the stack, a temporary
        is defined for that input and a full p-code \b LOAD
        instruction, with accompanying offset calculation,
        is inserted before the call to link the input with
        the (currently unknown) stack offset. Similarly
        extra outputs are added to the call instructions
        either representing a known return value, or in
        preparation for parameter recovery actions.
     -# Each p-code \b RETURN instruction for the current
        function is adjusted to hide the use of the return
        address and to add an input location for the return
        value. The return value is considered an input to
        the \b RETURN instruction.

   \subsection step5 The Main Simplification Loop

     \subsubsection step5a Generate SSA Form

     This is very similar to forward engineering
     algorithms. It uses a fairly standard phi-node
     placement algorithm based on the control flow dominator
     tree and the so-called dominance frontier.  A standard
     renaming algorithm is used for the final linking of
     variable defs and uses.  The decompiler has to take
     into account partially overlapping variables and guard
     against various aliasing situations, which are
     generally more explicit to a compiler.  The decompiler
     SSA algorithm also works incrementally. Many of the
     stack references in a function cannot be fully resolved
     until the main term rewriting pass has been performed
     on the register variables.  Rather than leaving stack
     references as associated \b LOAD s and \b STORE s, when
     the references are finally discovered, they are
     promoted to full variables within the SSA tree. This
     allows full copy propagation and simplification to
     occur with these variables, but it often requires 1 or
     more additional passes to fully build the SSA tree.
     Local aliasing information and aliasing across
     subfunction calls can be annotated in the SSA structure
     via \b INDIRECT p-code operations, which holds the
     information that the output of the \b INDIRECT is derived
     from the input by some indirect (frequently unknown)
     effect.

     \subsubsection step5b Eliminate Dead Code

     Dead code elimination is essential to the decompiler
     because a large percentage of machine instructions have
     side-effects on machine state, such as the setting of
     flags, that are not relevant to the function at a
     particular point in the code.  Dead code elimination is
     complicated by the fact that its not always clear what
     variables are temporary, locals, or globals.  Also,
     compilers frequently map smaller (1-byte or 2-byte)
     variables into bigger (4-byte) registers, and
     manipulation of these registers may still carry around
     left over information in the upper bytes.  The
     decompiler detects dead code down to the bit, in order
     to appropriately truncate variables in these
     situations.

     \subsubsection step5c Propagate Local Types

     The decompiler has to infer high-level type information
     about the variables it analyzes, as this kind of
     information is generally not present in the input
     binary.  Some information can be gathered about a
     variable, based on the instructions it is used in (i.e.
     if it is used in a floating point instruction).  Other
     information about type might be available from header
     files or from the user.  Once this is gathered, the
     preliminary type information is allowed to propagate
     through the syntax trees so that related types of other
     variables can be determined.

     \subsubsection step5d Perform Term Rewriting

     The bulk of the interesting simplifications happen in
     this section.  Following Formal Methods style term
     rewriting, a long list of rules are applied to the
     syntax tree. Each rule matches some potential
     configuration in a portion of the syntax tree, and
     after the rule matches, it specifies a sequence of edit
     operations on the syntax tree to transform it.  Each
     rule can be applied repeatedly and in different parts
     of the tree if necessary.  So even a small set of rules
     can cause a large transformation. The set of rules in
     the decompiler is extensive and is tailored to specific
     reverse engineering needs and compiler constructs.  The
     goal of these transformations is not to optimize as a
     compiler would, but to simplify and normalize for
     easier understanding and recognition by human analysts
     (and follow on machine processing).  Typical examples
     of transforms include: copy propagation, constant
     propagation, collecting terms, cancellation of
     operators and other algebraic simplifications, undoing
     multiplication and division optimizations, commuting
     operators, ....

     \subsubsection step5e Adjust Control Flow Graph

     The decompiler can recognize
        - unreachable code
        - unused branches
        - empty basic blocks
        - redundant predicates
        - ...
     
     It will remove branches or blocks in order to
     simplify the control flow.

     \subsubsection step5f Recover Control Flow Structure

     The decompiler recovers higher-level control flow
     objects like loops, \b if/\b else blocks, and \b switch
     statements.  The entire control flow of the function is
     built up hierarchically with these objects, allowing it
     to be expressed naturally in the final output with the
     standard control flow constructs of the high-level
     language.  The decompiler recognizes common high-level
     unstructured control flow idioms, like \e break, and can
     use node-splitting in some situations to undo compiler
     flow optimizations that prevent a structured
     representation.

  \subsection step6 Perform Final P-code Transformations

  During the main simplification loop, many p-code
  operations are normalized in specific ways for the term
  rewriting process that aren't necessarily ideal for the
  final output. This phase does transforms designed to
  enhance readability of the final output.  A simple example
  is that all subtractions (\b INT_SUB) are normalized to be an
  addition on the twos complement in the main loop. This
  phase would convert any remaining additions of this form
  back into a subtraction operation.

  \subsection step7 Exit SSA Form and Merge Low-level Variables (phase 1)

  The static variables of the SSA form need to be merged
  into complete high-level variables.  The first part of
  this is accomplished by formally exiting SSA form.  The
  SSA phi-nodes and indirects are eliminated either by
  merging the input and output variables or inserting extra
  \b COPY operations.  Merging must guard against a high-level
  variable holding different values (in different memory
  locations) at the same time.  This is similar to register
  coloring in compiler design.

  \subsection step8 Determine Expressions and Temporary Variables

  A final determination is made of what the final output
  expressions are going to be, by determining which
  variables in the syntax tree will be explicit and which
  represent temporary variables.  Certain terms must
  automatically be explicit, such as constants, inputs,
  etc. Other variables are forced to be explicit because
  they are read too many times or because making it implicit
  would propagate another variable too far.  Any variables
  remaining are marked implicit.

  \subsection step9 Merge Low-level Variables (phase 2)

  Even after the initial merging of variables in phase 1,
  there are generally still too many for normal C code.  So
  the decompiler does additional, more speculative merging.
  It first tries to merge the inputs and outputs of copy
  operations, and then the inputs and outputs of more
  general operations.  And finally, merging is attempted on
  variables of the same type. Each potential merge is
  subject to register coloring restrictions.

  \subsection step10 Add Type Casts

  Type casts are added to the code so that the final output
  will be syntactically legal.

  \subsection step11 Establish Function's Prototype

  The register/stack locations being used to pass parameters
  into the function are analyzed in terms of the parameter
  passing convention being used so that appropriate names
  can be selected and the prototype can be printed with the
  input variables in the correct order.

  \subsection step12 Select Variable Names

  The high-level variables, which are now in their final
  form, have names assigned based on any information
  gathered from their low-level elements and the symbol
  table.  If no name can be identified from the database, an
  appropriate name is generated automatically.

  \subsection step13 Do Final Control Flow Structuring

   -# Order separate components
   -# Order switch cases
   -# Determine which unstructured jumps are breaks
   -# Stick in labels for remaining unstructured jumps

  \subsection step14 Emit Final C Tokens

  Following the recovered function prototype, the recovered
  control flow structure, and the recovered expressions, the
  final C tokens are generated.  Each token is annotated
  with its syntactic meaning, for later syntax
  highlighting. And most tokens are also annotated with the
  address of the machine instruction with which they are
  most closely associated.  This is the basis for the
  machine/C code cross highlighting capability.  The tokens
  are passed through a standard Oppen pretty-printing
  algorithm to determine the final line breaks and
  indenting.


*/







## 0x01 石器时代-pythonfuzz

fuzzit出品的[pythonfuzz](https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/pythonfuzz)，没有借用任何已有的fuzz工具，纯python手工实现

比python-afl更方便，直接在被fuzz函数上加修饰器`@PythonFuzz`

自己用多进程实现了fuzz过程，其中还有语料的生成(这部分以后可以复用)，依旧使用tracer实现覆盖率

parent给child发送测试用例，child执行完成后，如果有exception则通知parent；如果没有异常，则返回tracer.get_coverage()。

```PY
def trace(frame, event, arg):
    if event != 'line':
        return trace

    global prev_line
    global prev_filename

    func_filename = frame.f_code.co_filename
    func_line_no = frame.f_lineno

    if func_filename != prev_filename:
        # We need a way to keep track of inter-files transferts,
        # and since we don't really care about the details of the coverage,
        # concatenating the two filenames in enough.
        data[func_filename + prev_filename].add((prev_line, func_line_no))
    else:
        data[func_filename].add((prev_line, func_line_no))

    prev_line = func_line_no
    prev_filename = func_filename

    return trace
```
所以是行覆盖率，真简单粗暴
代码中还想用lru_cache加快速度，但是不知道什么原因并没有实现相关功能  

注: 可能需要把corpus.py中的random.\_randblow替换为secrets.randbelow(n)

*这个项目满满的纯石器时代，纯原始手工制造*

## 0x02 青铜时代-python-afl

[python-afl](https://github.com/jwilk/python-afl)是一个借助AFL来进行fuzz的工具，说是面向pure-Python code，对外提供init、loop来个函数，操作简单方便。

2015年的文章[](https://alexgaynor.net/2015/apr/13/introduction-to-fuzzing-in-python-with-afl/)，但是项目今年仍在更新。虽然比pythonfuzz要早，但是核心技术却要高效

python-afl主要使用Cython编写了一个python扩展，Cython是一个快速生成Python扩展模块的工具，代码文件只有afl.pyx，自动生成afl.c文件

覆盖率部分，在trace函数

```py
cdef object trace
def trace(frame, event, arg):
    global prev_location, tstl_mode
    cdef unsigned int location, offset
    cdef object filename = frame.f_code.co_filename
    if tstl_mode and (filename[-7:] in ['sut.py', '/sut.py']):
        return None
    location = (
        lhash(filename, frame.f_lineno)
        % MAP_SIZE
    )
    offset = location ^ prev_location
    prev_location = location // 2
    afl_area[offset] += 1
    # TODO: make it configurable which modules are instrumented, and which are not
    return trace
```
计算文件名与代码函数的hash，来标识位置。所以这不是和AFL公用一个bitmap？
此外实现了信号处理以及fork相关的功能

最后，工具提供tstl相关的模式，但是还是需要编写相关的代码

## 0x03 重工业时代-cpytraceafl

上边的两款更多的是针对pure python code，而且都是行覆盖率（可能他们再写的时候，还没有python3.7
[cpytraceafl](https://github.com/risicle/cpytraceafl):CPython bytecode instrumentation and forkserver tools for fuzzing pure python and mixed python/c code using AFL 
这款工具虽然今年才开源，star稀少，但是确实有效！

    Pillow: CVE-2020-10177, CVE-2020-10378, CVE-2020-10379, CVE-2020-10994, CVE-2020-11538.
    bsdiff4: CVE-2020-15904
    asyncpg: CVE-2020-17446

作者主要受[文章](https://nedbatchelder.com/blog/200804/wicked_hack_python_bytecode_tracing.html)的启发，这是一篇2008年的文章

> the rewriter identifies "basic blocks" in the python bytecode and abuses the code object's lnotab (line-number table) to mark each basic block as a new "line". These new "lines" are what trigger CPython's line-level trace hooks. The result of this being that we can get our trace hook executed on every new basic block.

之后就是`fuzz_from_here()`,其中有shm、fork操作，然后就是设置trace函数`global_trace_hook`,

```C

static PyObject * tracehook_global_trace_hook(PyObject *self, PyObject *args) {
    PyObject* frame;
    char* event;
    PyObject* arg;

    if (!PyArg_ParseTuple(args, "OsO", &frame, &event, &arg))
        return NULL;

    if (!strcmp(event, "call")) {
        PyObject* code = PyObject_GetAttrString(frame, "f_code");
        if (code == NULL) return NULL;
        PyObject* lnotab = PyObject_GetAttrString(code, "co_lnotab");
        Py_DECREF(code);
        if (lnotab == NULL) return NULL;
        Py_ssize_t len = PyObject_Length(lnotab);
        Py_DECREF(lnotab);
        if (len > 0) {  // else this is not a function we're interested in
            PyObject* line_trace_hook = PyObject_GetAttrString(self, "line_trace_hook");
            if (line_trace_hook == NULL) return NULL;
            Py_INCREF(line_trace_hook);
            return line_trace_hook;
        }
    }

    Py_INCREF(Py_None);
    return Py_None;
}
```
line_trace_hook是在做覆盖率计算的函数

*不得不说，项目代码实现真的是重工业的机油味道*

## 0x04 科技时代-atheris

谷歌在2020年12月开源了[atheris](https://pypi.org/project/atheris/)，并发了相应的介绍[文章](https://security.googleblog.com/2020/12/how-atheris-python-fuzzer-works.html)，这篇文章中引用了一个上边介绍cpytraceafl时，提到的nedbatchelder的另外一篇[文章](https://nedbatchelder.com/text/trace-function.html),这篇主要介绍trace功能

Atheris在CPython中注册了一个tracer，来收集python代码相关的执行信息，能够记录到达的所有行以及每个运行的函数。Atheris主要就是赶上了新时代，可以使用opcode级别的trace。

后端使用Libfuzzer，所以使用上也相似，Setup设置待测试的函数，然后Fuzz。提供了FuzzedDataProvider功能，免去了手动提取数据、转换类型的麻烦。

Setup主要还是SetupTracer，根据flag设置TracerNoOpcodes/Tracer

```c
int Tracer(void* pyobj, PyFrameObject* frame, int what, PyObject* arg_unused) {
  frame->f_trace_opcodes = true;

  TraceKey key = 0;
  if (what == PyTrace_CALL) {
    key = CompositeHash(frame->f_lineno, what, frame->f_code);
  }
  if (what == PyTrace_OPCODE) { #frame.f_lasti：当前指令索引
    key = CompositeHash(frame->f_lineno, what, frame->f_lasti, frame->f_code);
  }

  // With opcode tracing, we only need to track CALL and OPCODE events.
  // Anything else (e.g. LINE events) is redundant, as we'll also get one or
  // more OPCODE events for those lines.
  if (what == PyTrace_CALL || what == PyTrace_OPCODE) {
    auto entry_data = FindOrAddModuleData(key, what == PyTrace_CALL);
    MarkEntryVisited(*entry_data.first);

    if (what == PyTrace_OPCODE) {
      unsigned int opcode =
          PyBytes_AsString(frame->f_code->co_code)[frame->f_lasti];
      if (opcode == COMPARE_OP) {
        TraceCompareOp(*entry_data.first, frame);
      }
    }

    if (what == PyTrace_CALL && entry_data.second &&
        printed_funcs < max_printed_funcs) {
      ++printed_funcs;
      PrintFunc(frame);
    }
  }

  return 0;
}

int TracerNoOpcodes(void* pyobj, PyFrameObject* frame, int what,
                    PyObject* arg_unused) {
  // When not using OPCODE tracing, trace every kind of event we can.
  auto key = CompositeHash(frame->f_lineno, what, frame->f_code);
  auto entry_data = FindOrAddModuleData(key, what == PyTrace_CALL);
  MarkEntryVisited(*entry_data.first);

  if (what == PyTrace_CALL && entry_data.second &&
      printed_funcs < max_printed_funcs) {
    ++printed_funcs;
    PrintFunc(frame);
  }

  return 0;
}
```

这里使用Libfuzzer的话，其实有一个问题：有两个主要的代码覆盖率机制`__sanitizer_cov_pcs_init`和`__sanitizer_cov_8bit_counters_init`，但都需要先知道BB块数量或者PC数量，但Python中只有加载代码后才知道。不过Libfuzzer支持fuzz动态库

> Atheris simulates loading shared libraries! When tracing is initialized, Atheris first calls those functions with an array of 8-bit counters and completely made-up program counters. Then, whenever a new Python line is reached, Atheris allocates a PC and 8-bit counter to that line; Atheris will always report that line the same way from then on. Once Atheris runs out of PCs and 8-bit counters, it simply loads a new “shared library” by calling those functions again.

单词都懂，但是不知道什么意思。。。

科技时代用了opcode级别的覆盖率确实方便了很多，因此此时关注的更多的就是如何和fuzz的结合，或者说由于python的鸭子类型，如果生成高质量的测试用例

*还算比较优雅*

## 0x05 coveragepy

上边多个工具提到的大佬nedbat，其实开源了一个Python代码覆盖率工具[coveragepy](https://github.com/nedbat/coveragepy)，虽然没有明确说提供opcode级别，但其实是做了内部的转化`hack_line_numbers`，也就是cpytraceafl中实现的rewrite功能

## 0x06 背景知识补充

#### 1. [lnotab](https://svn.python.org/projects/python/branches/pep-0384/Objects/lnotab_notes.txt)

```
>>> code = """
... x = 1
...
... if x == 1:
...     print("123")
...
... y = 2
... print(x + y)
... """
>>>
>>>
>>> code_obj = compile(code, "<string>", "exec")
>>> code_obj.co_lnotab
b'\x04\x02\x08\x01\x08\x02\x04\x01'
>>> dis.dis(code_obj)
  2           0 LOAD_CONST               0 (1)
              2 STORE_NAME               0 (x)

  4           4 LOAD_NAME                0 (x)
              6 LOAD_CONST               0 (1)
              8 COMPARE_OP               2 (==)
             10 POP_JUMP_IF_FALSE       20

  5          12 LOAD_NAME                1 (print)
             14 LOAD_CONST               1 ('123')
             16 CALL_FUNCTION            1
             18 POP_TOP

  7     >>   20 LOAD_CONST               2 (2)
             22 STORE_NAME               2 (y)

  8          24 LOAD_NAME                1 (print)
             26 LOAD_NAME                0 (x)
             28 LOAD_NAME                2 (y)
             30 BINARY_ADD
             32 CALL_FUNCTION            1
             34 POP_TOP
             36 LOAD_CONST               3 (None)
             38 RETURN_VALUE
```
\x04\x02 
	反汇编第四条，对应源码第二行
\x08\x01
	和上边的累加变为\x12\x03，反汇编第12条，对应源码第3行
\x08\x02
	和上边的累加变为\x20\x05，反汇编第20条，对应源码第5行
\x04\x01
	和上边的累加变为\x24\x06，反汇编第23条，对应源码第6行

#### 2. [settrace](https://docs.python.org/3/library/sys.html#sys.settrace)过程分析
以python3.9为例，函数接收三个参数
frame： 当前栈帧
event： 'call', 'line', 'return', 'exception' or 'opcode'（python3.7其中多了opcode
arg： event对应的参数

以cpython3.8.5源码为例

```C
//SYSMODULE.c
static PyObject *
sys_settrace(PyObject *self, PyObject *args)
{
    if (trace_init() == -1)
        return NULL;
    if (args == Py_None)
        PyEval_SetTrace(NULL, NULL);
    else
        PyEval_SetTrace(trace_trampoline, args);
    Py_RETURN_NONE;
}
void
PyEval_SetTrace(Py_tracefunc func, PyObject *arg)
{
    if (PySys_Audit("sys.settrace", NULL) < 0) {
        _PyErr_WriteUnraisableMsg("in PyEval_SetTrace", NULL);
        return;
    }

    _PyRuntimeState *runtime = &_PyRuntime;
    PyThreadState *tstate = _PyRuntimeState_GetThreadState(runtime);
    PyObject *temp = tstate->c_traceobj;
    runtime->ceval.tracing_possible += (func != NULL) - (tstate->c_tracefunc != NULL);
    Py_XINCREF(arg);
    tstate->c_tracefunc = NULL;
    tstate->c_traceobj = NULL;
    /* Must make sure that profiling is not ignored if 'temp' is freed */
    tstate->use_tracing = tstate->c_profilefunc != NULL;
    Py_XDECREF(temp);
    tstate->c_tracefunc = func;
    tstate->c_traceobj = arg;
    /* Flag that tracing or profiling is turned on */
    tstate->use_tracing = ((func != NULL)
                           || (tstate->c_profilefunc != NULL));
}
```

PyEval_SetTrace获取线程状态，并设置传入的tracefunc以及对应的arg，其实这个arg就是传入的自定义的trace函数，赋值给了c_traceobj。在ceval.c中，有这样的代码注释

```c
    if (tstate->use_tracing) {
        if (tstate->c_tracefunc != NULL) {
            /* tstate->c_tracefunc, if defined, is a
               function that will be called on *every* entry
               to a code block.  Its return value, if not
               None, is a function that will be called at
               the start of each executed line of code.
               (Actually, the function must return itself
               in order to continue tracing.)  The trace
               functions are called with three arguments:
               a pointer to the current frame, a string
               indicating why the function is called, and
               an argument which depends on the situation.
               The global trace function is also called
               whenever an exception is detected. */
            if (call_trace_protected(tstate->c_tracefunc,
                                     tstate->c_traceobj,
                                     tstate, f, PyTrace_CALL, Py_None))
```

如果定义了c_tracefunc，那么每次进入代码块时都会被调用===>`result = func(obj, frame, what, arg);`，最开始其实调用的是`PyEval_SetTrace(trace_trampoline, args);`

那么因此，就是在调用trace_trampoline(obj, frame, what, arg)

```C
trace_trampoline(PyObject *self, PyFrameObject *frame,
                 int what, PyObject *arg)
{
    PyObject *callback;
    PyObject *result;

    if (what == PyTrace_CALL)
        callback = self;
    else
        callback = frame->f_trace;
    if (callback == NULL)
        return 0;
    result = call_trampoline(callback, frame, what, arg);

//call_trampoline
    stack[0] = (PyObject *)frame;
    stack[1] = whatstrings[what];
    stack[2] = (arg != NULL) ? arg : Py_None;

    /* call the Python-level function */
    result = _PyObject_FastCall(callback, stack, 3);

//ABSTRACT.H
    func = _PyVectorcall_Function(callable);
    if (func == NULL) {
        Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
        return _PyObject_MakeTpCall(callable, args, nargs, kwnames);
    }
    res = func(callable, args, nargsf, kwnames);
```
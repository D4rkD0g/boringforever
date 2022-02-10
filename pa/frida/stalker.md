[[Stalker]]的内容

尝试使用Golang的[CGO](https://chai2010.cn/advanced-go-programming-book/ch2-cgo/ch2-01-hello-cgo.html)来链接frida gum静态库

依旧是有个代码模板

```go
package wander

//#cgo LDFLAGS: ./wander/libfrida-gum.a -lpthread -ldl
//int smain();
//void slogan();
import "C"

func Slogan() {
    C.slogan()
}
```

在`import "C"`上边写一些C的编译指令或者代码，亦或把源码写进新的c文件中，后续就可以直接调用了

但是使用`gum_stalker_follow(stalker, pid, transformer, NULL)`，pid是go的exec.Command

[此除崩溃图而已，不重要]

猜测是go的线程，导致stalker的线程操作有问题

模板代码如下

```C
int main() {  
	gum_init_embedded();  
	if (!gum_stalker_is_supported()) {  
		gum_deinit_embedded();  
		return -1;  
	}  

	GumStalker* stalker = gum_stalker_new();  
	GumStalkerTransformer* transformer = gum_stalker_transformer_make_from_callback( print_insn, NULL, NULL);  
	gum_stalker_follow_me(stalker, transformer, NULL);  
	
	char *a = 0;  
	int b = 1024;  
	int c = b + 10;  

	gum_stalker_unfollow_me(stalker);  
	while (gum_stalker_garbage_collect(stalker))
		g_usleep(10000);

	g_object_unref(stalker);
	g_object_unref(transformer);
	gum_deinit_embedded();
  
}
```

所以换成了`gum_stalker_follow_me`，其后加入trace的源码
transformer回调函数是自己针对指令做的操作，比如打印汇编

```c
void print_insn(GumStalkerIterator* iterator, GumStalkerOutput* output, gpointer user_data) {  
	const cs_insn* instr;  
	while (gum_stalker_iterator_next(iterator, &instr)) {  
		g_print("Inst Addr 0x%lx\t:%s %s\n", instr->address, instr->mnemonic, instr->op_str);  
		gum_stalker_iterator_keep(iterator);  
	}  
}
```
[cs_insn](https://github.com/capstone-engine/capstone/blob/fee83fcc1ad096c22d4f2066ccb58ad1a76a9886/docs/Capstone-Engine-Documentation/Capstone-Engine%20Documentation.md#cs_insn)直接用的capstone

结果

```
Inst Addr @ 0x5560f369520a :mov qword ptr [rbp - 8], 0  
Inst Addr @ 0x5560f3695212 :mov dword ptr [rbp - 0x20], 0x400  
Inst Addr @ 0x5560f3695219 :mov eax, dword ptr [rbp - 0x20]  
Inst Addr @ 0x5560f369521c :add eax, 0xa  
Inst Addr @ 0x5560f369521f :mov dword ptr [rbp - 0x1c], eax  
Inst Addr @ 0x5560f3695222 :mov rax, qword ptr [rbp - 0x18]  
Inst Addr @ 0x5560f3695226 :mov rdi, rax  
Inst Addr @ 0x5560f3695229 :call 0x5560f36b5714
```

那么灵魂问题，为什么不用pin
大概因为stalker开源？？？而且其实大部分应用都是上层使用js

目前看到的基于stalker的二次开发有

1. [AFLplusplus](https://github.com/AFLplusplus/AFLplusplus/tree/7aced239e8a0855d87ecc921ba5691b29202ec1e/frida_mode)

入口在[afl_frida_start](https://github.com/AFLplusplus/AFLplusplus/blob/10dae419d6e3ebc38f53840c5abfe98e9c901217/frida_mode/src/main.c#L183)

stalker_start中`transformer = gum_stalker_transformer_make_from_callback(instrument_basic_block, NULL, NULL)`，instrument_basic_block -> [cmplog_instrument](https://github.com/AFLplusplus/AFLplusplus/blob/08ca4d54a55fe73e64a994c41a12af61f52e497e/frida_mode/src/cmplog/cmplog_x64.c#L288) -> cmplog_instrument_cmp_sub -> ... -> cmplog_handle_cmp_sub `__afl_cmp_map`中保存hash后的地址hit的次数等

gum_stalker_set_observer(stalker, GUM_STALKER_OBSERVER(observer));

2. 还有基于统计的漏洞root cause分析[Igor](https://github.com/HexHive/Igor/blob/main/IgorFuzz/utils/afl_frida/afl-frida.c)，其中用的也是AFLPP，但是和目前版本的不同

```C
/* What is the name of the library to fuzz */
#define TARGET_LIBRARY "libtestinstr.so"
/* What is the name of the function to fuzz */
#define TARGET_FUNCTION "testinstr"
/* here you need to specify the parameter for the target function */
static void *(*o_function)(uint8_t *, int);

dl = dlopen(argv[1], RTLD_LAZY);
o_function = dlsym(dl, argv[2]);

gum_stalker_follow_me(stalker, transformer, NULL);
while (__afl_persistent_loop(UINT32_MAX) != 0) {
	previous_pc = 0; // Required!

	// STEP 3: ensure the minimum length is present and setup the target
	// function to fuzz.

	if (*__afl_fuzz_len > 0) {
		__afl_fuzz_ptr[*__afl_fuzz_len] = 0; // if you need to null terminate
		(*o_function)(__afl_fuzz_ptr, *__afl_fuzz_len);
	}

	// END STEP 3
}

gum_stalker_unfollow_me(stalker);
```

3. Igor说有一部分代码来自[hotwa](https://github.com/meme/hotwax)，那么又不得不提到
4. [fpicker](https://github.com/ttdennis/fpicker)
5. 最后，USENIX21的[APICRAFT](https://github.com/occia/apicraft/blob/7ecbdd16e2d41132aa8840727602dd8e3b7c7b37/collect-n-combine/cfgs/cgpdf/cfgs/use-3-div.toml#L183)也用到了
不过目前来看，基本有相似，没有看到直接用pid的，不过fpicker还是用到了js

muhe师傅的[frida-gum代码阅读笔记](https://o0xmuhe.github.io/2019/11/15/frida-gum%E4%BB%A3%E7%A0%81%E9%98%85%E8%AF%BB/)以及文中提到jmpews师傅的[如何构建一款像 frida 一样的框架](https://bbs.pediy.com/thread-220794.htm)，以及看起来同样的[frida-gum源码解读](https://jmpews.github.io/2017/06/27/pwn/frida-gum%E6%BA%90%E7%A0%81%E8%A7%A3%E8%AF%BB/)



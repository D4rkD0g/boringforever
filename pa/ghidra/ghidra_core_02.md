



```C
int main(int argc,char **argv)

{
  int iVar1;
  int a;
  int input;
  
  if (argc == 2) {
    iVar1 = atoi(argv[1]);
    if (iVar1 < 3) {
      if (iVar1 == 0) {
        printf("Yes");
        iVar1 = -1;
      }
      else {
        iVar1 = 0;
      }
    }
    else {
      printf("No");
      iVar1 = 0;
    }
  }
  else {
    iVar1 = 0;
  }
  return iVar1;
}
```




```C
[afl++]root@aff060f84d2e:/lambdab/ghidra-master/Ghidra/Features/Decompiler/src/decompile/cpp# ./decomp_dbg -s /lambdab/ghidra-master/build/dist/ghidra_10.1_DEV/Ghidra/Processors/x86/data/languages/
[decomp]> load file test
WARNING: Language x86:LE:64:default
test successfully loaded: Intel/AMD 64-bit x86
[decomp]> load addr 0x1169
Function func_0x00001169: 0x00001169
[decomp]> decompile
Decompiling func_0x00001169
Decompilation complete
[decomp]> print C

xunknown8 func_0x00001169(int4 param_1,int8 param_2)

{
  int4 iVar1;
  xunknown8 xVar2;

  if (param_1 == 2) {
    iVar1 = func_0x00001070(*(xunknown8 *)(param_2 + 8));
    if (iVar1 < 3) {
      if (iVar1 == 0) {
        func_0x00001060(0x2007);
        xVar2 = 0xffffffff;
      }
      else {
        xVar2 = 0;
      }
    }
    else {
      func_0x00001060(0x2004);
      xVar2 = 0;
    }
  }
  else {
    xVar2 = 0;
  }
  return xVar2;
}
```



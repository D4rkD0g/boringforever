先说需求吧，想找一个能从顶层逻辑上直接分析代码，比如直接获取代码中的循环结构，但又比较方便、精确的工具  
joern可以算一个，这个semgrep也算是一个，但是两者都不支持C++，23333  

semgrep目前说支持17中语言，通过编写yaml规则，分析代码  
官方提供了简单的C相关规则[样例](https://semgrep.dev/docs/writing-rules/pattern-examples/)以及官方[github规则仓库](https://github.com/returntocorp/semgrep-rules/tree/develop/c/lang)，其中包含检测Double Free、UAF、危险函数，此外还有fix、pattern-either、metavariable-regex等规则语法  
trailofbits也有一个[规则仓库](https://github.com/trailofbits/semgrep-rules)，主要针对go和python  

国内的这篇[文章](https://www.anquanke.com/post/id/240028)算是比较好的工业应用经验贴了，其中对比了semgrep、sonercube和codeql，semgrep看起来就是快以及能够自动fix代码！  

可以pip直接安装，以下的yaml筛选python中的双重循环  

```yaml
rules:
  - id: loop 
    pattern: |
        for $X in $E1:
            for $Y in $E1:
                ...
    message: for
    severity: WARNING 
    languages: 
        - python
```

回到C语言的场景，想要筛选循环语句中的赋值片段，可以直接对着源码，写骨架类的东西  

```yaml
rules:
- id: test 
  pattern-either:
    - pattern: |
        for(int $E;$F;$G) {
            ...
            for(int $E1;$F1;$G1) {
                ...
                for(int $E2;$F2;$G2) {
                    ...
                    $A[$I] = $X;
                    ...
                }
            }
            ...
        }
    - pattern: for(;;){...}
    - pattern: |
        for($E1; $E2; $E3){
            ...
        }
    - pattern: |
        if($C){
            $E++;
        } else {
            $E--;
        }
  message: for
  severity: WARNING 
  languages: [c]
```

这个for循环就很神奇  

	for($E1; $E2; $E3) => for(i = 0; i < 10; i++)  
	for($E1; $E2; $E3) ❌=> for(int i = 0; i < 10; i++)  
	for(int $E1; $E2; $E3) => for(int i = 0; i < 10; i++)  


	int $X=$Y; => int i = 0;  
	int $X; => int j;  
	$X=$Y; => i = 1;  

```c
//testc/loop.c
int main() {
	for(int i = 0; i < 10; i++){
		int aa = 0;
		for(int j = 0; j <= 10; j++){
			char *a = "aaa";
			for(int k = 10; k > 0; k--){
				printf("%d", k);
				x[k] = j;
			}
			printf("123");
		} 
	
	}
	for(;;){
		printf("%d", k);
	}
	
	for(i = 0; i < 10; i++){
		printf("%d", k);
	}
	if (i > 5)
	{
		k++;
	} else {
		k--;
	}
	return 0;

}

```

筛选的结果如下：

```
$ semgrep --config loop.yaml  --max-lines-per-finding 100 testc
running 1 rules...
testc/loop.c
severity:warning rule:test: for
2:      for(int i = 0; i < 10; i++){
3:              int aa = 0;
4:              for(int j = 0; j <= 10; j++){
5:                      char *a = "aaa";
6:                      for(int k = 10; k > 0; k--){
7:                              printf("%d", k);
8:                              x[k] = j;
9:                      }
10:                     printf("123");
11:             }
12:
13:     }
--------------------------------------------------------------------------------
14:     for(;;){
15:             printf("%d", k);
16:     }
--------------------------------------------------------------------------------
18:     for(i = 0; i < 10; i++){
19:             printf("%d", k);
20:     }
--------------------------------------------------------------------------------
21:     if (i > 5)
22:     {
23:             k++;
24:     } else {
25:             k--;
26:     }
ran 1 rules on 1 files: 4 findings
```
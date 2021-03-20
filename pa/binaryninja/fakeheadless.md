真的是不同的IR各有各的不同  
一直纠结用哪种IR，既要考虑表示的信息准确，又要考虑相关生态完善，比如有一些直接能用的上层函数库  
最终用BNIL是因为，之前头脑一热续费了。不过BNIL中的HLIL还是不错的。。。  
之前Vector35团队在bluehat 2019中也有一个《Modern Binary Analysis with ILs》的议题  
印象中还有几篇paper来比较各种IR，比如ASE2017的《Testing Intermediate Representations for binary analysis》等  

穷人买的个人版，没有headless，之前有个[临时解决方案](https://github.com/D4rkD0g/2020_Record/blob/master/2020.05/week01/2020.05.05.md)，但总觉得每次手动reload太麻烦  
于是，最近新加入了watchdog机制，用了python的这个库，监控目录中的文件是否被修改，修改的话，直接reload，然后log看输出结果  

前几天没有加线程，导致shell一直“卡”住，不过不能用multiprocessing库，会报错  

```PYTHON
import sys
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, PatternMatchingEventHandler
import importlib
import binaryninja.log as log
import copy
import threading

'''
sys.path.append("Path To This File")
import wc
import importlib
importlib.reload(wc)
wc.main(bv)
'''

sys.path.append('.')
import bnm
log.log_to_stdout(True)

class ReFire(PatternMatchingEventHandler):
    def __init__(self, bn_view, patterns=['*.py'], ignore_patterns=None, ignore_directories=False, case_sensitive=False):
        super().__init__(patterns, ignore_patterns, ignore_directories, case_sensitive)
        self.bv = bn_view

    def on_any_event(self, event):
        msg = "[{}]: {} was {}".format(time.asctime(time.localtime(time.time())), event.src_path, event.event_type)
        self.fire(msg)

    def fire(self, msg):
        log.log(1, msg)
        importlib.reload(bnm)
        try:
            bnm.realmain(self.bv)
        except Exception as e:
            pass#log.log(2, e.msg)

class WatchChange(object):
    """docstring for WatchChange"""
    def __init__(self, bv):
        super(WatchChange, self).__init__()
        self.bv = bv
        self.path = sys.argv[1] if len(sys.argv) > 1 else 'Model Path'

    def watch(self):
        log.log(1, "load")
        
        refire = ReFire(bn_view=self.bv)
        observer = Observer()
        observer.schedule(refire, self.path, recursive=True)
        observer.start()
        try:
            while True:
                time.sleep(1)
        finally:
            observer.stop()
            observer.join()

    def handle(self):
        t = threading.Thread(target=self.watch)
        t.start()

def main(bv):
    wc = WatchChange(bv)
    wc.handle()

if __name__ == "__main__":
    main()
```

或许我应该改成plugin形式会更好一些  
翻了翻API，其中有个scriptingprovider的模块，没有弄清楚到底用来做什么的。。。  

那么HLIL到底有什么效果么？  
比如可以直接找到在循环中对内存赋值的语句  

```python
CIRCUEINS = [bn.HighLevelILOperation.HLIL_WHILE, bn.HighLevelILOperation.HLIL_WHILE_SSA, bn.HighLevelILOperation.HLIL_DO_WHILE, bn.HighLevelILOperation.HLIL_DO_WHILE_SSA, bn.HighLevelILOperation.HLIL_FOR, bn.HighLevelILOperation.HLIL_FOR_SSA]
MEMASSIGNINS = [bn.HighLevelILOperation.HLIL_ASSIGN_MEM_SSA, bn.HighLevelILOperation.HLIL_ASSIGN_UNPACK_MEM_SSA]

if insop in CIRCUEINS:
	pi("{}-{}".format(hex(insaddr), insop.name))
	for bi in func.body.lines:
		if bi.il_instruction.operation in MEMASSIGNINS:
			pi(bi.__str__())
```

部分结果 


```ASM
0x1afe07f08-HLIL_DO_WHILE_SSA
	*x11_2#2 @ mem#2 @ mem#3 = v0#2 @ mem#2
	*(x11_2#2 + 0x10) @ mem#3 @ mem#4 = arg5#2 @ mem#3
0x1afe07f8c-HLIL_DO_WHILE_SSA
	*(arg2#0 + (x22_1#2 << 2)) @ mem#16 @ mem#17 = v0#6.d @ mem#16
0x1afe09024-HLIL_WHILE_SSA
    *x10_1#2 @ mem#2 @ mem#3 = x8_6#1 @ mem#2
0x1afe08f80-HLIL_DO_WHILE_SSA
	*x8_3#2 @ mem#6 @ mem#7 = 1 @ mem#6
0x1afa7b808-HLIL_DO_WHILE_SSA
	*x9_1#2 @ mem#1 @ mem#2 = arg4#0 @ mem#1
	*(x9_1#2 + 0x10) @ mem#2 @ mem#3 = v0#2 @ mem#2
```

吐槽一下 不过为什么Call Graph还得自己做？没有什么现成的函数么？
